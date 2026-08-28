'use strict';
/**
 * Backtests the Minervini leader entry against buy-and-hold, in the same format
 * as the §0.3 verdict that falsified the dip engine (153 names, 29% beat
 * buy-and-hold, mean edge -23.5pp, median -11.3pp).
 *
 * The entry signals are computed ONCE and then replayed through four different
 * exits. That separates the two questions §0.3 could not: is the entry bad, or
 * is the exit mismatched to it? The live exit takes profit at 1.5σ, which is
 * structurally at odds with Minervini's doctrine of cutting at 7-8% and letting
 * winners run to 20-30%+.
 *
 * Look-ahead discipline:
 *   - RS ranks are recomputed at each weekly rebalance using only bars dated
 *     <= that date (CrossSectionalService.asOf);
 *   - a signal derived from day D's close is filled at day D+1's OPEN.
 *
 * Read-only. Compile first: npx tsc -p tsconfig.signals-test.json
 * Usage: node run-leader-backtest.cjs [--positionSize=550]
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
const fees = require('./dist-test-signals/libs/common/src/lib/nordnet-fees.js');

/** Round-trip Nordnet commission for a position, replacing the retired flat fee. */
const roundTrip = (tradeValueUsd, symbol) =>
  fees.nordnetRoundTripUsd({
    commissionClass: config.SIGNAL_NORDNET_COMMISSION_CLASS,
    isNordic: fees.isNordicSymbol(symbol ?? ''),
    sekPerUsd: config.SIGNAL_SEK_PER_USD_FALLBACK,
    tradeValueUsd
  });

const WARMUP = 252;
const REBALANCE_EVERY = 5; // trading days between RS recomputations

/**
 * The live exit is `current`. The others exist to separate "the entry is bad"
 * from "the exit is mismatched to this entry" — a 1.5σ take-profit caps exactly
 * the runaway winners a breakout method exists to catch.
 */
const EXIT_VARIANTS = {
  current: { kind: 'vol' },
  minervini: { kind: 'fixed', stopPct: 0.075, trailPct: 0.18 },
  holdWithStop: { kind: 'fixed', stopPct: 0.075, trailPct: 0.25 },
  wideTrail: { kind: 'fixed', stopPct: 0.1, trailPct: 0.35 }
};

const pct = (v) => `${(v * 100).toFixed(1)}%`;

function dailySigma(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (returns.length < 20) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function simulate({ bars, entrySignals, positionSize, slip, symbol, variant }) {
  const trades = [];
  let position = null;
  let nextEntryIndex = 0;
  let heldBars = 0;

  for (let i = WARMUP; i < bars.length; i++) {
    const bar = bars[i];

    if (!position && entrySignals.has(i) && i >= nextEntryIndex) {
      const sigma = dailySigma(
        bars.slice(Math.max(0, i - WARMUP), i).map((b) => b.close)
      );
      if (!sigma) continue;
      const entryPrice = bar.open * (1 + slip);
      position = {
        band: sigma * Math.sqrt(config.SIGNAL_HORIZON_DAYS),
        entryDate: bar.date,
        entryPrice,
        peak: entryPrice,
        tookProfit: false
      };
      continue;
    }

    if (!position) continue;

    heldBars++;
    position.peak = Math.max(position.peak, bar.high);

    let exitPrice = null;
    let reason = null;

    if (variant.kind === 'vol') {
      const stop =
        position.entryPrice * (1 - config.SIGNAL_STOP_VOL_MULT * position.band);
      const target =
        position.entryPrice *
        (1 +
          Math.max(
            config.SIGNAL_TAKE_PROFIT_FLOOR_PCT,
            config.SIGNAL_TAKE_PROFIT_VOL_MULT * position.band
          ));
      const trail =
        position.peak * (1 - config.SIGNAL_TRAIL_VOL_MULT * position.band);

      if (!position.tookProfit && bar.low <= stop) {
        exitPrice = stop;
        reason = 'STOP';
      } else if (!position.tookProfit && bar.high >= target) {
        position.tookProfit = true; // hand off to the trail
      } else if (position.tookProfit && bar.low <= trail) {
        exitPrice = trail;
        reason = 'TRAIL';
      }
    } else {
      // One hard percentage stop, then a wide peak trail and NO take-profit,
      // so a winner is never capped.
      const stop = position.entryPrice * (1 - variant.stopPct);
      const trail = position.peak * (1 - variant.trailPct);

      if (bar.low <= trail && trail > stop) {
        exitPrice = trail;
        reason = 'TRAIL';
      } else if (bar.low <= stop) {
        exitPrice = stop;
        reason = 'STOP';
      }
    }

    if (exitPrice !== null) {
      const exit = exitPrice * (1 - slip);
      const shares = positionSize / position.entryPrice;
      const net =
        (exit - position.entryPrice) * shares - roundTrip(positionSize, symbol);

      trades.push({
        entryDate: position.entryDate,
        exitDate: bar.date,
        netReturnPct: net / positionSize,
        reason
      });
      position = null;
      nextEntryIndex = i + 1;
    }
  }

  if (position) {
    const last = bars[bars.length - 1];
    const shares = positionSize / position.entryPrice;
    const net =
      (last.close - position.entryPrice) * shares -
      roundTrip(positionSize, symbol);
    trades.push({
      entryDate: position.entryDate,
      exitDate: last.date,
      netReturnPct: net / positionSize,
      reason: 'OPEN'
    });
  }

  return { heldBars, trades };
}

async function main() {
  loadEnv();

  const args = { positionSize: config.SIGNAL_BACKTEST_POSITION_SIZE };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--positionSize='))
      args.positionSize = Number(arg.slice(15));
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

    const symbols = Object.keys(barsBySymbol).filter(
      (s) => barsBySymbol[s].length >= WARMUP + 60
    );
    console.log(
      `[backtest] ${symbols.length} symbols · position $${args.positionSize} · fees ${roundTrip(args.positionSize, 'AAPL').toFixed(2)} round trip · slippage ${config.SIGNAL_BACKTEST_SLIPPAGE_BPS}bps`
    );

    const screen = new LeaderScreenService(new IndicatorsService());
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
      `[backtest] ${rebalanceDates.length} weekly rebalances, ${rebalanceDates[0]} to ${rebalanceDates[rebalanceDates.length - 1]}`
    );

    // Entry signals are variant-independent, so compute them once.
    const signalsBySymbol = new Map();
    for (const symbol of symbols) {
      const bars = barsBySymbol[symbol];
      const dateToIndex = new Map(bars.map((b, i) => [b.date, i]));
      const entrySignals = new Set();

      for (const rebalanceDate of rebalanceDates) {
        const i = dateToIndex.get(rebalanceDate);
        if (i === undefined || i < WARMUP || !bars[i + 1]) continue;
        const visible = bars.slice(0, i + 1);
        const trend = screen.trendTemplate({
          bars: visible,
          rsRank: rsByDate.get(rebalanceDate)[symbol] ?? null
        });
        if (!trend?.passed) continue;
        const vcp = screen.vcpStructure(visible);
        if (vcp?.isValid && vcp.breakout) entrySignals.add(i + 1);
      }

      signalsBySymbol.set(symbol, entrySignals);
    }

    const signalCount = [...signalsBySymbol.values()].reduce(
      (s, set) => s + set.size,
      0
    );
    console.log(
      `[backtest] ${signalCount} breakout signals across ${[...signalsBySymbol.values()].filter((s) => s.size > 0).length} names\n`
    );

    const slip = config.SIGNAL_BACKTEST_SLIPPAGE_BPS / 10000;
    const summaries = [];

    for (const [variantName, variant] of Object.entries(EXIT_VARIANTS)) {
      const results = [];
      let totalTrades = 0;
      let heldBars = 0;
      let possibleBars = 0;

      for (const symbol of symbols) {
        const bars = barsBySymbol[symbol];
        possibleBars += bars.length - WARMUP;

        const { heldBars: held, trades } = simulate({
          bars,
          entrySignals: signalsBySymbol.get(symbol),
          positionSize: args.positionSize,
          slip,
          symbol,
          variant
        });

        heldBars += held;
        if (trades.length === 0) continue;

        const strategyReturn =
          trades.reduce((acc, t) => acc * (1 + t.netReturnPct), 1) - 1;
        const benchmarkReturn =
          bars[bars.length - 1].close / bars[WARMUP].close - 1;

        totalTrades += trades.length;
        results.push({
          benchmarkReturn,
          edge: strategyReturn - benchmarkReturn,
          strategyReturn,
          symbol,
          trades: trades.length,
          wins: trades.filter((t) => t.netReturnPct > 0).length
        });
      }

      const beat = results.filter((r) => r.edge > 0);
      const edges = results.map((r) => r.edge);
      const wins = results.reduce((s, r) => s + r.wins, 0);

      summaries.push({
        beatPct: results.length ? beat.length / results.length : 0,
        exposure: possibleBars ? heldBars / possibleBars : 0,
        meanEdge: edges.length
          ? edges.reduce((s, e) => s + e, 0) / edges.length
          : 0,
        medianEdge: median(edges),
        names: results.length,
        results,
        totalTrades,
        variantName,
        winRate: totalTrades ? wins / totalTrades : 0
      });
    }

    console.log('='.repeat(88));
    console.log('LEADER ENTRY — identical signals, four exits');
    console.log('='.repeat(88));
    console.log(
      '  exit           names  trades  win-rate  exposure  beat-B&H    mean-edge  median-edge'
    );
    for (const s of summaries) {
      console.log(
        `  ${s.variantName.padEnd(13)} ${String(s.names).padStart(5)}  ${String(s.totalTrades).padStart(6)}  ` +
          `${pct(s.winRate).padStart(8)}  ${pct(s.exposure).padStart(8)}  ${pct(s.beatPct).padStart(8)}  ` +
          `${(s.meanEdge * 100).toFixed(1).padStart(10)}pp  ${(s.medianEdge * 100).toFixed(1).padStart(9)}pp`
      );
    }
    console.log('');
    console.log(
      '  §0.3 dip-engine baseline: 29% beat, mean -23.5pp, median -11.3pp, exposure ~31%'
    );
    console.log('='.repeat(88));

    const best = summaries.reduce((a, b) =>
      b.medianEdge > a.medianEdge ? b : a
    );
    const sorted = [...best.results].sort((a, b) => b.edge - a.edge);

    console.log(`\n  Best variant by median edge: ${best.variantName}`);
    console.log('\n  Best 6 by edge:');
    for (const r of sorted.slice(0, 6)) {
      console.log(
        `    ${r.symbol.padEnd(12)} strat ${pct(r.strategyReturn).padStart(8)}  hold ${pct(r.benchmarkReturn).padStart(9)}  edge ${(r.edge * 100).toFixed(1).padStart(8)}pp  ${r.trades}t`
      );
    }
    console.log('\n  Worst 6 by edge:');
    for (const r of sorted.slice(-6)) {
      console.log(
        `    ${r.symbol.padEnd(12)} strat ${pct(r.strategyReturn).padStart(8)}  hold ${pct(r.benchmarkReturn).padStart(9)}  edge ${(r.edge * 100).toFixed(1).padStart(8)}pp  ${r.trades}t`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[backtest] fatal:', e);
  process.exit(1);
});
