#!/usr/bin/env node
/**
 * Universe hygiene: cross-listing duplicates and bogus OHLC rows.
 *
 * Two problems, both of which quietly distort the cross-sectional ranking:
 *
 * 1. CROSS-LISTING DUPLICATES. The same business tracked on two venues (or as
 *    both an ADR and its local listing) occupies two slots in the 1-99 RS
 *    percentile, and can surface twice in one alert. The duplicate is not
 *    wrong data — it is the same company counted twice.
 *
 * 2. A MUTUAL FUND WITH PRICE BARS. `0P000134K9.F` carries OhlcBar rows whose
 *    volume is 100% zero. It is the only fund with bars at all; the other 71
 *    correctly have none. Zero volume makes both VCP volume tests meaningless,
 *    so the rows are worse than absent.
 *
 * SHARE CLASSES ARE NOT DUPLICATES and are deliberately left alone
 * (INVE-A/B.ST, ERIC-A/B.ST): separate listings, different liquidity and voting
 * rights, independently tradeable.
 *
 * Reports by default. Pass --apply to make changes. Never removes a symbol with
 * an open position or any activity history, regardless of flags.
 *
 * Usage:
 *   node run-universe-cleanup.cjs            # report only
 *   node run-universe-cleanup.cjs --apply    # perform the removals
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

/** Cross-listings of one business. The survivor is chosen by dollar volume. */
const DUPLICATE_PAIRS = [
  ['AIR.DE', 'AIR.PA'],
  ['ASM.AS', 'ASMIY'],
  ['HSBA.L', 'HSBC'],
  ['ING', 'INGA.AS'],
  ['RHHBY', 'RO.SW'],
  ['RYA.IR', 'RYAAY'],
  ['ULVR.L', 'UNA.AS']
];

/** A fund that should never have had price bars. */
const BOGUS_BAR_SYMBOLS = ['0P000134K9.F'];

const LOOKBACK_DAYS = 50;
/** Mirrors SIGNAL_SCREEN_MIN_DOLLAR_VOLUME in libs/common/src/lib/config.ts. */
const MIN_DOLLAR_VOLUME = 5_000_000;

/**
 * Latest USD->currency rates, keyed by currency code.
 *
 * Comparing two listings' turnover without this is meaningless: the pair is
 * quoted in different currencies, so `close * volume` is in different units on
 * each side. It is not a rounding issue — HSBA.L quoted in pence against HSBC
 * quoted in dollars overstates London by a factor of ~135.
 */
async function loadFxRates(prisma) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT ON (symbol) symbol, "marketPrice"::float8 AS rate
    FROM "MarketData"
    WHERE symbol ~ '^USD[A-Z]{3}$'
    ORDER BY symbol, date DESC
  `;

  const rates = { USD: 1 };

  for (const { rate, symbol } of rows) {
    if (rate > 0) {
      rates[symbol.slice(3)] = rate;
    }
  }

  return rates;
}

/**
 * Native turnover converted to USD.
 *
 * `GBp` is London's pence quote, not a currency of its own — Yahoo reports
 * `.L` prices in pence while the FX table only knows GBP, so it is divided by
 * 100 first. Missing that is how a UK listing appears 100x more liquid than it
 * is.
 */
function toUsd({ currency, rates, value }) {
  if (currency === 'GBp') {
    const gbp = rates.GBP;

    return gbp > 0 ? value / 100 / gbp : null;
  }

  const rate = rates[currency];

  return rate > 0 ? value / rate : null;
}

async function dollarVolume(prisma, { currency, rates, symbol }) {
  const rows = await prisma.$queryRaw`
    SELECT AVG(close * volume)::float8 AS adv, COUNT(*)::int AS bars
    FROM "OhlcBar"
    WHERE symbol = ${symbol}
      AND date > NOW() - (${LOOKBACK_DAYS} || ' days')::interval
  `;

  const native = rows?.[0]?.adv ?? 0;
  const usd = toUsd({ currency, rates, value: native });

  return { adv: usd, bars: rows?.[0]?.bars ?? 0, currency };
}

/**
 * Anything the user actually owns or has traded is off limits. Removing it
 * would orphan the activity's asset profile, and the point of this script is
 * ranking hygiene, not touching the portfolio.
 */
async function isProtected(prisma, symbol) {
  const orders = await prisma.order.count({
    where: { SymbolProfile: { symbol } }
  });

  return orders > 0;
}

function fmt(value) {
  if (!(value > 0)) {
    return '—';
  }

  return value >= 1e6
    ? `$${(value / 1e6).toFixed(1)}M`
    : `$${(value / 1e3).toFixed(0)}k`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const drops = [];
  const rates = await loadFxRates(prisma);

  console.log(
    `\n=== Cross-listing duplicates (${LOOKBACK_DAYS}-day average dollar volume) ===\n`
  );

  for (const pair of DUPLICATE_PAIRS) {
    const stats = [];

    for (const symbol of pair) {
      const profile = await prisma.symbolProfile.findFirst({
        select: { currency: true, name: true, symbol: true },
        where: { symbol }
      });

      if (!profile) {
        stats.push({ adv: -1, bars: 0, missing: true, symbol });
        continue;
      }

      const { adv, bars, currency } = await dollarVolume(prisma, {
        currency: profile.currency,
        rates,
        symbol
      });

      stats.push({
        adv,
        bars,
        currency,
        missing: false,
        name: profile.name,
        protected: await isProtected(prisma, symbol),
        symbol
      });
    }

    // An unconvertible currency means the comparison cannot be trusted; say so
    // rather than silently ranking on a number that is in the wrong units.
    if (stats.some(({ adv, missing }) => !missing && adv === null)) {
      console.log(
        `  ${pair.join(' / ')}: missing FX rate — cannot compare, skipping\n`
      );
      continue;
    }

    if (stats.some(({ missing }) => missing)) {
      console.log(`  ${pair.join(' / ')}: not both tracked — nothing to do\n`);
      continue;
    }

    const [keep, drop] = [...stats].sort((a, b) => b.adv - a.adv);

    console.log(`  ${keep.name ?? pair[0]}`);
    for (const s of stats) {
      console.log(
        `    ${s.symbol.padEnd(10)} ADV ${fmt(s.adv).padStart(8)} ` +
          `(${String(s.currency).padEnd(3)})  ` +
          `${String(s.bars).padStart(4)} bars${s.protected ? '  [HELD]' : ''}`
      );
    }

    if (drop.protected) {
      console.log(
        `    -> KEEP BOTH: ${drop.symbol} has trade history and is never removed\n`
      );
      continue;
    }

    console.log(`    -> keep ${keep.symbol}, drop ${drop.symbol}\n`);
    drops.push(drop.symbol);
  }

  // Reported, never auto-removed. These names are already excluded from leader
  // signals by the SIGNAL_SCREEN_MIN_DOLLAR_VOLUME gate, so they are wasteful
  // rather than dangerous — but each still occupies a slot in the 1-99 RS
  // percentile, which is a ranking against names you could not actually buy.
  console.log(
    `=== Below the $${(MIN_DOLLAR_VOLUME / 1e6).toFixed(0)}M liquidity floor (review, not auto-dropped) ===\n`
  );

  const illiquid = await prisma.$queryRaw`
    WITH fx AS (
      SELECT DISTINCT ON (symbol) substring(symbol FROM 4) AS cur,
             "marketPrice"::float8 AS rate
      FROM "MarketData" WHERE symbol ~ '^USD[A-Z]{3}$'
      ORDER BY symbol, date DESC
    ),
    adv AS (
      SELECT symbol, AVG(close * volume)::float8 AS native
      FROM "OhlcBar"
      WHERE date > NOW() - (${LOOKBACK_DAYS} || ' days')::interval
      GROUP BY symbol
    )
    SELECT a.symbol, sp.currency,
           a.native / CASE
             WHEN sp.currency = 'GBp'
               THEN 100 * COALESCE((SELECT rate FROM fx WHERE cur = 'GBP'), 1)
             ELSE COALESCE((SELECT rate FROM fx WHERE cur = sp.currency), 1)
           END AS adv_usd
    FROM adv a
    JOIN "SymbolProfile" sp ON sp.symbol = a.symbol
    WHERE sp."assetSubClass" = 'STOCK'
    ORDER BY adv_usd ASC
  `;

  const below = illiquid.filter(({ adv_usd }) => adv_usd < MIN_DOLLAR_VOLUME);

  for (const { adv_usd, currency, symbol } of below.slice(0, 20)) {
    console.log(
      `  ${symbol.padEnd(14)} ${fmt(adv_usd).padStart(8)} (${currency})`
    );
  }

  console.log(
    `\n  ${below.length} of ${illiquid.length} tracked stocks are below the floor.\n`
  );

  console.log('=== Mutual funds carrying price bars ===\n');

  const bogus = [];

  for (const symbol of BOGUS_BAR_SYMBOLS) {
    const rows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS bars,
             COUNT(*) FILTER (WHERE volume = 0)::int AS zero_volume
      FROM "OhlcBar" WHERE symbol = ${symbol}
    `;
    const bars = rows?.[0]?.bars ?? 0;
    const zero = rows?.[0]?.zero_volume ?? 0;

    console.log(
      `  ${symbol.padEnd(14)} ${bars} bars, ${zero} zero-volume` +
        (bars > 0 ? '  -> delete bars' : '  -> already clean')
    );

    if (bars > 0) {
      bogus.push(symbol);
    }
  }

  if (!apply) {
    console.log(
      `\nReport only. ${drops.length} watchlist removals and ${bogus.length} bar deletions pending.` +
        `\nRe-run with --apply to perform them.\n`
    );
    await prisma.$disconnect();

    return;
  }

  console.log('\n=== Applying ===\n');

  for (const symbol of drops) {
    // Detach through the relation rather than deleting from the implicit join
    // table by hand. In `_UserWatchlist` the columns are named A and B, ordered
    // alphabetically by model: A is SymbolProfile, B is User. A raw DELETE that
    // guesses wrong matches zero rows and reports success — which is exactly
    // what an earlier version of this script did.
    //
    // The asset profile itself is kept, so the gathered history survives if the
    // symbol is ever re-added.
    const profiles = await prisma.symbolProfile.findMany({
      select: { id: true },
      where: { symbol }
    });

    let unwatched = 0;

    for (const { id } of profiles) {
      const before = await prisma.symbolProfile.findUnique({
        select: { _count: { select: { watchedBy: true } } },
        where: { id }
      });

      await prisma.symbolProfile.update({
        data: { watchedBy: { set: [] } },
        where: { id }
      });

      unwatched += before?._count?.watchedBy ?? 0;
    }

    console.log(`  unwatched ${symbol} (${unwatched} watcher link(s) removed)`);
  }

  for (const symbol of bogus) {
    const deleted = await prisma.ohlcBar.deleteMany({ where: { symbol } });
    console.log(`  deleted ${deleted.count} OhlcBar rows for ${symbol}`);
  }

  console.log('\nDone.\n');
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
