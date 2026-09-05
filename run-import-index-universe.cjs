#!/usr/bin/env node
/**
 * Imports index constituents: asset profile, watchlist link, and full history.
 *
 * The HTTP route for this (`POST /signals/catalog/import`) is JWT-gated, which
 * is right for a web endpoint and wrong for a bulk backfill of several hundred
 * symbols. This script does the same work directly against the database, in the
 * same order `WatchlistService.createWatchlistItem` does:
 *
 *   1. create the SymbolProfile if missing (name, currency, class, sector)
 *   2. link it to the user's watchlist
 *   3. gather history
 *
 * Step 3 is folded into the same pass rather than left to the hourly gather job,
 * which only looks back 7 days — far too short for SMA200 or 12-month momentum,
 * so a freshly added symbol would sit unscoreable for months. One chart request
 * per symbol fills BOTH stores: `MarketData` (closes, used by the indicators and
 * composite score) and `OhlcBar` (open/high/low/close/volume, used by ATR, the
 * VCP detector and the cross-sectional ranking).
 *
 * Idempotent: existing profiles are left alone, and both stores upsert.
 *
 * Usage:
 *   node run-import-index-universe.cjs --dry-run   # report what would happen
 *   node run-import-index-universe.cjs             # import everything missing
 *   node run-import-index-universe.cjs --limit 20  # a small first batch
 */

require('dotenv').config();

const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** Matches run-ohlc-backfill.cjs — comfortably inside Yahoo's tolerance. */
const THROTTLE_MS = 700;
const MAX_RETRIES = 3;
const HISTORY_YEARS = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs() {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf('--limit');

  return {
    dryRun: argv.includes('--dry-run'),
    limit: limitIndex === -1 ? null : Number(argv[limitIndex + 1])
  };
}

function readConstituents() {
  const source = fs.readFileSync(
    'libs/common/src/lib/index-constituents.ts',
    'utf8'
  );

  return [...source.matchAll(/^ {2}'([^']+)',?$/gm)].map((match) => match[1]);
}

/**
 * One chart request, returning the profile metadata and the full daily series.
 *
 * `events=div|split` is omitted deliberately: this fork stores raw closes, and
 * the adjusted series would silently disagree with the OhlcBar rows already
 * gathered for existing symbols.
 */
async function fetchSymbol(symbol) {
  const from = Math.floor(
    new Date(
      new Date().setFullYear(new Date().getFullYear() - HISTORY_YEARS)
    ).getTime() / 1000
  );
  const to = Math.floor(Date.now() / 1000);
  const url =
    `${CHART_URL}/${encodeURIComponent(symbol)}` +
    `?period1=${from}&period2=${to}&interval=1d`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30000)
      });

      if (response.status === 429) {
        await sleep(THROTTLE_MS * 10 * attempt);
        continue;
      }

      const body = await response.json();
      const result = body?.chart?.result?.[0];

      if (!result) {
        return {
          error: body?.chart?.error?.description ?? `HTTP ${response.status}`
        };
      }

      return { result };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        return { error: `${error?.message ?? error}` };
      }

      await sleep(THROTTLE_MS * 4 * attempt);
    }
  }

  return { error: 'exhausted retries' };
}

/**
 * Daily bars from a chart response, with the OHLC invariant enforced.
 *
 * Yahoo occasionally returns a high below the open/close (or a low above them)
 * on thin non-US listings — 1,045 such rows were found during the first OHLC
 * backfill. Clamping at ingest is the same fix applied in `OhlcService`.
 */
function toBars(result) {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars = [];

  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];

    if (
      open == null ||
      high == null ||
      low == null ||
      close == null ||
      volume == null
    ) {
      continue;
    }

    bars.push({
      close,
      // UTC MIDNIGHT, not the raw epoch. Yahoo timestamps a daily bar at the
      // market OPEN (13:30 UTC for US names, 07:00/08:00 for European ones), and
      // both target tables key a day by its timestamp. Storing the open instant
      // here wrote a second row for days the gather had already stored at
      // midnight - invisible to `skipDuplicates`, which compares the full
      // timestamp - and every indexed-by-position indicator (RS lookbacks, SMA,
      // ATR, 52-week high) then read a series with duplicated days.
      date: new Date(
        new Date(timestamps[i] * 1000).toISOString().slice(0, 10) +
          'T00:00:00.000Z'
      ),
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      open,
      volume
    });
  }

  return bars;
}

/** Yahoo's instrument type mapped onto Ghostfolio's asset classification. */
function classify(result) {
  const type = (result.meta?.instrumentType ?? '').toUpperCase();

  if (type === 'ETF') {
    return { assetClass: 'EQUITY', assetSubClass: 'ETF' };
  }

  if (type === 'MUTUALFUND') {
    return { assetClass: 'EQUITY', assetSubClass: 'MUTUALFUND' };
  }

  return { assetClass: 'EQUITY', assetSubClass: 'STOCK' };
}

async function main() {
  const { dryRun, limit } = parseArgs();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const constituents = readConstituents();

  const user = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    where: { role: { not: 'DEMO' } }
  });

  if (!user) {
    throw new Error('No non-demo user to attach the watchlist to');
  }

  const existing = new Map(
    (
      await prisma.symbolProfile.findMany({
        select: { id: true, symbol: true },
        where: { dataSource: 'YAHOO' }
      })
    ).map(({ id, symbol }) => [symbol, id])
  );

  const watched = new Set(
    (
      await prisma.symbolProfile.findMany({
        select: { symbol: true },
        where: { dataSource: 'YAHOO', watchedBy: { some: { id: user.id } } }
      })
    ).map(({ symbol }) => symbol)
  );

  let targets = constituents.filter(
    (symbol) => !existing.has(symbol) || !watched.has(symbol)
  );

  if (limit > 0) {
    targets = targets.slice(0, limit);
  }

  console.log(
    `\n${constituents.length} constituents. ${targets.length} need work ` +
      `(missing profile or not watched).\n`
  );

  if (dryRun) {
    console.log('--dry-run: no changes. First 20 targets:');
    console.log('  ' + targets.slice(0, 20).join(' '));
    await prisma.$disconnect();

    return;
  }

  const started = Date.now();
  let created = 0;
  let linked = 0;
  let barsWritten = 0;
  let marketDataWritten = 0;
  const failed = [];

  for (const [index, symbol] of targets.entries()) {
    let profileId = existing.get(symbol);

    try {
      // A symbol that already has a profile only needs the watchlist link;
      // re-fetching its history would redo work the backfill already did.
      if (!profileId) {
        const { error, result } = await fetchSymbol(symbol);

        if (error) {
          failed.push({ reason: error, symbol });
          await sleep(THROTTLE_MS);
          continue;
        }

        const currency = result.meta?.currency;

        if (!currency) {
          failed.push({ reason: 'no currency in chart meta', symbol });
          await sleep(THROTTLE_MS);
          continue;
        }

        const { assetClass, assetSubClass } = classify(result);

        const profile = await prisma.symbolProfile.create({
          data: {
            assetClass,
            assetSubClass,
            currency,
            dataSource: 'YAHOO',
            name: result.meta?.longName ?? result.meta?.shortName ?? symbol,
            symbol
          },
          select: { id: true }
        });

        profileId = profile.id;
        existing.set(symbol, profileId);
        created++;

        const bars = toBars(result);

        if (bars.length > 0) {
          const ohlc = await prisma.ohlcBar.createMany({
            data: bars.map((bar) => ({ ...bar, dataSource: 'YAHOO', symbol })),
            skipDuplicates: true
          });
          barsWritten += ohlc.count;

          const market = await prisma.marketData.createMany({
            data: bars.map(({ close, date }) => ({
              dataSource: 'YAHOO',
              date,
              marketPrice: close,
              symbol
            })),
            skipDuplicates: true
          });
          marketDataWritten += market.count;
        }

        await sleep(THROTTLE_MS);
      }

      if (!watched.has(symbol)) {
        await prisma.symbolProfile.update({
          data: { watchedBy: { connect: { id: user.id } } },
          where: { id: profileId }
        });
        watched.add(symbol);
        linked++;
      }
    } catch (error) {
      failed.push({ reason: `${error?.message ?? error}`, symbol });
    }

    if ((index + 1) % 25 === 0) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = (index + 1) / elapsed;
      const remaining = Math.round((targets.length - index - 1) / rate / 60);

      console.log(
        `  ${index + 1}/${targets.length} — ${created} profiles, ` +
          `${barsWritten.toLocaleString()} bars, ~${remaining} min left`
      );
    }
  }

  console.log(
    `\nCreated ${created} profiles, linked ${linked} to the watchlist.` +
      `\nWrote ${barsWritten.toLocaleString()} OhlcBar and ` +
      `${marketDataWritten.toLocaleString()} MarketData rows.`
  );

  if (failed.length > 0) {
    console.log(`\nFailed (${failed.length}):`);
    for (const { reason, symbol } of failed) {
      console.log(`  ${symbol.padEnd(12)} ${reason}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
