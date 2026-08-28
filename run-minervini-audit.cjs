'use strict';
/**
 * Audits the leader signal the way Minervini actually trades it, because the
 * existing event study does not.
 *
 * Four things `run-signal-edge-study.cjs` gets wrong for THIS method, each of
 * which biases the result and none of which is a criticism of that script for
 * its original purpose (comparing entries under a common yardstick):
 *
 *  1. IT MEASURES AN ENTRY HE DOES NOT TAKE. "LEADER at pivot" is price
 *     approaching resistance WITHOUT having broken out. Minervini puts that on
 *     a watch list; he buys the breakout THROUGH the pivot on volume. The
 *     -1.57pp headline therefore condemns a trade the method never makes.
 *
 *  2. IT SAMPLES EVERY 5th DAY. A breakout is a one-day event. Sampling every
 *     5th trading day misses ~80% of them outright and catches the rest 1-4
 *     days late, i.e. already extended - which is precisely when Minervini
 *     says not to buy.
 *
 *  3. IT HAS NO EXIT. It measures raw buy-and-hold forward return. Minervini's
 *     edge is asymmetry: cut at 7-8%, let winners run. Mean forward return
 *     without a stop measures a strategy nobody runs, and it is exactly the
 *     statistic a stop is designed to change.
 *
 *  4. IT IGNORES MARKET DIRECTION. His first rule. Pooling breakouts in
 *     corrections with breakouts in uptrends averages away the filter he
 *     considers most important.
 *
 * This script fixes all four and reports every cell with its n, so a cell too
 * thin to interpret is visibly too thin rather than quietly persuasive.
 *
 * No index data is stored locally, so market direction uses a BREADTH proxy
 * computed point-in-time from the universe itself: the share of symbols above
 * their own 200-day average that day. No lookahead.
 *
 * Read-only. Compile first: npx tsc -p tsconfig.signals-test.json
 */

const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('@ghostfolio/common/')) {
    request = path.join(
      __dirname,
      'dist-test-signals/libs/common/src/lib',
      request.slice('@ghostfolio/common/'.length)
    );
  } else if (request.startsWith('@ghostfolio/api/')) {
    request = path.join(
      __dirname,
      'dist-test-signals/apps/api/src',
      request.slice('@ghostfolio/api/'.length)
    );
  }
  return originalResolve.call(this, request, ...args);
};

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const D = 'dist-test-signals/apps/api/src/services/signals';
const { IndicatorsService } = require(`./${D}/indicators.service.js`);
const { LeaderScreenService } = require(`./${D}/leader-screen.service.js`);
const { CrossSectionalService } = require(`./${D}/cross-sectional.service.js`);

const WARMUP = 252;
const HORIZONS = [21, 63, 126];
// RS percentiles move slowly; recomputing the whole cross-section daily is the
// dominant cost, so it is refreshed weekly and forward-filled. Signals are
// still evaluated EVERY day - that is the part that matters for a breakout.
const RS_REFRESH_EVERY = 5;
// One entry per symbol per breakout, matching the live alert's cooldown.
const SIGNAL_COOLDOWN_DAYS = 5;
const STOP_PCT = 0.075;

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
function welch(sample, base) {
  if (sample.length < 2 || base.length < 2) return 0;
  const ms = mean(sample);
  const mb = mean(base);
  const vs =
    sample.reduce((x, y) => x + (y - ms) ** 2, 0) / (sample.length - 1);
  const vb = base.reduce((x, y) => x + (y - mb) ** 2, 0) / (base.length - 1);
  const se = Math.sqrt(vs / sample.length + vb / base.length);
  return se > 0 ? (ms - mb) / se : 0;
}

/**
 * Forward return under an exit model.
 *
 *   'hold'      - buy and hold to the horizon (what the old study measured)
 *   'stop'      - 7.5% stop on a closing basis, else hold to the horizon
 *   'stopTrail' - 7.5% stop, then once up 15% trail 15% below the running high
 *
 * Applied identically to the signal set and the base rate, so the comparison
 * stays like-for-like: a stop helps or hurts a random day too.
 */
function forwardReturn(bars, i, horizon, model) {
  const entry = bars[i].close;
  if (!entry || i + horizon >= bars.length) return null;

  if (model === 'hold') {
    return (bars[i + horizon].close / entry - 1) * 100;
  }

  const stop = entry * (1 - STOP_PCT);
  let high = entry;
  let trailing = false;

  for (let k = i + 1; k <= i + horizon; k++) {
    const close = bars[k].close;
    high = Math.max(high, close);

    if (model === 'stopTrail') {
      if (!trailing && high >= entry * 1.15) trailing = true;
      if (trailing && close <= high * 0.85) return (close / entry - 1) * 100;
    }
    if (close <= stop) return (close / entry - 1) * 100;
  }

  return (bars[i + horizon].close / entry - 1) * 100;
}

function report(label, sample, base, horizon, note = '') {
  if (sample.length === 0) {
    console.log(
      `  ${label.padEnd(30)} ${String(horizon).padStart(3)}d  (no signals)`
    );
    return;
  }
  const t = welch(sample, base);
  const thin = sample.length < 200 ? '  ⚠ n<200' : '';
  console.log(
    `  ${label.padEnd(30)} ${String(horizon).padStart(3)}d  n=${String(sample.length).padStart(6)}` +
      `  mean ${mean(sample).toFixed(2).padStart(7)}%  median ${median(sample).toFixed(2).padStart(7)}%` +
      `  win ${((sample.filter((x) => x > 0).length / sample.length) * 100).toFixed(1).padStart(5)}%` +
      `  vs base ${(mean(sample) - mean(base)).toFixed(2).padStart(6)}pp  t=${t.toFixed(2).padStart(6)}${thin}${note}`
  );
}

async function main() {
  loadEnv();

  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const rows = await prisma.ohlcBar.findMany({
    orderBy: [{ symbol: 'asc' }, { date: 'asc' }]
  });
  await prisma.$disconnect();

  const barsBySymbol = {};
  for (const r of rows) {
    (barsBySymbol[r.symbol] ??= []).push({
      close: r.close,
      date: r.date.toISOString().slice(0, 10),
      high: r.high,
      low: r.low,
      open: r.open,
      volume: r.volume
    });
  }

  const symbols = Object.keys(barsBySymbol).filter(
    (s) => barsBySymbol[s].length >= WARMUP + 130
  );
  const allDates = [
    ...new Set(rows.map((r) => r.date.toISOString().slice(0, 10)))
  ].sort();
  const tradeDates = allDates.slice(WARMUP);

  const indicators = new IndicatorsService();
  const screen = new LeaderScreenService(indicators);
  const crossSectional = new CrossSectionalService(indicators);

  console.log(
    `[audit] ${symbols.length} symbols · ${tradeDates.length} evaluation dates (EVERY trading day) · horizons ${HORIZONS.join('/')}d\n`
  );

  // ---- RS, refreshed weekly and forward-filled ---------------------------
  process.stdout.write('[audit] building RS ranks ... ');
  const rsSnapshots = [];
  for (let i = 0; i < tradeDates.length; i += RS_REFRESH_EVERY) {
    rsSnapshots.push([
      tradeDates[i],
      crossSectional.rankMap({
        asOf: new Date(`${tradeDates[i]}T00:00:00.000Z`),
        seriesBySymbol: barsBySymbol
      })
    ]);
  }
  const rsForDate = new Map();
  let cursor = 0;
  for (const date of tradeDates) {
    while (
      cursor + 1 < rsSnapshots.length &&
      rsSnapshots[cursor + 1][0] <= date
    ) {
      cursor++;
    }
    rsForDate.set(date, rsSnapshots[cursor][1]);
  }
  console.log(`${rsSnapshots.length} snapshots`);

  // ---- Market breadth proxy, point-in-time -------------------------------
  process.stdout.write('[audit] building market breadth ... ');
  const aboveByDate = new Map();
  const totalByDate = new Map();
  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol];
    const closes = bars.map((b) => b.close);
    let sum = 0;
    for (let i = 0; i < bars.length; i++) {
      sum += closes[i];
      if (i < 199) continue;
      if (i >= 200) sum -= closes[i - 200];
      const sma = sum / 200;
      const d = bars[i].date;
      totalByDate.set(d, (totalByDate.get(d) ?? 0) + 1);
      if (closes[i] > sma) aboveByDate.set(d, (aboveByDate.get(d) ?? 0) + 1);
    }
  }
  const breadth = new Map();
  for (const [d, total] of totalByDate) {
    breadth.set(d, total > 0 ? (aboveByDate.get(d) ?? 0) / total : 0);
  }
  const healthy = (d) => (breadth.get(d) ?? 0) >= 0.5;
  const healthyDays = tradeDates.filter(healthy).length;
  console.log(
    `${((healthyDays / tradeDates.length) * 100).toFixed(0)}% of days had >=50% of the universe above its 200-day`
  );

  // ---- Walk ---------------------------------------------------------------
  const MODELS = ['hold', 'stop', 'stopTrail'];
  const buckets = {};
  const names = [
    'BASE RATE (all days)',
    'Trend Template 8/8',
    'at pivot (NOT his entry)',
    'BREAKOUT (his entry)',
    'BREAKOUT + healthy market',
    'BREAKOUT + RS>=90',
    'BREAKOUT + healthy + RS>=90'
  ];
  for (const m of MODELS) {
    buckets[m] = {};
    for (const n of names) {
      buckets[m][n] = {};
      for (const h of HORIZONS) buckets[m][n][h] = [];
    }
  }

  let done = 0;
  for (const symbol of symbols) {
    const bars = barsBySymbol[symbol];
    const dateToIndex = new Map(bars.map((b, i) => [b.date, i]));
    let lastSignalIndex = -Infinity;

    for (const date of tradeDates) {
      const i = dateToIndex.get(date);
      if (i === undefined || i < WARMUP) continue;

      const push = (name) => {
        for (const m of MODELS) {
          for (const h of HORIZONS) {
            const r = forwardReturn(bars, i, h, m);
            if (r !== null) buckets[m][name][h].push(r);
          }
        }
      };

      push('BASE RATE (all days)');

      const visible = bars.slice(0, i + 1);
      const rsRank = rsForDate.get(date)?.[symbol] ?? null;
      const trend = screen.trendTemplate({ bars: visible, rsRank });
      if (!trend?.passed) continue;

      push('Trend Template 8/8');

      const vcp = screen.vcpStructure(visible);
      if (!vcp?.isValid) continue;

      if (vcp.atPivot) push('at pivot (NOT his entry)');

      if (vcp.breakout) {
        // One entry per breakout event, not one per day it stays true.
        if (i - lastSignalIndex < SIGNAL_COOLDOWN_DAYS) continue;
        lastSignalIndex = i;

        push('BREAKOUT (his entry)');
        if (healthy(date)) push('BREAKOUT + healthy market');
        if ((rsRank ?? 0) >= 90) push('BREAKOUT + RS>=90');
        if (healthy(date) && (rsRank ?? 0) >= 90) {
          push('BREAKOUT + healthy + RS>=90');
        }
      }
    }

    if (++done % 100 === 0) {
      process.stdout.write(`[audit] ${done}/${symbols.length} symbols\n`);
    }
  }

  const TITLE = {
    hold: 'EXIT MODEL: buy and hold to the horizon  (what the old study measured)',
    stop: `EXIT MODEL: ${(STOP_PCT * 100).toFixed(1)}% stop, else hold  (Minervini's risk rule)`,
    stopTrail: `EXIT MODEL: ${(STOP_PCT * 100).toFixed(1)}% stop, then trail 15% once up 15%  (cut losses, let winners run)`
  };

  for (const m of MODELS) {
    console.log('\n' + '='.repeat(140));
    console.log(TITLE[m]);
    console.log('='.repeat(140));
    for (const h of HORIZONS) {
      console.log('');
      for (const n of names) {
        report(n, buckets[m][n][h], buckets[m]['BASE RATE (all days)'][h], h);
      }
    }
  }

  console.log('\n' + '='.repeat(140));
  console.log(
    '  t > 2 = beat the base rate by more than sampling noise explains. n<200 flagged: too thin to interpret.'
  );
  console.log(
    '  Base rate uses the SAME exit model as the signal in each block, so the comparison stays like-for-like.'
  );
  console.log(
    '  Market breadth is a proxy for index direction (no index data stored); RS is refreshed weekly, forward-filled.'
  );
  console.log(
    '  Survivorship: the universe is a curated watchlist of survivors, so absolute levels are optimistic.'
  );
  console.log('='.repeat(140));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
