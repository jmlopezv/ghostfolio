'use strict';
/**
 * Why does "DIP + Trend Template" produce zero signals?
 *
 * The edge study found no overlap at all between the current DIP entry and the
 * Trend Template. That is a consequential claim — it would mean the planned
 * "gate the dip on the trend template" change silences the engine completely —
 * so it is checked criterion by criterion here rather than taken on trust.
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

    const counts = {};
    const bump = (k) => {
      counts[k] = (counts[k] ?? 0) + 1;
    };
    const passDistribution = new Array(9).fill(0);

    for (const symbol of symbols) {
      const bars = barsBySymbol[symbol];
      const dateToIndex = new Map(bars.map((b, i) => [b.date, i]));

      for (const rebalanceDate of rebalanceDates) {
        const i = dateToIndex.get(rebalanceDate);
        if (i === undefined || i < WARMUP) continue;

        const visible = bars.slice(0, i + 1);
        const closes = visible.map((b) => b.close);
        const snapshot = indicators.computeSnapshot(closes);
        if (snapshot.sma200 === null || snapshot.rsi === null) continue;

        const score = indicators.computeScore(snapshot);
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
          !indicators.isDowntrend(snapshot) &&
          snapshot.price <= buyLevel;

        if (!isDip) continue;
        bump('DIP days');

        const trend = screen.trendTemplate({
          bars: visible,
          rsRank: rsByDate.get(rebalanceDate)[symbol] ?? null
        });
        if (!trend) {
          bump('  (no trend result)');
          continue;
        }

        passDistribution[trend.passCount]++;
        for (const [name, ok] of Object.entries(trend.criteria)) {
          if (ok) bump(`  passes ${name}`);
        }
        if (trend.passed) bump('  passes ALL 8');
      }
    }

    console.log('='.repeat(74));
    console.log(
      'TREND TEMPLATE CRITERIA, MEASURED ONLY ON DAYS THE DIP ENTRY FIRES'
    );
    console.log('='.repeat(74));

    const dipDays = counts['DIP days'] ?? 0;
    console.log(`  DIP days: ${dipDays}\n`);

    for (const [key, value] of Object.entries(counts)) {
      if (key === 'DIP days') continue;
      const share = dipDays ? (value / dipDays) * 100 : 0;
      console.log(
        `  ${key.padEnd(34)} ${String(value).padStart(5)}  ${share.toFixed(1).padStart(5)}%`
      );
    }

    console.log('\n  Trend-template pass count on DIP days:');
    passDistribution.forEach((count, passes) => {
      if (count > 0) {
        console.log(
          `    ${passes}/8  ${String(count).padStart(5)}  ${((count / dipDays) * 100).toFixed(1).padStart(5)}%`
        );
      }
    });
    console.log('='.repeat(74));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[diag] fatal:', e);
  process.exit(1);
});
