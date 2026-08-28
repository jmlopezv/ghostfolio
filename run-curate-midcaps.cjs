#!/usr/bin/env node
/**
 * Curates a shortlist of UK + Continental European mid-caps to add to the
 * tracked universe.
 *
 * Read-only: fetches from Yahoo, reads SymbolProfile, writes nothing back.
 * Every network phase caches to the scratchpad so a rate-limited run resumes
 * instead of starting over.
 *
 * Why not `FundamentalsService.computeScore`: it weights valuation at 0.30 as
 * `100 - forwardPE * 2`, so a name at 40x forward earnings scores 20 on that
 * term. Minervini's leaders characteristically trade at premium multiples, so
 * ranking that way would systematically demote the names the Trend Template
 * screen exists to find. The curation score below is growth/quality weighted
 * and uses P/E only as an outlier guard; both scores are printed per name so
 * the disagreement is visible rather than hidden.
 *
 * Usage:
 *   node run-curate-midcaps.cjs --resolve       # phase 1: ticker -> Yahoo symbol
 *   node run-curate-midcaps.cjs --fundamentals  # phase 2: quoteSummary
 *   node run-curate-midcaps.cjs --report        # phase 3: filter, score, table
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const YahooFinance = require('yahoo-finance2').default;

const SCRATCH =
  process.env.CURATE_SCRATCH ||
  'C:/Users/ah99752/AppData/Local/Temp/claude/C--DEV/24893875-d85e-4f92-83a4-174b3a1e689e/scratchpad';

const POOL = path.join(SCRATCH, 'pool.json');
const RESOLVED = path.join(SCRATCH, 'midcap-resolved.json');
const FUNDAMENTALS = path.join(SCRATCH, 'midcap-fundamentals.json');

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const THROTTLE_MS = 300;

// Matches SIGNAL_SCREEN_MIN_DOLLAR_VOLUME. A name below the floor the leader
// screen already refuses to signal on would be permanent dead weight in the
// cross-sectional RS percentile.
const MIN_DOLLAR_VOLUME = 5_000_000;
const MIN_MARKET_CAP_EUR = 2e9;
const MAX_MARKET_CAP_EUR = 20e9;
const MAX_FORWARD_PE = 60;
const TARGET = 100;
const TARGET_UK = 40;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = (file, fallback) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
const writeJson = (file, value) =>
  fs.writeFileSync(file, JSON.stringify(value));

// ---------------------------------------------------------------- FX

// Yahoo reports marketCap in the listing currency; the mid-cap band is in EUR.
async function loadFxToEur(currencies) {
  const rates = { EUR: 1 };

  for (const currency of currencies) {
    const base = currency === 'GBp' ? 'GBP' : currency;

    if (rates[base] !== undefined) {
      continue;
    }

    const response = await fetch(
      `${CHART_URL}/${base}EUR=X?range=5d&interval=1d`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000)
      }
    );
    const body = await response.json();
    const rate = body?.chart?.result?.[0]?.meta?.regularMarketPrice;

    if (!rate) {
      throw new Error(`No FX rate for ${base}`);
    }

    rates[base] = rate;
    await sleep(THROTTLE_MS);
  }

  // The LSE quotes in pence and Yahoo labels the currency GBp, but it reports
  // marketCap in whole pounds (HSBA: 262.7e9 at a 1533.2 GBp close is 17.1bn
  // shares, which is right; 262.7e9 pence would be a 2.6bn-pound HSBC). So a
  // price-derived figure converts at the pence rate and marketCap at the pound
  // rate - the one place the two must not share a divisor.
  rates.GBp = rates.GBP / 100;

  return rates;
}

/** marketCap is quoted in the major unit even where the price is not. */
const capRate = (rates, currency) =>
  rates[currency === 'GBp' ? 'GBP' : currency];

/**
 * Yahoo divides a pence price by a pounds EPS on most LSE lines, inflating the
 * ratio 100x: AZN.L reports 1065 for a real 10.7. It does not do it on all of
 * them - UKW.L (9.5) and BBOX.L (16.8) arrive already in pounds - so rescaling
 * every GBp name would corrupt the ones that were right.
 *
 * Rescale only the inflated ones, then discard anything that lands implausibly
 * cheap: that is exactly how a genuinely 100x+ name looks after a divide it did
 * not deserve, and a sub-3x forward multiple on a real mid-cap is a data
 * artefact far more often than a bargain. Discarded means unknown, not zero.
 */
function normalizeForwardPE(value, currency) {
  if (value === null || value === undefined) {
    return null;
  }

  if (currency === 'GBp' && value > 100) {
    const rescaled = value / 100;

    return rescaled < 3 ? null : rescaled;
  }

  return value;
}

// ------------------------------------------------------- phase 1: resolve

async function tryChart(symbol) {
  try {
    const response = await fetch(
      `${CHART_URL}/${encodeURIComponent(symbol)}?range=3mo&interval=1d`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (response.status === 429) {
      return { status: 'RATE_LIMITED' };
    }

    const body = await response.json();
    const result = body?.chart?.result?.[0];

    if (!result?.meta?.regularMarketPrice) {
      return { status: 'MISSING' };
    }

    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const volumes = result.indicators?.quote?.[0]?.volume ?? [];
    const turnover = [];

    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null && volumes[i] != null) {
        turnover.push(closes[i] * volumes[i]);
      }
    }

    const last50 = turnover.slice(-50);

    return {
      avgTurnover: last50.length
        ? last50.reduce((a, b) => a + b, 0) / last50.length
        : null,
      bars: closes.filter((close) => close != null).length,
      currency: result.meta.currency,
      longName: result.meta.longName ?? result.meta.shortName ?? '',
      status: 'OK'
    };
  } catch (error) {
    return { reason: `${error?.message ?? error}`, status: 'ERROR' };
  }
}

async function phaseResolve() {
  const pool = readJson(POOL, null);

  if (!pool) {
    throw new Error(`Missing ${POOL} - run parse-pool.cjs first`);
  }

  const resolved = readJson(RESOLVED, {});
  let done = 0;

  for (const row of pool) {
    const key = row.country + '|' + row.ticker;

    if (resolved[key]) {
      continue;
    }

    let found = null;

    for (const candidate of row.candidates) {
      const outcome = await tryChart(candidate);
      await sleep(THROTTLE_MS);

      if (outcome.status === 'RATE_LIMITED') {
        writeJson(RESOLVED, resolved);
        console.log('rate limited - progress saved, re-run to continue');

        return;
      }

      if (outcome.status === 'OK') {
        found = { symbol: candidate, ...outcome };
        break;
      }
    }

    resolved[key] = found ?? { symbol: null };
    done++;

    if (done % 25 === 0) {
      writeJson(RESOLVED, resolved);
      const hit = Object.values(resolved).filter((r) => r.symbol).length;
      console.log(
        `  ${Object.keys(resolved).length}/${pool.length} checked, ${hit} resolved`
      );
    }
  }

  writeJson(RESOLVED, resolved);

  const hit = Object.values(resolved).filter((r) => r.symbol).length;
  console.log(
    `\nresolve complete: ${Object.keys(resolved).length} checked, ` +
      `${hit} resolved, ${Object.keys(resolved).length - hit} unresolved`
  );
}

// -------------------------------------------------- phase 2: fundamentals

async function phaseFundamentals() {
  const pool = readJson(POOL, []);
  const resolved = readJson(RESOLVED, {});
  const cache = readJson(FUNDAMENTALS, {});

  const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  const wanted = [];

  for (const row of pool) {
    const symbol = resolved[row.country + '|' + row.ticker]?.symbol;

    if (symbol && !cache[symbol]) {
      wanted.push(symbol);
    }
  }

  console.log(`fetching fundamentals for ${wanted.length} symbols`);

  let done = 0;

  for (const symbol of wanted) {
    try {
      const result = await yahooFinance.quoteSummary(symbol, {
        modules: [
          'assetProfile',
          'defaultKeyStatistics',
          'financialData',
          'price',
          'recommendationTrend',
          'summaryDetail'
        ]
      });

      const financialData = result?.financialData;
      const keyStatistics = result?.defaultKeyStatistics;
      const trend = result?.recommendationTrend?.trend?.[0];
      const total = trend
        ? trend.strongBuy +
          trend.buy +
          (trend.hold ?? 0) +
          trend.sell +
          trend.strongSell
        : 0;

      cache[symbol] = {
        analystCount: total || null,
        analystNetBuyRatio: total
          ? (trend.strongBuy * 2 +
              trend.buy -
              trend.sell -
              trend.strongSell * 2) /
            total
          : null,
        currency: result?.price?.currency ?? null,
        debtToEquity: financialData?.debtToEquity ?? null,
        earningsGrowth: financialData?.earningsGrowth ?? null,
        forwardPE:
          keyStatistics?.forwardPE ?? result?.summaryDetail?.forwardPE ?? null,
        industry: result?.assetProfile?.industry ?? null,
        longName: result?.price?.longName ?? null,
        marketCap:
          result?.price?.marketCap ?? result?.summaryDetail?.marketCap ?? null,
        returnOnEquity: financialData?.returnOnEquity ?? null,
        revenueGrowth: financialData?.revenueGrowth ?? null,
        sector: result?.assetProfile?.sector ?? null
      };
    } catch (error) {
      cache[symbol] = { error: `${error?.message ?? error}`.slice(0, 120) };
    }

    done++;

    if (done % 25 === 0) {
      writeJson(FUNDAMENTALS, cache);
      console.log(`  ${done}/${wanted.length}`);
    }

    await sleep(THROTTLE_MS);
  }

  writeJson(FUNDAMENTALS, cache);

  const ok = Object.values(cache).filter((value) => !value.error).length;
  console.log(
    `\nfundamentals: ${ok} ok, ${Object.keys(cache).length - ok} failed`
  );
}

// ------------------------------------------------------- phase 3: report

const clamp = (value) => Math.max(0, Math.min(100, value));

function weighted(terms) {
  let score = 0;
  let weight = 0;

  for (const [value, termWeight] of terms) {
    if (value !== null && value !== undefined) {
      score += value * termWeight;
      weight += termWeight;
    }
  }

  return weight === 0 ? null : Math.round(score / weight);
}

const growthTerm = (f) =>
  f.earningsGrowth === null || f.earningsGrowth === undefined
    ? null
    : clamp(50 + f.earningsGrowth * 100);
const qualityTerm = (f) =>
  f.returnOnEquity === null || f.returnOnEquity === undefined
    ? null
    : clamp(50 + f.returnOnEquity * 100);
const analystTerm = (f) =>
  f.analystNetBuyRatio === null || f.analystNetBuyRatio === undefined
    ? null
    : clamp(50 + f.analystNetBuyRatio * 25);

// The engine's own weighting, reproduced so the two rankings can be compared.
const engineScore = (f) =>
  weighted([
    [
      f.forwardPE === null || f.forwardPE === undefined
        ? null
        : f.forwardPE > 0
          ? clamp(100 - f.forwardPE * 2)
          : 0,
      0.3
    ],
    [qualityTerm(f), 0.25],
    [growthTerm(f), 0.25],
    [analystTerm(f), 0.2]
  ]);

const curationScore = (f) =>
  weighted([
    [growthTerm(f), 0.35],
    [qualityTerm(f), 0.3],
    [analystTerm(f), 0.25],
    // Valuation is a tiebreaker only: cheap is mildly good, expensive is not
    // disqualifying - the outlier guard handles the absurd.
    [
      f.forwardPE === null || f.forwardPE === undefined || f.forwardPE <= 0
        ? null
        : clamp(100 - f.forwardPE * 1.5),
      0.1
    ]
  ]);

/**
 * Closed-end funds and listed holding vehicles that the ICB sector filter does
 * not catch, because only the FTSE 250 table labels them "Investment Trusts" -
 * the STOXX and FTSE 100 rows file them under Financial Services or a sector
 * borrowed from what they hold.
 *
 * They are excluded for the reason the trusts were: their return IS their
 * portfolio's return, so they double-count the constituents the index already
 * carries and occupy a second slot in the cross-sectional RS percentile.
 * Operating asset managers that earn fees (Schroders, Man Group, AJ Bell,
 * Amundi, St James's Place, Partners Group) are NOT in this list - they are
 * real businesses with real margins, and Yahoo files them under the same
 * "Asset Management" industry, which is why this is a named list rather than
 * an industry filter.
 */
const HOLDING_VEHICLES = new Set([
  '3IN.L', // 3i Infrastructure
  'ACKB.BR', // Ackermans & Van Haaren
  'AKER.OL', // Aker ASA
  'GBLB.BR', // Groupe Bruxelles Lambert
  'GCP.L', // GCP Infrastructure Investments
  'INDU-C.ST', // Industrivarden
  'INPP.L', // International Public Partnerships
  'INVE-B.ST', // Investor AB
  'IPO.L', // IP Group
  'KBCA.BR', // KBC Ancora
  'LATO-B.ST', // Investment AB Latour
  'LUND-B.ST', // Lundbergforetagen
  'PSH.L', // Pershing Square Holdings
  'SEQI.L', // Sequoia Economic Infrastructure Income Fund
  'SOF.BR', // Sofina
  'SYNC.L', // Syncona
  'UKW.L', // Greencoat UK Wind
  'VEIL.L', // Vietnam Enterprise
  'VOF.L' // VinaCapital Vietnam Opportunity Fund
]);

// The ETF holdings file labels sectors in German; it is only ever a fallback
// for the handful of names Yahoo has no sector for, but an English table
// should not print "Immobilien".
const SECTOR_EN = {
  Energie: 'Energy',
  Finanzwesen: 'Financials',
  Gesundheitsversorgung: 'Health Care',
  IT: 'Technology',
  Immobilien: 'Real Estate',
  Industrie: 'Industrials',
  Kommunikation: 'Communications',
  Grundstoffe: 'Materials',
  'Nichtzyklische Konsumgüter': 'Consumer Staples',
  Versorgungsbetriebe: 'Utilities',
  'Zyklische Konsumgüter': 'Consumer Discretionary'
};

const fmt = {
  cap: (value) => (value === null ? '-' : (value / 1e9).toFixed(1) + 'B'),
  num: (value) =>
    value === null || value === undefined ? '-' : value.toFixed(1),
  pct: (value) =>
    value === null || value === undefined ? '-' : (value * 100).toFixed(0) + '%'
};

async function phaseReport() {
  const pool = readJson(POOL, []);
  const resolved = readJson(RESOLVED, {});
  const fundamentals = readJson(FUNDAMENTALS, {});

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });
  const tracked = new Set(
    (await prisma.symbolProfile.findMany({ select: { symbol: true } })).map(
      (profile) => profile.symbol
    )
  );
  await prisma.$disconnect();

  const currencies = new Set(['USD']);

  for (const value of Object.values(fundamentals)) {
    if (value.currency) {
      currencies.add(value.currency);
    }
  }

  for (const value of Object.values(resolved)) {
    if (value.currency) {
      currencies.add(value.currency);
    }
  }

  const fx = await loadFxToEur([...currencies]);
  const eurPerUsd = fx.USD;

  const counts = {
    pool: pool.length,
    unresolved: 0,
    duplicate: 0,
    holdingVehicle: 0,
    alreadyTracked: 0,
    noFundamentals: 0,
    capOutOfBand: 0,
    illiquid: 0,
    peOutlier: 0,
    thinCoverage: 0,
    scored: 0
  };

  const rows = [];
  // The pool is deduplicated by exchange ticker, but one company can be listed
  // under two of them across the three sources (UU vs UU. for United
  // Utilities), and both resolve to the same Yahoo symbol. Dedupe on what is
  // actually imported, or the same name occupies two slots in the list and two
  // in the cross-sectional RS percentile.
  const seen = new Set();

  for (const row of pool) {
    const meta = resolved[row.country + '|' + row.ticker];

    if (!meta?.symbol) {
      counts.unresolved++;
      continue;
    }

    if (seen.has(meta.symbol)) {
      counts.duplicate++;
      continue;
    }

    seen.add(meta.symbol);

    if (HOLDING_VEHICLES.has(meta.symbol)) {
      counts.holdingVehicle++;
      continue;
    }

    if (tracked.has(meta.symbol)) {
      counts.alreadyTracked++;
      continue;
    }

    const raw = fundamentals[meta.symbol];

    if (!raw || raw.error) {
      counts.noFundamentals++;
      continue;
    }

    const f = {
      ...raw,
      forwardPE: normalizeForwardPE(
        raw.forwardPE,
        raw.currency ?? meta.currency
      )
    };

    const rate = capRate(fx, f.currency ?? meta.currency);
    const capEur = f.marketCap && rate ? f.marketCap * rate : null;

    if (
      capEur === null ||
      capEur < MIN_MARKET_CAP_EUR ||
      capEur > MAX_MARKET_CAP_EUR
    ) {
      counts.capOutOfBand++;
      continue;
    }

    // Turnover is priced in the quote currency (GBp for the LSE), which is why
    // it converts through the quote rate rather than the market-cap rate.
    const turnoverRate = fx[meta.currency];
    const dollarVolume =
      meta.avgTurnover && turnoverRate
        ? (meta.avgTurnover * turnoverRate) / eurPerUsd
        : null;

    if (dollarVolume === null || dollarVolume < MIN_DOLLAR_VOLUME) {
      counts.illiquid++;
      continue;
    }

    if (
      f.forwardPE !== null &&
      f.forwardPE !== undefined &&
      (f.forwardPE <= 0 || f.forwardPE > MAX_FORWARD_PE)
    ) {
      counts.peOutlier++;
      continue;
    }

    const present = [
      f.earningsGrowth,
      f.returnOnEquity,
      f.analystNetBuyRatio,
      f.forwardPE
    ].filter((value) => value !== null && value !== undefined).length;

    if (present < 2) {
      counts.thinCoverage++;
      continue;
    }

    counts.scored++;
    rows.push({
      ...f,
      capEur,
      country: row.country,
      curation: curationScore(f),
      dollarVolume,
      engine: engineScore(f),
      name: f.longName ?? meta.longName ?? row.name,
      sector: f.sector ?? SECTOR_EN[row.sector] ?? row.sector,
      sources: row.sources.join('+'),
      symbol: meta.symbol
    });
  }

  console.log('\nfilter funnel');
  for (const [name, value] of Object.entries(counts)) {
    console.log('  ' + name.padEnd(16) + String(value).padStart(5));
  }

  rows.sort((a, b) => b.curation - a.curation);

  const uk = rows.filter((row) => row.country === 'United Kingdom');
  const eu = rows.filter((row) => row.country !== 'United Kingdom');
  const ukTake = Math.min(TARGET_UK, uk.length);
  const picked = [...uk.slice(0, ukTake), ...eu.slice(0, TARGET - ukTake)].sort(
    (a, b) => b.curation - a.curation
  );

  console.log(
    `\ncandidates: ${uk.length} UK, ${eu.length} Continental - picking ` +
      `${picked.filter((row) => row.country === 'United Kingdom').length} UK / ` +
      `${picked.filter((row) => row.country !== 'United Kingdom').length} Continental\n`
  );

  const header = [
    '#',
    'symbol',
    'name',
    'country',
    'sector',
    'cap',
    'fwdPE',
    'growth',
    'ROE',
    'analyst',
    'n',
    'score',
    'engine'
  ];
  const table = picked.map((row, index) => [
    String(index + 1),
    row.symbol,
    (row.name ?? '').slice(0, 30),
    row.country.slice(0, 11),
    (row.sector ?? '').slice(0, 22),
    fmt.cap(row.capEur),
    fmt.num(row.forwardPE),
    fmt.pct(row.earningsGrowth),
    fmt.pct(row.returnOnEquity),
    row.analystNetBuyRatio === null || row.analystNetBuyRatio === undefined
      ? '-'
      : row.analystNetBuyRatio.toFixed(2),
    String(row.analystCount ?? '-'),
    String(row.curation),
    String(row.engine ?? '-')
  ]);

  const widths = header.map((label, index) =>
    Math.max(label.length, ...table.map((cells) => cells[index].length))
  );
  const line = (cells) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join('  ')
      .trimEnd();

  console.log(line(header));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const cells of table) {
    console.log(line(cells));
  }

  writeJson(path.join(SCRATCH, 'midcap-picked.json'), picked);
  console.log(`\nwrote ${picked.length} rows to midcap-picked.json`);
}

async function main() {
  if (process.argv.includes('--resolve')) {
    return phaseResolve();
  }

  if (process.argv.includes('--fundamentals')) {
    return phaseFundamentals();
  }

  if (process.argv.includes('--report')) {
    return phaseReport();
  }

  console.log('pass one of --resolve | --fundamentals | --report');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
