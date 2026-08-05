'use strict';
/**
 * Compares the two SIGNAL_EXIT_MODE strategies over a frozen price snapshot,
 * so the choice rests on measured numbers rather than recollection.
 *
 *   hold-with-stop - no take-profit, one wide fixed peak-trailing stop
 *                    (SIGNAL_HOLD_TRAIL_PCT); "let winners run"
 *   trailing       - volatility-scaled stop, then take-profit hands off to a
 *                    1-sigma trailing stop
 *
 * Deterministic: BacktestService.simulate has no RNG, clock or network, and
 * the price data is read from a snapshot file rather than the live DB, so
 * repeated runs are byte-identical and two strategies are compared on exactly
 * the same bars.
 *
 * Snapshot the prices first (one row per symbol per calendar day - the
 * service filters to trading days itself):
 *   docker exec gf-postgres-dev psql -U ghostuser -d ghostfolio-db -t -A -F',' \
 *     -c "SELECT md.symbol, md.date::date, md.\"marketPrice\" FROM \"MarketData\" md
 *         JOIN \"SymbolProfile\" sp ON sp.symbol = md.symbol AND sp.\"dataSource\" = md.\"dataSource\"
 *         JOIN \"_UserWatchlist\" uw ON uw.\"A\" = sp.id
 *         WHERE md.\"dataSource\" = 'YAHOO' AND md.state = 'CLOSE'
 *           AND md.date BETWEEN DATE '2021-08-06' AND DATE '2026-08-04'
 *         ORDER BY md.symbol, md.date;" > prices.csv
 *
 * Usage: AB_DIR=/path/with/prices.csv node run-exit-mode-backtest.cjs
 */

const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('@ghostfolio/common/')) {
    const sub = request.slice('@ghostfolio/common/'.length);
    request = path.join(
      __dirname,
      'dist-test-signals/libs/common/src/lib',
      sub
    );
  } else if (request.startsWith('@ghostfolio/api/')) {
    const sub = request.slice('@ghostfolio/api/'.length);
    request = path.join(__dirname, 'dist-test-signals/apps/api/src', sub);
  }
  return originalResolve.call(this, request, ...args);
};

const {
  BacktestService
} = require('./dist-test-signals/apps/api/src/services/signals/backtest.service.js');
const {
  IndicatorsService
} = require('./dist-test-signals/apps/api/src/services/signals/indicators.service.js');

const AB_DIR = process.env.AB_DIR || path.join(__dirname, 'backtest-data');
const SNAPSHOT = path.join(AB_DIR, 'prices.csv');
// One year of trading bars before the first trade, so SMA200 and momentum12M
// are warm and the scorer under test is the whole scorer.
const WARMUP_BARS = 261;

// marketDataService is only touched by backtest(); run() never uses it.
const service = new BacktestService(new IndicatorsService(), null);

function loadSnapshot(file) {
  const bySymbol = new Map();

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    const [symbol, date, price] = line.split(',');
    const marketPrice = Number(price);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) continue;
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol
      .get(symbol)
      .push({ date: new Date(`${date}T00:00:00.000Z`), marketPrice });
  }

  return bySymbol;
}

const median = (nums) => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const mean = (nums) =>
  nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;

function summarise(label, results) {
  // Most watchlist names never trigger a dip-buy over the window, so a median
  // across ALL symbols collapses to 0 and says nothing. Pool the real trades,
  // and restrict per-symbol stats to symbols that actually traded.
  const allTrades = results.flatMap((r) =>
    r.trades.filter((t) => t.exitReason !== 'OPEN')
  );
  const traded = results.filter(
    (r) => r.trades.filter((t) => t.exitReason !== 'OPEN').length > 0
  );
  const wins = allTrades.filter((t) => t.netReturnPct > 0);
  const grossGain = wins.reduce((s, t) => s + t.netReturnPct, 0);
  const grossLoss = Math.abs(
    allTrades
      .filter((t) => t.netReturnPct <= 0)
      .reduce((s, t) => s + t.netReturnPct, 0)
  );
  const edges = traded.map((r) => r.totalNetReturnPct - r.benchmarkReturnPct);

  return {
    label,
    symbolsTraded: traded.length,
    totalTrades: allTrades.length,
    pooledWinRatePct: +((wins.length / (allTrades.length || 1)) * 100).toFixed(
      2
    ),
    avgTradeNetReturnPct: +mean(allTrades.map((t) => t.netReturnPct)).toFixed(
      3
    ),
    pooledProfitFactor: +(grossGain / (grossLoss || 1)).toFixed(3),
    avgHoldingTradingDays: +mean(allTrades.map((t) => t.holdingDays)).toFixed(
      1
    ),
    medianNetReturnPct: +median(traded.map((r) => r.totalNetReturnPct)).toFixed(
      2
    ),
    medianCagrPct: +median(traded.map((r) => r.cagrPct)).toFixed(2),
    medianSharpe: +median(traded.map((r) => r.sharpe)).toFixed(3),
    medianSortino: +median(traded.map((r) => r.sortino)).toFixed(3),
    medianMaxDrawdownPct: +median(traded.map((r) => r.maxDrawdownPct)).toFixed(
      2
    ),
    // The benchmark is 100%-invested buy-and-hold while the strategy sits in
    // cash most of the time, so read the edge alongside exposure.
    medianExposurePct: +median(traded.map((r) => r.exposurePct)).toFixed(1),
    medianBenchmarkReturnPct: +median(
      traded.map((r) => r.benchmarkReturnPct)
    ).toFixed(2),
    medianEdgeVsBenchmarkPct: +median(edges).toFixed(2),
    beatBenchmarkPct: +(
      (edges.filter((e) => e > 0).length / (edges.length || 1)) *
      100
    ).toFixed(1),
    stopLossExits: results.reduce((s, r) => s + r.stopLossExits, 0),
    trailingExits: results.reduce((s, r) => s + r.trailingExits, 0)
  };
}

function runMode(exitMode, bySymbol) {
  const results = [];

  for (const [symbol, series] of bySymbol) {
    if (series.length <= WARMUP_BARS + 60) continue;

    try {
      results.push(
        service.run({
          buyDropPct: 0.1,
          dataSource: 'YAHOO',
          exitMode,
          series,
          symbol,
          takeProfitPct: 0.3,
          warmupBars: WARMUP_BARS
        })
      );
    } catch {
      // A symbol with unusable history should not abort the whole sweep.
    }
  }

  return summarise(exitMode, results);
}

const bySymbol = loadSnapshot(SNAPSHOT);
const summary = {
  snapshot: SNAPSHOT,
  symbols: bySymbol.size,
  warmupBars: WARMUP_BARS,
  modes: [runMode('hold-with-stop', bySymbol), runMode('trailing', bySymbol)]
};

console.log(JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(AB_DIR, 'exit-mode-comparison.json'),
  JSON.stringify(summary, null, 2)
);
