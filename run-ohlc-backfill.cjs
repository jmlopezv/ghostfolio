'use strict';
/**
 * Backfills the `OhlcBar` table with full daily OHLCV history from Yahoo.
 *
 * Why this exists: `MarketData` stores `marketPrice` only, so all ~628k stored
 * bars are close-only. ATR, VCP, volume dry-up, breakout confirmation and
 * Darvas boxes are therefore computable for *today* (from a live fetch) but
 * impossible to *backtest*. This script is what makes them testable.
 *
 * Safe to interrupt and re-run:
 *   - inserts use `skipDuplicates` against the (dataSource, date, symbol)
 *     unique index, so re-running never duplicates or deletes;
 *   - symbols that already have >= MIN_BARS rows are skipped unless --force.
 *
 * It never touches `MarketData`.
 *
 * Usage:
 *   node run-ohlc-backfill.cjs                 # 5y for every YAHOO profile
 *   node run-ohlc-backfill.cjs --range=10y
 *   node run-ohlc-backfill.cjs --force         # refetch even if covered
 *   node run-ohlc-backfill.cjs --limit=10      # smoke test
 *   node run-ohlc-backfill.cjs --symbol=AAPL   # single symbol
 */

const fs = require('node:fs');
const path = require('node:path');

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
// Yahoo's unauthenticated tolerance is generous (docs §6), but a backfill is a
// burst rather than the usual trickle, so pace it deliberately.
const THROTTLE_MS = 700;
const MAX_RETRIES = 3;
// Below this a symbol is treated as "not really covered" and gets refetched:
// roughly one year of sessions, so partial/failed runs self-heal.
const MIN_BARS = 240;

function parseArgs() {
  const args = {
    force: false,
    limit: null,
    range: '5y',
    symbol: null
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === '--force') args.force = true;
    else if (arg.startsWith('--range=')) args.range = arg.slice(8);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8));
    else if (arg.startsWith('--symbol=')) args.symbol = arg.slice(9);
  }

  return args;
}

/** Minimal .env reader — avoids assuming dotenv is wired up for plain node. */
function loadEnv() {
  if (process.env.DATABASE_URL) return;

  const envPath = path.join(__dirname, '.env');

  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);

    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One symbol's daily OHLCV with dates. Rows with a null/zero OHLC are dropped —
 * Yahoo emits those for halted or pre-listing sessions and a zero would poison
 * every downstream average. Returns null (never throws) so one bad symbol
 * cannot abort the run.
 */
async function fetchBars(yahooSymbol, range) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${CHART_URL}/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d`,
        { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal }
      );

      if (response.status === 429) {
        // Backoff and retry — rate limiting is transient, unlike a 404.
        await sleep(THROTTLE_MS * 10 * attempt);
        continue;
      }

      if (!response.ok) {
        return { bars: null, reason: `HTTP ${response.status}` };
      }

      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0];

      if (!quote?.close || timestamps.length === 0) {
        return { bars: null, reason: 'no data' };
      }

      const bars = [];

      for (let i = 0; i < timestamps.length; i++) {
        const epochSeconds = timestamps[i];
        const open = quote.open?.[i];
        const high = quote.high?.[i];
        const low = quote.low?.[i];
        const close = quote.close?.[i];
        const volume = quote.volume?.[i];

        if (
          typeof epochSeconds !== 'number' ||
          ![open, high, low, close].every(
            (value) => typeof value === 'number' && value > 0
          )
        ) {
          continue;
        }

        // Clamp the bar to its own extremes. Yahoo returns inconsistent OHLC
        // for some thinly-traded European listings (a high below the close,
        // say), which is impossible by definition and would produce a negative
        // true range downstream. The high is at least max(open, close) and the
        // low at most min(open, close), so this only ever repairs bad data.
        bars.push({
          close,
          date: new Date(epochSeconds * 1000).toISOString().slice(0, 10),
          high: Math.max(high, open, close),
          low: Math.min(low, open, close),
          open,
          volume: typeof volume === 'number' ? volume : 0
        });
      }

      return bars.length > 0
        ? { bars, reason: null }
        : { bars: null, reason: 'all rows invalid' };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        return { bars: null, reason: String(error?.message ?? error) };
      }

      await sleep(THROTTLE_MS * 4 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  return { bars: null, reason: 'retries exhausted' };
}

async function main() {
  loadEnv();

  const args = parseArgs();
  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  // Prisma 7 requires an explicit driver adapter — same construction as
  // PrismaService, so this script talks to exactly the same database.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  try {
    // The universe is the YAHOO asset profiles: MANUAL rows are the Nordnet
    // funds, which have no exchange listing and therefore no OHLCV anywhere.
    const profiles = await prisma.symbolProfile.findMany({
      orderBy: { symbol: 'asc' },
      select: { dataSource: true, symbol: true },
      where: args.symbol
        ? { dataSource: 'YAHOO', symbol: args.symbol }
        : { dataSource: 'YAHOO' }
    });

    const existing = await prisma.ohlcBar.groupBy({
      _count: { _all: true },
      by: ['symbol'],
      where: { dataSource: 'YAHOO' }
    });

    const coverage = new Map(
      existing.map((row) => [row.symbol, row._count._all])
    );

    let targets = profiles;

    if (!args.force) {
      targets = targets.filter(
        (profile) => (coverage.get(profile.symbol) ?? 0) < MIN_BARS
      );
    }

    if (args.limit) {
      targets = targets.slice(0, args.limit);
    }

    console.log(
      `[backfill] ${profiles.length} YAHOO profiles · ${coverage.size} already have bars · ${targets.length} to fetch · range=${args.range}`
    );

    let written = 0;
    let skipped = 0;
    const failures = [];

    for (let i = 0; i < targets.length; i++) {
      const { dataSource, symbol } = targets[i];
      const { bars, reason } = await fetchBars(symbol, args.range);

      if (!bars) {
        failures.push(`${symbol}: ${reason}`);
        skipped++;
      } else {
        const { count } = await prisma.ohlcBar.createMany({
          data: bars.map((bar) => ({
            close: bar.close,
            dataSource,
            date: new Date(`${bar.date}T00:00:00.000Z`),
            high: bar.high,
            low: bar.low,
            open: bar.open,
            symbol,
            volume: bar.volume
          })),
          skipDuplicates: true
        });

        written += count;
      }

      if ((i + 1) % 25 === 0 || i === targets.length - 1) {
        console.log(
          `[backfill] ${i + 1}/${targets.length} · ${written} rows written · ${skipped} skipped`
        );
      }

      await sleep(THROTTLE_MS);
    }

    const total = await prisma.ohlcBar.count();

    console.log(`\n[backfill] done · ${written} rows written · ${total} total`);

    if (failures.length > 0) {
      console.log(`[backfill] ${failures.length} symbol(s) had no data:`);
      for (const failure of failures) console.log(`  - ${failure}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[backfill] fatal:', error);
  process.exit(1);
});
