'use strict';
/**
 * Event study: does a signal actually pick better tickers than the base rate?
 *
 * Why this and not the §0.3 total-return test. §0.3 compares a strategy's
 * compounded return against buy-and-hold over the whole window. That is the
 * right question for a fully invested strategy and the WRONG one for a tactical
 * screen: the leader strategy is in the market ~8% of the time, so against a
 * 100%-invested benchmark in a bull market it must lose on total return no
 * matter how good its picks are. The -175pp "edge" is mostly an exposure
 * artifact, not a verdict on ticker selection.
 *
 * The user's actual use case is deciding what to buy when new cash arrives
 * (~$750/month), not being permanently fully invested. So the question that
 * matters is: after a signal fires, is the forward return better than picking a
 * random name on a random day?
 *
 * That is what this measures — forward returns at 21/63/126 trading days after
 * each signal, against the base rate over the same universe and horizons.
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
    if (m && !process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const D = 'dist-test-signals/apps/api/src/services/signals';
const { IndicatorsService } = require(`./${D}/indicators.service.js`);
const { LeaderScreenService } = require(`./${D}/leader-screen.service.js`);
const { CrossSectionalService } = require(`./${D}/cross-sectional.service.js`);
const config = require('./dist-test-signals/libs/common/src/lib/config.js');

const WARMUP = 252;
const REBALANCE_EVERY = 5;
const HORIZONS = [21, 63, 126];

const pct = (v) => `${(v * 100).toFixed(2)}%`;

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Welch's t-statistic — the samples have very different sizes and variances
 * (a few hundred signals against hundreds of thousands of baseline days), so
 * the pooled-variance form would be wrong here.
 */
function welchT(a, b) {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const se = Math.sqrt(va / a.length + vb / b.length);
  return se > 0 ? (ma - mb) / se : 0;
}

function report(label, sample, baseline, horizon) {
  if (sample.length === 0) {
    console.log(
      `  ${label.padEnd(22)} ${String(horizon).padStart(4)}d   (no signals)`
    );
    return;
  }
  const t = welchT(sample, baseline);
  const hit = sample.filter((v) => v > 0).length / sample.length;
  const baseHit = baseline.filter((v) => v > 0).length / baseline.length;

  console.log(
    `  ${label.padEnd(22)} ${String(horizon).padStart(4)}d  n=${String(sample.length).padStart(5)}  ` +
      `mean ${pct(mean(sample)).padStart(8)}  median ${pct(median(sample)).padStart(8)}  ` +
      `win ${pct(hit).padStart(7)}  vs base ${((mean(sample) - mean(baseline)) * 100).toFixed(2).padStart(6)}pp / ` +
      `${((hit - baseHit) * 100).toFixed(1).padStart(5)}pp  t=${t.toFixed(2).padStart(6)}`
  );
}

async function main() {
  loadEnv();

  const { PrismaClient } = require('@prisma/client');
  const { PrismaPg } = require('@prisma/adapter-pg');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  try {
    const rows = await prisma.ohlcBar.findMany({
      orderBy: { date: 'asc' },
      where: { dataSource: 'YAHOO' }
    });

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
    const indicators = new IndicatorsService();
    const screen = new LeaderScreenService(indicators);
    const crossSectional = new CrossSectionalService();

    const allDates = [
      ...new Set(rows.map((r) => r.date.toISOString().slice(0, 10)))
    ].sort();
    const tradeDates = allDates.slice(WARMUP);

    const rsByDate = new Map();
    for (let i = 0; i < tradeDates.length; i += REBALANCE_EVERY) {
      const date = tradeDates[i];
      rsByDate.set(
        date,
        crossSectional.rankMap({
          asOf: new Date(`${date}T00:00:00.000Z`),
          seriesBySymbol: barsBySymbol
        })
      );
    }
    const rebalanceDates = [...rsByDate.keys()];

    console.log(
      `[study] ${symbols.length} symbols · ${rebalanceDates.length} evaluation dates · horizons ${HORIZONS.join('/')}d\n`
    );

    // Buckets, keyed by horizon.
    const baseline = {};
    const leaderBreakout = {};
    const leaderAtPivot = {};
    const trendOnly = {};
    const dipCurrent = {};
    const dipTrendGated = {};
    for (const h of HORIZONS) {
      baseline[h] = [];
      leaderBreakout[h] = [];
      leaderAtPivot[h] = [];
      trendOnly[h] = [];
      dipCurrent[h] = [];
      dipTrendGated[h] = [];
    }

    const forward = (bars, i, h) => {
      const from = bars[i];
      const to = bars[i + h];
      return from && to && from.close > 0 ? to.close / from.close - 1 : null;
    };

    for (const symbol of symbols) {
      const bars = barsBySymbol[symbol];
      const dateToIndex = new Map(bars.map((b, i) => [b.date, i]));

      // Base rate: every evaluation day for every symbol.
      for (const rebalanceDate of rebalanceDates) {
        const i = dateToIndex.get(rebalanceDate);
        if (i === undefined || i < WARMUP) continue;
        for (const h of HORIZONS) {
          const r = forward(bars, i, h);
          if (r !== null) baseline[h].push(r);
        }
      }

      for (const rebalanceDate of rebalanceDates) {
        const i = dateToIndex.get(rebalanceDate);
        if (i === undefined || i < WARMUP) continue;

        const visible = bars.slice(0, i + 1);
        const closes = visible.map((b) => b.close);

        // --- Leader paths -------------------------------------------------
        const trend = screen.trendTemplate({
          bars: visible,
          rsRank: rsByDate.get(rebalanceDate)[symbol] ?? null
        });

        if (trend?.passed) {
          for (const h of HORIZONS) {
            const r = forward(bars, i, h);
            if (r !== null) trendOnly[h].push(r);
          }

          const vcp = screen.vcpStructure(visible);
          if (vcp?.isValid) {
            if (vcp.breakout) {
              for (const h of HORIZONS) {
                const r = forward(bars, i, h);
                if (r !== null) leaderBreakout[h].push(r);
              }
            }
            if (vcp.atPivot) {
              for (const h of HORIZONS) {
                const r = forward(bars, i, h);
                if (r !== null) leaderAtPivot[h].push(r);
              }
            }
          }
        }

        // --- Current DIP entry, reproduced from the live services ---------
        const snapshot = indicators.computeSnapshot(closes);
        if (snapshot.sma200 === null || snapshot.rsi === null) continue;

        const score = indicators.computeScore(snapshot);
        const downtrend = indicators.isDowntrend(snapshot);
        const recentHigh = indicators.highestClose(closes, 30);
        const buyLevel = indicators.adaptiveBuyLevel({
          dropPct: config.SIGNAL_DEFAULT_BUY_DROP_PCT,
          horizonDays: config.SIGNAL_HORIZON_DAYS,
          recentHigh,
          sigmaMult: config.SIGNAL_BUY_SIGMA_MULT,
          volatility: snapshot.volatility
        });

        const isDip =
          score >= config.SIGNAL_BUY_SCORE_MIN &&
          !downtrend &&
          snapshot.price <= buyLevel;

        if (isDip) {
          for (const h of HORIZONS) {
            const r = forward(bars, i, h);
            if (r !== null) dipCurrent[h].push(r);
          }
          // The proposed repurposing: the same dip, but only inside a name that
          // already passes the Trend Template.
          if (trend?.passed) {
            for (const h of HORIZONS) {
              const r = forward(bars, i, h);
              if (r !== null) dipTrendGated[h].push(r);
            }
          }
        }
      }
    }

    console.log('='.repeat(122));
    console.log('FORWARD RETURNS AFTER A SIGNAL vs THE UNIVERSE BASE RATE');
    console.log('='.repeat(122));

    for (const h of HORIZONS) {
      console.log('');
      report('BASE RATE (all days)', baseline[h], baseline[h], h);
      report('Trend Template 8/8', trendOnly[h], baseline[h], h);
      report('LEADER at pivot', leaderAtPivot[h], baseline[h], h);
      report('LEADER breakout', leaderBreakout[h], baseline[h], h);
      report('DIP (current engine)', dipCurrent[h], baseline[h], h);
      report('DIP + trend gate', dipTrendGated[h], baseline[h], h);
    }

    console.log('');
    console.log('='.repeat(122));
    console.log(
      '  t > 2 means the signal beat the base rate by more than sampling noise would explain.'
    );
    console.log(
      '  Survivorship bias: the universe is a curated watchlist of survivors, so every'
    );
    console.log(
      '  number here — base rate included — is optimistic in absolute terms. The comparison'
    );
    console.log('  between rows is the part that carries information.');
    console.log('='.repeat(122));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[study] fatal:', e);
  process.exit(1);
});
