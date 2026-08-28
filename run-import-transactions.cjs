#!/usr/bin/env node
/**
 * Imports a Nordnet "transactions and notes" export into the Ghostfolio fork.
 *
 * This is the script that handles every future export: point it at a fresh CSV
 * and it writes only what is missing. Idempotent on (symbol, date, type,
 * quantity, unitPrice), so re-running the same file — or a longer export that
 * overlaps one already imported — writes nothing the second time.
 *
 * The export is UTF-16LE, tab-separated, Swedish column headers, and decimal
 * commas. Amounts in `Belopp` are always SEK; `Kurs` is in the instrument's own
 * currency; `Växlingskurs` is the SEK rate that connects them. Fees are stored
 * in the instrument's currency to match the rows already in the database
 * (EXV1.DE holds 4.41 EUR for a 49 SEK courtage).
 *
 * Some fills never reach the CSV — a same-day purchase is confirmed in the app
 * before the export catches up — so SUPPLEMENTAL below carries them explicitly.
 *
 * Usage:
 *   node run-import-transactions.cjs <export.csv>            # report only
 *   node run-import-transactions.cjs <export.csv> --apply    # write
 */

require('dotenv').config();

const fs = require('node:fs');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const THROTTLE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Nordnet's instrument name -> the Yahoo symbol this database already uses.
 *
 * Keyed by name rather than ISIN because the export's ISIN column is blank on
 * some fund rows, and because a wrong mapping here is silent: it would create a
 * second profile for an instrument already held and split the position in two.
 * Everything is listed explicitly for that reason — nothing is inferred.
 */
const SYMBOL_BY_NAME = {
  'Adidas AG': 'ADS.DE',
  'Aktiespararna Global Direktavkastning A':
    'AKTIESPARARNA_GLOBAL_DIREKTAVKASTNING',
  'Alphabet A': 'GOOGL',
  'Amazon.com': 'AMZN',
  Apple: 'AAPL',
  'Banco Santander SA': 'SAN.MC',
  'Hewlett Packard Enterprise': 'HPE',
  'iShares Gold Producers UCITS ETF USD (Acc)': 'IS0E.DE',
  'iShares MSCI Global Semiconductors UCITS ETF USD (Acc)': 'SEC0.DE',
  'iShares STOXX Europe 600 Banks UCITS ETF (DE)': 'EXV1.DE',
  'Nordnet Global Index': 'NORDNET_GLOBAL_INDEX',
  'Nordnet Norge Indeks': 'NORDNET_NORGE_INDEKS',
  'Nordnet Suomi Indeksi': '0P000134K9.F',
  'Nordnet Sverige Index': 'NORDNET_SVERIGE_INDEX',
  NVIDIA: 'NVDA',
  Oracle: 'ORCL',
  'Swedbank Robur Access Asien A': 'SWEDBANK_ROBUR_ACCESS_ASIEN',
  Walmart: 'WMT',
  'Xtrackers Nikkei 225 ETF 1D': 'XDJP.DE'
};

/**
 * Fills confirmed in the Nordnet app but not yet in any export.
 *
 * `sekPerUnit` is the SEK rate used to convert the SEK courtage into the
 * instrument's currency, matching what the CSV's `Växlingskurs` does for every
 * other row. These are matched against the database by the same idempotency
 * key as CSV rows, so leaving one here after it appears in a later export is
 * harmless — it simply stops being written.
 */
const SUPPLEMENTAL = [
  {
    // Order details screen, 2026-08-27 15:31:05 — 4 of 4 filled, avg 55.14.
    currency: 'USD',
    date: '2026-08-27',
    feeSek: 9,
    name: 'Hewlett Packard Enterprise',
    quantity: 4,
    sekPerUnit: 9.5327,
    type: 'BUY',
    unitPrice: 55.14
  }
];

const TYPE_BY_TRANSACTION = {
  KÖPT: 'BUY',
  SÅLT: 'SELL',
  UTDELNING: 'DIVIDEND'
};

/** Swedish decimal commas, thin spaces as thousand separators. */
function num(value) {
  if (value == null) {
    return null;
  }

  const cleaned = String(value).replace(/ |\s/g, '').replace(',', '.').trim();

  if (cleaned === '') {
    return null;
  }

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseExport(path) {
  const text = fs.readFileSync(path).toString('utf16le').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  const header = lines[0].split('\t').map((cell) => cell.trim());
  const index = (name) => header.indexOf(name);

  const columns = {
    amount: index('Belopp'),
    currency: index('Valuta'),
    date: index('Affärsdag'),
    fee: index('Total Avgift'),
    fx: index('Växlingskurs'),
    name: index('Värdepapper'),
    price: index('Kurs'),
    quantity: index('Antal'),
    total: index('Totalt antal'),
    type: index('Transaktionstyp')
  };

  const rows = [];

  for (const line of lines.slice(1)) {
    const cells = line.split('\t').map((cell) => cell.trim());
    const type = TYPE_BY_TRANSACTION[cells[columns.type]];

    if (!type) {
      continue; // deposits, withdrawals, interest — no Order to write
    }

    const name = cells[columns.name];
    const symbol = SYMBOL_BY_NAME[name];

    if (!symbol) {
      rows.push({ error: `no symbol mapping for "${name}"`, name });
      continue;
    }

    const fx = num(cells[columns.fx]);
    const feeSek = num(cells[columns.fee]) ?? 0;

    rows.push({
      date: cells[columns.date],
      // The fee column is SEK; every stored fee is in the instrument's
      // currency. Without an FX rate the instrument is SEK-denominated
      // (the Nordnet funds), so the figure already is what we want.
      fee: fx && fx > 0 ? feeSek / fx : feeSek,
      feeSek,
      name,
      quantity: num(cells[columns.quantity]),
      symbol,
      totalAfter: num(cells[columns.total]),
      type,
      unitPrice: num(cells[columns.price])
    });
  }

  return rows;
}

/** One bar per SESSION, stamped at UTC midnight. */
function toBars(result) {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars = [];
  const seen = new Set();

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

    // Yahoo's chart timestamp is the SESSION OPEN (13:30Z for New York), and
    // the hourly gatherer writes UTC midnight. Storing the raw timestamp puts
    // two rows in the table for the same trading day, which no unique
    // constraint catches because `date` is a DateTime — and every indicator
    // window counts array positions, so the day gets counted twice. Normalise.
    const dateStr = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

    if (seen.has(dateStr)) {
      continue;
    }

    seen.add(dateStr);
    bars.push({
      close,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      open,
      volume
    });
  }

  return bars;
}

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

async function fetchChart(symbol) {
  const response = await fetch(
    `${CHART_URL}/${encodeURIComponent(symbol)}?range=5y&interval=1d`,
    {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(30000)
    }
  );

  const body = await response.json();

  return body?.chart?.result?.[0] ?? null;
}

async function main() {
  const path = process.argv[2];
  const apply = process.argv.includes('--apply');

  if (!path) {
    console.error(
      'usage: node run-import-transactions.cjs <export.csv> [--apply]'
    );
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const parsed = parseExport(path);
  const unmapped = parsed.filter((row) => row.error);

  if (unmapped.length > 0) {
    for (const row of unmapped) {
      console.error(`  ! ${row.error}`);
    }
    console.error('\nRefusing to import with unmapped instruments — a missing');
    console.error(
      'mapping would create a duplicate profile and split a position.'
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const supplemental = SUPPLEMENTAL.map((entry) => ({
    date: entry.date,
    fee: entry.feeSek / entry.sekPerUnit,
    feeSek: entry.feeSek,
    name: entry.name,
    quantity: entry.quantity,
    supplemental: true,
    symbol: SYMBOL_BY_NAME[entry.name],
    type: entry.type,
    unitPrice: entry.unitPrice
  }));

  const all = [...parsed, ...supplemental].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const [user] = await prisma.user.findMany({ select: { id: true }, take: 1 });
  const [account] = await prisma.account.findMany({
    select: { id: true },
    take: 1,
    where: { userId: user.id }
  });

  const profiles = await prisma.symbolProfile.findMany({
    select: { currency: true, id: true, symbol: true }
  });
  const profileBySymbol = new Map(profiles.map((p) => [p.symbol, p]));

  const existing = await prisma.order.findMany({
    select: {
      date: true,
      fee: true,
      id: true,
      quantity: true,
      symbolProfileId: true,
      type: true,
      unitPrice: true
    },
    where: { userId: user.id }
  });

  /**
   * A transaction is "already present" on instrument, side, quantity and price
   * within a few days — NOT on an exact date.
   *
   * The rows already in the database do not agree with the export on which day
   * a trade belongs to: Apple's 2025-12-24 `Affärsdag` is stored as 12-23,
   * while Nordnet Global Index's 2025-12-31 is stored as 2026-01-01. Matching
   * on an exact date would import every one of them a second time and double
   * the position. Three days is wide enough to absorb a trade/settlement or
   * timezone shift and far too narrow to collide with a genuine repeat
   * purchase — the two Apple dividends that share a quantity and a price are
   * three months apart.
   */
  const MATCH_WINDOW_DAYS = 3;

  const dayNumber = (dateStr) =>
    Math.round(new Date(`${dateStr}T00:00:00.000Z`).getTime() / 86400000);

  const findExisting = (profileId, row) =>
    existing.find(
      (order) =>
        order.symbolProfileId === profileId &&
        order.type === row.type &&
        Math.abs(order.quantity - row.quantity) < 1e-4 &&
        Math.abs(order.unitPrice - row.unitPrice) < 1e-4 &&
        Math.abs(
          dayNumber(order.date.toISOString().slice(0, 10)) - dayNumber(row.date)
        ) <= MATCH_WINDOW_DAYS
    );

  const missingSymbols = [
    ...new Set(
      all.map((row) => row.symbol).filter((s) => !profileBySymbol.has(s))
    )
  ];

  console.log(
    `Parsed ${parsed.length} transactions + ${supplemental.length} supplemental.`
  );
  console.log(
    `${missingSymbols.length} instrument(s) need a profile: ${missingSymbols.join(', ') || '(none)'}`
  );

  // ---- create profiles + history for anything new
  for (const symbol of missingSymbols) {
    const result = await fetchChart(symbol);

    if (!result?.meta?.currency) {
      console.error(`  ! ${symbol}: no chart data — skipping`);
      continue;
    }

    const { assetClass, assetSubClass } = classify(result);
    const bars = toBars(result);
    const name = result.meta?.longName ?? result.meta?.shortName ?? symbol;

    console.log(
      `  + ${symbol.padEnd(9)} ${result.meta.currency} ${assetSubClass.padEnd(9)} ${bars.length} bars  ${name}`
    );

    if (!apply) {
      profileBySymbol.set(symbol, {
        currency: result.meta.currency,
        id: `dry-${symbol}`,
        symbol
      });
      await sleep(THROTTLE_MS);
      continue;
    }

    const profile = await prisma.symbolProfile.create({
      data: {
        assetClass,
        assetSubClass,
        currency: result.meta.currency,
        dataSource: 'YAHOO',
        name,
        symbol
      },
      select: { currency: true, id: true, symbol: true }
    });

    profileBySymbol.set(symbol, profile);

    if (bars.length > 0) {
      await prisma.ohlcBar.createMany({
        data: bars.map((bar) => ({ ...bar, dataSource: 'YAHOO', symbol })),
        skipDuplicates: true
      });
      await prisma.marketData.createMany({
        data: bars.map(({ close, date }) => ({
          dataSource: 'YAHOO',
          date,
          marketPrice: close,
          symbol
        })),
        skipDuplicates: true
      });
    }

    await sleep(THROTTLE_MS);
  }

  // ---- orders
  const toWrite = [];
  const feeFixes = [];
  let skipped = 0;

  for (const row of all) {
    const profile = profileBySymbol.get(row.symbol);

    if (!profile) {
      console.error(`  ! ${row.symbol}: no profile — skipping ${row.date}`);
      continue;
    }

    const match = findExisting(profile.id, row);

    if (match) {
      skipped++;

      // The export is authoritative on what was actually paid. The oldest rows
      // were entered by hand with fee 0 where 49 SEK was charged, which would
      // flatter every return computed from them.
      if (Math.abs((match.fee ?? 0) - row.fee) > 0.01) {
        feeFixes.push({ match, profile, row });
      }

      continue;
    }

    // Guard against a duplicate INSIDE this run (an export overlapping its own
    // supplemental entry) as well as against the database.
    existing.push({
      date: new Date(`${row.date}T00:00:00.000Z`),
      fee: row.fee,
      id: null,
      quantity: row.quantity,
      symbolProfileId: profile.id,
      type: row.type,
      unitPrice: row.unitPrice
    });
    toWrite.push({ profile, row });
  }

  console.log(`\n${skipped} already present, ${toWrite.length} to write:\n`);

  for (const { profile, row } of toWrite) {
    console.log(
      `  ${row.date}  ${row.type.padEnd(9)} ${row.symbol.padEnd(9)} ` +
        `${String(row.quantity).padEnd(9)} @ ${String(row.unitPrice).padEnd(10)} ` +
        `fee ${row.fee.toFixed(2)} ${profile.currency}` +
        `${row.supplemental ? '   (supplemental)' : ''}`
    );
  }

  if (feeFixes.length > 0) {
    console.log(`\n${feeFixes.length} fee correction(s) from the export:\n`);

    for (const { match, profile, row } of feeFixes) {
      console.log(
        `  ${row.date}  ${row.type.padEnd(9)} ${row.symbol.padEnd(9)} ` +
          `${(match.fee ?? 0).toFixed(2)} -> ${row.fee.toFixed(2)} ${profile.currency}` +
          `   (${row.feeSek} SEK)`
      );
    }
  }

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    await prisma.$disconnect();
    return;
  }

  for (const { profile, row } of toWrite) {
    await prisma.order.create({
      data: {
        accountId: account.id,
        accountUserId: user.id,
        currency: profile.currency,
        date: new Date(`${row.date}T00:00:00.000Z`),
        fee: Number(row.fee.toFixed(4)),
        quantity: row.quantity,
        symbolProfileId: profile.id,
        type: row.type,
        unitPrice: row.unitPrice,
        userId: user.id
      }
    });
  }

  for (const { match, row } of feeFixes) {
    await prisma.order.update({
      data: { fee: Number(row.fee.toFixed(4)) },
      where: { id: match.id }
    });
  }

  console.log(
    `\nWrote ${toWrite.length} order(s), corrected ${feeFixes.length} fee(s).`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
