'use strict';
/**
 * Shows every number behind the leader screen for one symbol, so a pass or a
 * rejection can be checked by hand rather than trusted.
 *
 * Prints the 8 Trend Template criteria with their actual inputs, the VCP
 * contraction sequence with the pivot arithmetic, and — for comparison — what
 * the DIP entry sees on the same day.
 *
 * Read-only. Compile first: npx tsc -p tsconfig.signals-test.json
 * Usage: node run-explain-symbol.cjs UNP MRK EQNR.OL
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

const n = (v, d = 2) => (v == null ? 'n/a' : Number(v).toFixed(d));
const tick = (ok) => (ok ? 'PASS' : 'FAIL');

async function main() {
  loadEnv();
  const targets = process.argv.slice(2);

  if (targets.length === 0) {
    console.error('usage: node run-explain-symbol.cjs SYMBOL [SYMBOL...]');
    process.exit(1);
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

    const indicators = new IndicatorsService();
    const screen = new LeaderScreenService(indicators);
    const rsMap = new CrossSectionalService().rankMap({
      seriesBySymbol: barsBySymbol
    });

    for (const symbol of targets) {
      const bars = barsBySymbol[symbol];

      console.log('\n' + '='.repeat(78));
      console.log(`  ${symbol}`);
      console.log('='.repeat(78));

      if (!bars) {
        console.log('  no stored bars');
        continue;
      }

      const closes = bars.map((b) => b.close);
      const price = closes[closes.length - 1];
      const asOf = bars[bars.length - 1].date;

      const sma50 = indicators.sma(closes, 50);
      const sma150 = indicators.sma(closes, 150);
      const sma200 = indicators.sma(closes, 200);
      const sma200Series = indicators.smaSeries(closes, 200);
      const risingDays = indicators.slopeUpDuration(sma200Series);
      const high52 = indicators.highestHigh(bars, 252);
      const low52 = indicators.lowestLow(bars, 252);
      const rsRank = rsMap[symbol] ?? null;

      console.log(`  as of ${asOf} · price ${n(price)}\n`);
      console.log(
        '  --- Trend Template ---------------------------------------'
      );
      console.log(
        `  SMA50  ${n(sma50)}   SMA150 ${n(sma150)}   SMA200 ${n(sma200)}`
      );
      console.log(
        `  52w high ${n(high52)}   52w low ${n(low52)}   RS rank ${rsRank ?? 'unranked'}\n`
      );

      const aboveLow = (price - low52) / low52;
      const belowHigh = (high52 - price) / high52;

      const checks = [
        [
          `1. price > SMA50/150/200`,
          price > sma50 && price > sma150 && price > sma200,
          `${n(price)} vs ${n(sma50)} / ${n(sma150)} / ${n(sma200)}`
        ],
        [`2. SMA150 > SMA200`, sma150 > sma200, `${n(sma150)} > ${n(sma200)}`],
        [
          `3. SMA200 rising >= 21d`,
          risingDays >= config.SIGNAL_TREND_TEMPLATE_SMA200_RISING_DAYS,
          `rising ${risingDays} consecutive days`
        ],
        [
          `4. SMA50 > SMA150 > SMA200`,
          sma50 > sma150 && sma150 > sma200,
          `${n(sma50)} > ${n(sma150)} > ${n(sma200)}`
        ],
        [`5. price > SMA50`, price > sma50, `${n(price)} > ${n(sma50)}`],
        [
          `6. >= 30% above 52w low`,
          aboveLow >= config.SIGNAL_TREND_TEMPLATE_MIN_ABOVE_LOW_PCT,
          `(${n(price)} - ${n(low52)}) / ${n(low52)} = ${n(aboveLow * 100, 1)}%`
        ],
        [
          `7. within 25% of 52w high`,
          belowHigh <= config.SIGNAL_TREND_TEMPLATE_MAX_BELOW_HIGH_PCT,
          `(${n(high52)} - ${n(price)}) / ${n(high52)} = ${n(belowHigh * 100, 1)}%`
        ],
        [
          `8. RS rank >= 70`,
          rsRank !== null && rsRank >= config.SIGNAL_TREND_TEMPLATE_MIN_RS,
          `RS ${rsRank ?? 'unranked'}`
        ]
      ];

      let passes = 0;
      for (const [label, ok, detail] of checks) {
        if (ok) passes++;
        console.log(`  [${tick(ok)}] ${label.padEnd(28)} ${detail}`);
      }
      console.log(`\n  => ${passes}/8 criteria pass\n`);

      // --- VCP ------------------------------------------------------------
      const vcp = screen.vcpStructure(bars);
      console.log(
        '  --- Volatility Contraction Pattern -----------------------'
      );

      if (!vcp) {
        console.log('  not enough bars');
      } else if (!vcp.isValid) {
        console.log(`  no valid base: ${vcp.rejectedReason}`);
      } else {
        console.log(
          `  base ${vcp.baseDays} trading days · ${vcp.contractions.length} contractions`
        );
        vcp.contractions.forEach((c, i) => {
          console.log(
            `    ${i + 1}. ${c.fromDate} peak ${n(c.peak)} -> ${c.toDate} trough ${n(c.trough)}  ` +
              `depth (${n(c.peak)} - ${n(c.trough)}) / ${n(c.peak)} = ${n(c.depthPct * 100, 1)}%`
          );
        });
        const distance = (price - vcp.pivot) / vcp.pivot;
        console.log(`\n  pivot = high of final contraction = ${n(vcp.pivot)}`);
        console.log(
          `  price ${n(price)} vs pivot ${n(vcp.pivot)} -> ${n(distance * 100, 2)}%`
        );
        console.log(
          `  latest volume / 50d average = ${n(vcp.breakoutVolumeRatio)}x   (breakout needs >= ${config.SIGNAL_VCP_BREAKOUT_VOLUME_RATIO})`
        );
        console.log(
          `  final-contraction volume / 50d average = ${n(vcp.dryUpRatio)}   (dry-up needs <= ${config.SIGNAL_VCP_MAX_DRYUP_RATIO})`
        );
        console.log(
          `\n  status: ${vcp.breakout ? 'BREAKOUT' : vcp.atPivot ? 'AT_PIVOT' : 'FORMING'}`
        );
        console.log(
          `    BREAKOUT requires price > pivot AND volume >= ${config.SIGNAL_VCP_BREAKOUT_VOLUME_RATIO}x  ->  ` +
            `${price > vcp.pivot ? 'price ok' : 'price below pivot'}, ` +
            `${vcp.breakoutVolumeRatio >= config.SIGNAL_VCP_BREAKOUT_VOLUME_RATIO ? 'volume ok' : 'volume too light'}`
        );
        console.log(
          `    AT_PIVOT requires |distance| <= ${config.SIGNAL_VCP_PIVOT_PROXIMITY_PCT * 100}%  ->  ` +
            `${Math.abs(distance) <= config.SIGNAL_VCP_PIVOT_PROXIMITY_PCT ? 'within band' : 'outside band'}`
        );
      }

      // --- What the DIP entry sees on the same day ------------------------
      const snapshot = indicators.computeSnapshot(closes);
      const score = indicators.computeScore(snapshot);
      const recentHigh = indicators.highestClose(closes, 30);
      const buyLevel = indicators.adaptiveBuyLevel({
        dropPct: config.SIGNAL_DEFAULT_BUY_DROP_PCT,
        horizonDays: config.SIGNAL_HORIZON_DAYS,
        recentHigh,
        sigmaMult: config.SIGNAL_BUY_SIGMA_MULT,
        volatility: snapshot.volatility
      });
      const downtrend = indicators.isDowntrend(snapshot);

      console.log(
        '\n  --- What the DIP path sees -------------------------------'
      );
      console.log(
        `  composite score ${n(score, 0)} (needs >= ${config.SIGNAL_BUY_SCORE_MIN})  RSI ${n(snapshot.rsi, 0)}  %B ${n(snapshot.bollinger?.pctB)}`
      );
      console.log(`  30-day high ${n(recentHigh)} -> buy level ${n(buyLevel)}`);
      console.log(
        `  price ${n(price)} ${price <= buyLevel ? '<=' : '>'} buy level  ->  ${price <= buyLevel ? 'dip trigger MET' : 'NOT a dip (price too high)'}`
      );
      console.log(`  downtrend guard: ${downtrend ? 'BLOCKED' : 'clear'}`);
      const isDip =
        score >= config.SIGNAL_BUY_SCORE_MIN && !downtrend && price <= buyLevel;
      console.log(`  => DIP would ${isDip ? 'FIRE' : 'NOT fire'}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
