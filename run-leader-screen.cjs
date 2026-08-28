'use strict';
/**
 * Runs the Minervini leader screen over the real `OhlcBar` data and prints what
 * it finds. This is the reality check the unit tests cannot give: synthetic
 * fixtures prove the maths, but only live data shows whether the thresholds
 * select a sane shortlist or nothing at all.
 *
 * Read-only. Compile first:  npx tsc -p tsconfig.signals-test.json
 * Usage: node run-leader-screen.cjs [--asOf=YYYY-MM-DD] [--top=25]
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

const pct = (value) => `${(value * 100).toFixed(1)}%`;

async function main() {
  loadEnv();

  const args = { asOf: null, top: 25 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--asOf='))
      args.asOf = new Date(`${arg.slice(7)}T00:00:00.000Z`);
    else if (arg.startsWith('--top=')) args.top = Number(arg.slice(6));
  }

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
    for (const row of rows) {
      (barsBySymbol[row.symbol] ??= []).push({
        close: row.close,
        date: row.date.toISOString().slice(0, 10),
        high: row.high,
        low: row.low,
        open: row.open,
        volume: row.volume
      });
    }

    const symbols = Object.keys(barsBySymbol);
    console.log(
      `[screen] ${rows.length} bars · ${symbols.length} symbols${args.asOf ? ` · asOf ${args.asOf.toISOString().slice(0, 10)}` : ''}\n`
    );

    const crossSectional = new CrossSectionalService();
    const indicators = new IndicatorsService();
    const leaderScreen = new LeaderScreenService(indicators);

    const rsMap = crossSectional.rankMap({
      asOf: args.asOf,
      seriesBySymbol: barsBySymbol
    });

    console.log(`[screen] ${Object.keys(rsMap).length} names carry an RS rank`);

    const cutoff = args.asOf ? args.asOf.toISOString().slice(0, 10) : null;
    const results = [];
    const passCounts = new Array(9).fill(0);

    for (const symbol of symbols) {
      const bars = cutoff
        ? barsBySymbol[symbol].filter(({ date }) => date <= cutoff)
        : barsBySymbol[symbol];

      const trend = leaderScreen.trendTemplate({
        bars,
        rsRank: rsMap[symbol] ?? null
      });

      if (!trend) continue;

      passCounts[trend.passCount]++;

      const vcp = leaderScreen.vcpStructure(bars);

      results.push({ bars, symbol, trend, vcp });
    }

    console.log('\n[screen] Trend Template pass distribution (of 8):');
    passCounts.forEach((count, passes) => {
      if (count > 0) {
        const bar = '#'.repeat(Math.round((count / results.length) * 50));
        console.log(`  ${passes}/8 ${String(count).padStart(4)} ${bar}`);
      }
    });

    const passing = results.filter(({ trend }) => trend.passed);
    console.log(
      `\n[screen] ${passing.length}/${results.length} pass all 8 (${pct(passing.length / results.length)}) — Minervini expects ~5%\n`
    );

    passing.sort((a, b) => b.trend.rsRank - a.trend.rsRank);

    console.log('[screen] Leaders by RS rank:');
    console.log('  SYMBOL        RS  BELOW-HIGH  ABOVE-LOW  SMA200-UP  VCP');

    for (const { symbol, trend, vcp } of passing.slice(0, args.top)) {
      const vcpLabel = !vcp
        ? '-'
        : vcp.isValid
          ? `${vcp.contractions.length}C ${vcp.contractions.map((c) => (c.depthPct * 100).toFixed(0)).join('/')} pivot ${vcp.pivot.toFixed(2)}${vcp.breakout ? ' BREAKOUT' : vcp.atPivot ? ' AT-PIVOT' : ''}`
          : `x ${vcp.rejectedReason}`;

      console.log(
        `  ${symbol.padEnd(12)} ${String(trend.rsRank).padStart(3)}  ` +
          `${pct(trend.belowHighPct).padStart(9)}  ${pct(trend.aboveLowPct).padStart(9)}  ` +
          `${String(trend.sma200RisingDays).padStart(8)}d  ${vcpLabel}`
      );
    }

    const withVcp = passing.filter(({ vcp }) => vcp?.isValid);
    const actionable = withVcp.filter(({ vcp }) => vcp.breakout || vcp.atPivot);

    console.log(
      `\n[screen] ${withVcp.length} of the ${passing.length} leaders show a valid VCP; ${actionable.length} are at or through the pivot.`
    );

    if (actionable.length > 0) {
      console.log('\n[screen] Actionable now:');
      for (const { symbol, trend, vcp } of actionable) {
        console.log(
          `  ${symbol.padEnd(12)} RS ${trend.rsRank}  pivot ${vcp.pivot.toFixed(2)}  ` +
            `vol ${vcp.breakoutVolumeRatio.toFixed(2)}x  dryup ${vcp.dryUpRatio.toFixed(2)}  ` +
            `${vcp.breakout ? 'BREAKOUT' : 'at pivot'}`
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[screen] fatal:', error);
  process.exit(1);
});
