import { AssetClass, AssetSubClass, DataSource, Type } from '@prisma/client';
import { JobOptions, JobStatus } from 'bull';
import ms from 'ms';

import { NordnetCommissionClass } from './nordnet-fees';
import { ColorScheme, DateRange } from './types';

export const ghostfolioPrefix = 'GF';
export const ghostfolioScraperApiSymbolPrefix = `_${ghostfolioPrefix}_`;
export const ghostfolioFearAndGreedIndexDataSourceCryptocurrencies =
  DataSource.MANUAL;
export const ghostfolioFearAndGreedIndexDataSourceStocks = DataSource.RAPID_API;
export const ghostfolioFearAndGreedIndexSymbol = `${ghostfolioScraperApiSymbolPrefix}FEAR_AND_GREED_INDEX`;
export const ghostfolioFearAndGreedIndexSymbolCryptocurrencies = `${ghostfolioPrefix}_FEAR_AND_GREED_INDEX_CRYPTOCURRENCIES`;
export const ghostfolioFearAndGreedIndexSymbolStocks = `${ghostfolioPrefix}_FEAR_AND_GREED_INDEX_STOCKS`;

export const locale = 'en-US';

export const primaryColorHex = '#36cfcc';
export const primaryColorRgb = {
  r: 54,
  g: 207,
  b: 204
};

export const secondaryColorHex = '#3686cf';
export const secondaryColorRgb = {
  r: 54,
  g: 134,
  b: 207
};

export const warnColorHex = '#dc3545';
export const warnColorRgb = {
  r: 220,
  g: 53,
  b: 69
};

export const ASSET_CLASS_MAPPING = new Map<AssetClass, AssetSubClass[]>([
  [AssetClass.ALTERNATIVE_INVESTMENT, [AssetSubClass.COLLECTIBLE]],
  [AssetClass.COMMODITY, [AssetSubClass.PRECIOUS_METAL]],
  [
    AssetClass.EQUITY,
    [
      AssetSubClass.ETF,
      AssetSubClass.MUTUALFUND,
      AssetSubClass.PRIVATE_EQUITY,
      AssetSubClass.STOCK
    ]
  ],
  [AssetClass.FIXED_INCOME, [AssetSubClass.BOND, AssetSubClass.LOAN]],
  [AssetClass.LIQUIDITY, [AssetSubClass.CRYPTOCURRENCY]],
  [AssetClass.REAL_ESTATE, []]
]);

export const BULL_BOARD_COOKIE_NAME = 'bull_board_token';

/**
 * WARNING: This route is mirrored in `apps/client/proxy.conf.json`.
 * If you update this value, you must also update the proxy configuration.
 */
export const BULL_BOARD_ROUTE = '/admin/queues';

/**
 * Trailing window the 50/200-day benchmark trends are computed over, in days.
 *
 * MUST exceed 2 x 200, because calculateBenchmarkTrend needs two full periods
 * to compare and MarketData carries at most one row per calendar day. The
 * previous value was exactly 400, which yields at most 400 calendar days and
 * measured 399 rows in practice - so trend200d evaluated to UNKNOWN for EVERY
 * symbol, while still paying to fetch the whole window. 420 restores the
 * comparison with a fortnight of slack for gaps.
 */
export const BENCHMARK_TREND_WINDOW_DAYS = 420;

/**
 * How long the assembled watchlist rows are reused, in milliseconds.
 *
 * Matches SIGNAL_WATCHLIST_METRICS_CACHE_TTL so both halves of the Watchlist
 * page expire together rather than one refetching while the other is still warm.
 */
export const WATCHLIST_ITEMS_CACHE_TTL = 5 * 60 * 1000;

export const CACHE_TTL_NO_CACHE = 1;
export const CACHE_TTL_INFINITE = 0;

export const DATA_GATHERING_QUEUE = 'DATA_GATHERING_QUEUE';
export const DATA_GATHERING_QUEUE_PRIORITY_HIGH = 1;
export const DATA_GATHERING_QUEUE_PRIORITY_LOW = Number.MAX_SAFE_INTEGER;
export const DATA_GATHERING_QUEUE_PRIORITY_MEDIUM = Math.round(
  DATA_GATHERING_QUEUE_PRIORITY_LOW / 2
);

export const PORTFOLIO_SNAPSHOT_COMPUTATION_QUEUE =
  'PORTFOLIO_SNAPSHOT_COMPUTATION_QUEUE';
export const PORTFOLIO_SNAPSHOT_COMPUTATION_QUEUE_PRIORITY_HIGH = 1;
export const PORTFOLIO_SNAPSHOT_COMPUTATION_QUEUE_PRIORITY_LOW =
  Number.MAX_SAFE_INTEGER;

export const STATISTICS_GATHERING_QUEUE = 'STATISTICS_GATHERING_QUEUE';

export const DEFAULT_COLOR_SCHEME: ColorScheme = 'LIGHT';
export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_DATE_FORMAT_MONTH_YEAR = 'MMM yyyy';
export const DEFAULT_DATE_RANGE: DateRange = 'max';
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_LANGUAGE_CODE = 'en';
export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_PORT = 3333;
export const DEFAULT_PROCESSOR_GATHER_ASSET_PROFILE_CONCURRENCY = 1;
export const DEFAULT_PROCESSOR_GATHER_HISTORICAL_MARKET_DATA_CONCURRENCY = 1;
export const DEFAULT_PROCESSOR_PORTFOLIO_SNAPSHOT_COMPUTATION_CONCURRENCY = 1;
export const DEFAULT_PROCESSOR_PORTFOLIO_SNAPSHOT_COMPUTATION_TIMEOUT = 30000;

export const DEFAULT_REDACTED_PATHS = [
  'accounts[*].balance',
  'accounts[*].balanceInBaseCurrency',
  'accounts[*].comment',
  'accounts[*].dividendInBaseCurrency',
  'accounts[*].interestInBaseCurrency',
  'accounts[*].value',
  'accounts[*].valueInBaseCurrency',
  'activities[*].account.balance',
  'activities[*].account.comment',
  'activities[*].comment',
  'activities[*].fee',
  'activities[*].feeInAssetProfileCurrency',
  'activities[*].feeInBaseCurrency',
  'activities[*].quantity',
  'activities[*].SymbolProfile.symbolMapping',
  'activities[*].SymbolProfile.watchedByCount',
  'activities[*].value',
  'activities[*].valueInBaseCurrency',
  'balance',
  'balanceInBaseCurrency',
  'balances[*].account.balance',
  'balances[*].account.comment',
  'balances[*].value',
  'balances[*].valueInBaseCurrency',
  'comment',
  'dividendInBaseCurrency',
  'feeInBaseCurrency',
  'grossPerformance',
  'grossPerformanceWithCurrencyEffect',
  'historicalData[*].quantity',
  'holdings[*].dividend',
  'holdings[*].grossPerformance',
  'holdings[*].grossPerformanceWithCurrencyEffect',
  'holdings[*].holdings[*].valueInBaseCurrency',
  'holdings[*].investment',
  'holdings[*].netPerformance',
  'holdings[*].netPerformanceWithCurrencyEffect',
  'holdings[*].quantity',
  'holdings[*].valueInBaseCurrency',
  'interestInBaseCurrency',
  'investmentInBaseCurrencyWithCurrencyEffect',
  'netPerformance',
  'netPerformanceWithCurrencyEffect',
  'platforms[*].balance',
  'platforms[*].valueInBaseCurrency',
  'quantity',
  'SymbolProfile.symbolMapping',
  'SymbolProfile.watchedByCount',
  'totalBalanceInBaseCurrency',
  'totalDividendInBaseCurrency',
  'totalInterestInBaseCurrency',
  'totalValueInBaseCurrency',
  'value',
  'valueInBaseCurrency'
];

// USX is handled separately
export const DERIVED_CURRENCIES = [
  {
    currency: 'GBp',
    factor: 100,
    rootCurrency: 'GBP'
  },
  {
    currency: 'ILA',
    factor: 100,
    rootCurrency: 'ILS'
  },
  {
    currency: 'ZAc',
    factor: 100,
    rootCurrency: 'ZAR'
  }
];

export const GATHER_ASSET_PROFILE_PROCESS_JOB_NAME = 'GATHER_ASSET_PROFILE';
export const GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS: JobOptions = {
  attempts: 12,
  backoff: {
    delay: ms('1 minute'),
    type: 'exponential'
  },
  removeOnComplete: true
};

export const GATHER_HISTORICAL_MARKET_DATA_PROCESS_JOB_NAME =
  'GATHER_HISTORICAL_MARKET_DATA';
export const GATHER_HISTORICAL_MARKET_DATA_PROCESS_JOB_OPTIONS: JobOptions = {
  attempts: 12,
  backoff: {
    delay: ms('1 minute'),
    type: 'exponential'
  },
  removeOnComplete: true
};

export const GATHER_STATISTICS_PROCESS_JOB_OPTIONS: JobOptions = {
  attempts: 5,
  backoff: {
    delay: ms('1 minute'),
    type: 'exponential'
  },
  removeOnComplete: true
};

export const TRADING_SIGNALS_QUEUE = 'TRADING_SIGNALS_QUEUE';
export const EVALUATE_TRADING_SIGNALS_PROCESS_JOB_NAME =
  'EVALUATE_TRADING_SIGNALS';
export const EVALUATE_TRADING_SIGNALS_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Scheduled "heartbeat" portfolio report (independent of signal-state changes).
export const PORTFOLIO_REPORT_PROCESS_JOB_NAME = 'PORTFOLIO_REPORT';
export const PORTFOLIO_REPORT_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Daily Minervini leader screen. Daily rather than weekly because a pivot
// breakout is a one- or two-session event: a weekly cadence would report it
// after the move. Research shortlist, not a buy trigger — see docs §0.3b.
export const LEADER_SCREEN_PROCESS_JOB_NAME = 'LEADER_SCREEN';
export const LEADER_SCREEN_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Daily Trend Template entrant alert: names that have just entered 8/8 at
// RS >= 90. Event-driven, so most days it sends nothing.
export const TT8_ENTRANTS_PROCESS_JOB_NAME = 'TT8_ENTRANTS';
export const TT8_ENTRANTS_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Nightly incremental OHLCV gather. Without it nothing in the running
// application ever appends to `OhlcBar`, so the Trend Template, the VCP
// detector, ATR and the cross-sectional RS percentile all read whenever the
// backfill script was last run by hand.
export const OHLC_REFRESH_PROCESS_JOB_NAME = 'OHLC_REFRESH';
export const OHLC_REFRESH_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Twice-monthly Trend Template shortlist digest (1st and 15th).
export const SHORTLIST_PROCESS_JOB_NAME = 'SHORTLIST';
export const SHORTLIST_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Weekly fund recommendation ("which funds to buy" for monthly accumulation).
export const FUND_SIGNALS_PROCESS_JOB_NAME = 'FUND_SIGNALS';
export const FUND_SIGNALS_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Intraday (5-min) reversal check for real tracked positions that have
// already reached their frozen take-profit target (see
// SignalTradeTrackingService). Only touches the handful of TRAILING
// positions, never the full watchlist.
export const INTRADAY_TRAILING_CHECK_PROCESS_JOB_NAME =
  'INTRADAY_TRAILING_CHECK';
export const INTRADAY_TRAILING_CHECK_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Tag used to mark a holding as actively traded (eligible for take-profit SELL signals).
export const SIGNAL_TAG_ACTIVE_TRADE = 'ACTIVE_TRADE';

// Provenance tags on an Order: where the decision to buy actually came from.
//
// These drive the Simulation tab's Tracked lines, and nothing else — no signal,
// gate or threshold reads them. They exist because "did the engine's advice pay
// off?" is unanswerable unless the database records which positions were the
// engine's idea and which were the user's own call. An untagged non-fund order
// still appears in the overall Tracked line but in none of the breakdowns, so a
// missing tag under-reports a bucket rather than corrupting one. Maintained in
// Ghostfolio's own activity dialog; seeded by run-seed-order-tags.cjs.
export const SIGNAL_TAG_PROVENANCE_BET = 'BET';
export const SIGNAL_TAG_PROVENANCE_DIP = 'DIP';
export const SIGNAL_TAG_PROVENANCE_LEADER = 'LEADER';

/**
 * `signalType` for a tracked purchase whose order carries no provenance tag.
 *
 * `SignalTradeTrackingService` writes a `SignalLog` row for every tracked buy,
 * including ones that followed no signal, so the stop/target machinery has
 * something to hang off. It must NOT choose that row's type: the type is the
 * order's provenance tag. Two earlier versions chose one anyway — first `DIP`
 * for everything, then `MANUAL` for everything — and both put positions in
 * curves that did not describe them.
 *
 * UNTAGGED means the record is genuinely incomplete: a real position exists and
 * nobody has said where it came from. It is a prompt to add the tag in
 * Ghostfolio's activity dialog, not a strategy.
 */
export const SIGNAL_TYPE_UNTAGGED = 'UNTAGGED';

/**
 * Hand-set price targets, in each stock's own quote currency.
 *
 * DISPLAY ONLY. Nothing reads these to decide anything — no signal fires, no
 * band moves, no ranking changes. They exist so the Simulation tab can show how
 * far a position is from where the user thinks it is going, next to where the
 * engine's own volatility-scaled take-profit sits.
 *
 * Taken from the "Average" column of the 2026-08-26 valuation sheet, which is
 * the mid case between its Low and High scenarios. A stock listed here uses
 * this number; a stock that is not falls back to the engine's take-profit, and
 * an ETF or fund gets no target at all — a basket has no thesis price.
 */
export const PORTFOLIO_PRICE_TARGETS: Record<string, number> = {
  HPE: 69.81,
  NVDA: 314,
  ORCL: 266,
  WMT: 132
};

// Target allocation for REINVEST suggestions: 80% index funds / 20% individual stocks.
export const SIGNAL_INDEX_RATIO = 0.8;

// Default trading-signal thresholds (overridable per symbol via SignalConfig).
export const SIGNAL_DEFAULT_BUY_DROP_PCT = 0.1;
export const SIGNAL_DEFAULT_TAKE_PROFIT_PCT = 0.15;

// Sigma multiplier for the volatility-scaled leg of the adaptive buy level:
// required drop = max(dropPct, sigmaMult * sigma * sqrt(horizonDays)).
export const SIGNAL_BUY_SIGMA_MULT = 1.5;

// Monthly contribution plan: the ~25th-of-month deposit the auto-plan assumes
// when the cash hasn't been logged yet, and the VIX thresholds for the
// ADVISORY market-regime line (never a hard rule — see docs §0.2).
export const SIGNAL_MONTHLY_CONTRIBUTION_USD = 750;
export const SIGNAL_REGIME_VIX_RISK_OFF = 30;
export const SIGNAL_REGIME_VIX_RISK_ON = 20;

// ETF buy-dip calibration. Diversified ETFs essentially never fall 10% off a
// 30-day high outside a crash (broad index ETFs typically sit 1-3% off), and
// the 1.5-sigma vol-scaled leg pushes volatile thematic ETFs to 20-40%
// required drops — so ETFs get a shallower 5% floor and a 1.0-sigma band.
export const SIGNAL_ETF_BUY_DROP_PCT = 0.05;
export const SIGNAL_ETF_BUY_SIGMA_MULT = 1.0;

// Nordnet brokerage commission. See libs/common/src/lib/nordnet-fees.ts for the
// rate card and the arithmetic; the fee is `fixed + pct × tradeValue` per ORDER,
// so a round trip is charged twice.
//
// The account is on Mini: 0.25% plus 9 SEK on non-Nordic venues, 1 SEK on
// Nordic ones. A $550 US order therefore costs 9 SEK + 13 SEK ≈ $2.33, and the
// round trip ≈ $4.65 (0.85% of the position).
//
// Both terms always apply — the fixed fee is not a floor the percentage can
// replace. So the fee RATE does fall with size (2.40% round trip at $100, 0.85%
// at $550, approaching 0.50% for large orders): trading larger amortises the
// fixed component, with diminishing returns past the ~$380 parity point.
export const SIGNAL_NORDNET_COMMISSION_CLASS: NordnetCommissionClass = 'MINI';
// Fallback SEK/USD used by pure paths (backtests, unit tests) that have no
// exchange-rate service. Live code should pass the real rate instead.
// 9.4645 was the observed USDSEK close on 2026-08-21.
export const SIGNAL_SEK_PER_USD_FALLBACK = 9.4645;

// Flat position size (USD) the Simulation tab assumes for every paper trade's
// fee-adjusted return, since SignalLog never records a real share count. The
// calculator lets the user override this per-trade with a real $ amount.
export const SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD = 1000;

// Exit style. 'trailing' = the swing state machine (stop → take-profit → tight
// trail). 'hold-with-stop' = no take-profit, only a wide peak-trailing stop.
//
// This previously defaulted to 'hold-with-stop' on the basis that "the
// backtest showed the tight trailing capped winners and lost to buy-and-hold".
// That backtest was not trustworthy: it ran with WARMUP = 50 (below the 252
// bars SMA200/momentum12M need, so the trend and momentum terms were dropped
// from every score), over a sliding 1-year window, on a calendar-day price
// series that deflated volatility ~17% and therefore made the trailing band
// ~17% tighter than intended — handicapping exactly the mode it rejected.
//
// Re-measured over 5 years and 331 watchlist symbols with those defects fixed
// (see run-exit-mode-backtest.cjs), trailing wins decisively:
//   trailing:       77% win rate, profit factor 4.10, median +28.9% (+6.3%/yr)
//   hold-with-stop: 36% win rate, profit factor 1.07, median  −6.6% (−1.7%/yr)
// The mechanism is that hold-with-stop has no stop-loss at all — at entry the
// running peak IS the buy price, so a losing trade slides the full trail width
// before exiting (106 stop-loss exits vs 46 for trailing).
//
// Caveat kept deliberately visible: the backtest evaluates levels on daily
// CLOSES, while a real stop triggers intraday. Trailing's tighter band is more
// exposed to gapping through a level than the wide fixed trail, so the live
// gap should be expected to be narrower than the figures above.
export type SignalExitMode = 'hold-with-stop' | 'trailing';
export const SIGNAL_EXIT_MODE: SignalExitMode = 'trailing';
// Width of the hold-with-stop trailing stop: exit when price falls this far
// below the running peak (≈ give a winner room; cut a loser here too).
export const SIGNAL_HOLD_TRAIL_PCT = 0.22;

// Exit framework: every level uses band = dailyVolatility ×
// √SIGNAL_HORIZON_DAYS as its unit (EOD close-to-close vol).
//
// This is a RISK-GEOMETRY unit, not a prediction of how long a position is
// held — the two used to be conflated in one constant. Measured over 5 years
// and 331 symbols, these 42-day bands produce an average holding period of
// ~266 trading days (~12 months): the trail width is the input, the holding
// period is the outcome. Widening this to "match" the observed 12 months
// would be circular and would scale every level by √(252/42) = 2.45x —
// turning a 16% trailing giveback into 40% and a 33% stop into 80%, i.e.
// removing risk control rather than aligning it. Change this only on backtest
// evidence that a different band width performs better.
export const SIGNAL_HORIZON_DAYS = 42; // ~2 trading months (42 trading days)

// How long a position is actually expected to be held. Used ONLY for the
// forecast layer — reach-probability, the expected-move band, and the horizon
// shown in signal text — never for sizing a stop, target or trail.
//
// Derived from measured behaviour (~266 trading days average hold under the
// trailing exit mode), rounded to a trading year. Previously the forecast
// reused SIGNAL_HORIZON_DAYS, so signals claimed "42 trading days / 8 weeks"
// for trades that genuinely ran ~12 months, and the quoted probability of
// reaching a target was computed over a window ~6x too short — systematically
// pessimistic (e.g. 9% where the real figure over the true holding period is
// ~29%).
export const SIGNAL_FORECAST_HORIZON_DAYS = 252; // ~12 trading months
// Take-profit never targets less than +13.4% over the fee-adjusted cost basis,
// otherwise scales up with the stock's own expected move over the horizon.
// Scaled from the old 8% (set for the 15-day horizon) by √(42/15) ≈ 1.673 so
// reach-probability/EV stay as conservative at 42 days as they
// were at 15 — otherwise a fixed 8% target gets strictly easier to reach
// (in the terminal-probability sense) purely by giving it more calendar
// time, with nothing about the stock itself improving.
export const SIGNAL_TAKE_PROFIT_FLOOR_PCT = 0.134;
export const SIGNAL_TAKE_PROFIT_VOL_MULT = 1.5; // target band: 1.5σ over the horizon
export const SIGNAL_STOP_VOL_MULT = 2; // stop-loss: 2σ below entry (defined downside)
export const SIGNAL_TRAIL_VOL_MULT = 1; // trailing stop: 1σ below the running peak

// Real-buy tracking (see SignalTradeTrackingService). A real BUY Order is
// only even considered for tracking if it's within this many days old — and,
// within that, only looks for a matching engine signal within this many days
// beforehand...
export const SIGNAL_TRACKED_TRADE_LOOKBACK_DAYS = 45;
// ...but only actually FREEZES that signal's own stop/target if it fired
// within this much tighter window of the real purchase (a signal can re-fire
// repeatedly for the same ticker over weeks as conditions recur — matching
// to a stale one whose entry price has nothing to do with the real fill
// would freeze a nonsensical target). Beyond this gap, a fresh target/stop is
// computed straight from the real buy price instead (see
// computeFreshLevels), so tracking always anchors to when you actually
// bought, not an old, unrelated signal fire.
//
// Widened 5 -> 14 on 2026-08-27, from measurement rather than preference: the
// real AMZN purchase followed its dip signal by EIGHT days, so at 5 the signal
// that actually prompted the trade was discarded and the buy was recorded as
// unsignalled. The engine was being denied credit for calls it made. 14 covers
// how this account actually trades — a signal is reviewed and acted on within a
// fortnight — while still refusing a genuinely stale match (SEC0.DE, acted on
// 23 days later, correctly stays unattributed).
export const SIGNAL_TRACKED_TRADE_MAX_MATCH_GAP_DAYS = 14;

// Default lookback window when a new ticker is added to the watchlist — long
// enough for longer-horizon indicators/charts, not just the signals engine's
// own ~2-month lifetime.
export const SIGNAL_WATCHLIST_HISTORY_YEARS = 5;

// Trailing window for the realised-volatility estimate, in TRADING days (one
// year). Pinned so that σ — and therefore every stop, target and trailing
// band derived from it — does not silently shift when the history-fetch
// window below is retuned.
export const SIGNAL_VOLATILITY_LOOKBACK_DAYS = 252;

// How much raw MarketData history to load for indicator evaluation, in
// CALENDAR days (the table stores one row per calendar day). It must survive
// the weekday filter with enough TRADING days left for the longest window any
// indicator uses — momentum12M and sma200 need 252 — so this is sized as
// 252 trading days ≈ 353 calendar days, plus headroom for holidays and gaps.
// At 400 the margin was only ~34 sessions, and any gap silently nulled
// sma200/momentum12M, dropping their terms from the composite score.
export const SIGNAL_HISTORY_FETCH_DAYS = 520;

// Once a tracked position's frozen take-profit is reached, it stops watching
// the (now-stale) daily band and starts riding the trend, watched every 5 min
// via intraday bars — reusing the same volatility-scaled trailing-stop shape
// as SIGNAL_TRAIL_VOL_MULT above, just with intraday inputs instead of daily.
export const SIGNAL_INTRADAY_MIN_BARS = 6; // ~30 min of 5-min bars before trusting the vol estimate
export const SIGNAL_INTRADAY_HORIZON_BARS = 6; // horizon for the intraday band, in 5-min bars
export const SIGNAL_INTRADAY_TRAIL_VOL_MULT = 2; // looser than the daily 1x — intraday noise is proportionally larger over a short horizon

// BUY hardening: minimum composite "buy attractiveness" score (0–100) and the
// news-sentiment floor ([-1, +1]) below which a dip-buy is suppressed.
export const SIGNAL_BUY_SCORE_MIN = 55;
export const SIGNAL_NEWS_BUY_FLOOR = -0.2;

// Reversal (counter-trend, bear-market) BUY path: a beaten-down name may signal
// only on a confirmed reversal — RSI rising but still below this ceiling (not yet
// overbought; the oversold washout happened during the decline), a higher-low, a
// reclaim of the 20-day — and capitulation/participation volume at least this
// multiple of the 20-day average. Always flagged as higher-risk.
export const SIGNAL_REVERSAL_RSI_MAX = 70;
export const SIGNAL_REVERSAL_VOLUME_RATIO = 1.3;

// Notional position size (USD) the backtest assumes per trade, so the
// round-trip fee is expressed as a realistic drag.
//
// Because the commission is `fixed + pct`, the fixed 9 SEK always amortises:
// the round trip is 2.40% of a $100 position, 1.26% at $250, 0.85% at $550 and
// 0.69% at $1,000, flattening out toward 0.50%. Bigger is genuinely cheaper per
// dollar traded, with sharply diminishing returns past the ~$380 parity point.
//
// 550 matches the user's stated preference of $500-600 per trade and sits where
// the curve has mostly flattened.
export const SIGNAL_BACKTEST_POSITION_SIZE = 550;
// Floor for a real (non-backtest) buy. At $400 the round trip is ~$3.90, just
// under 1% of the position; below that the fixed 9 SEK per order starts to
// dominate and the effective rate climbs quickly (1.26% at $250, 2.40% at $100).
// See commissionParityUsd in nordnet-fees.ts.
export const SIGNAL_MIN_POSITION_USD = 400;
// Slippage per side (basis points) charged in the backtest — a partial proxy for
// bid/ask spread and gapping through stops that EOD data cannot model exactly.
export const SIGNAL_BACKTEST_SLIPPAGE_BPS = 10;

// Budget strategies: minimum investable cash (base currency) before any
// strategy is proposed, and the minimum cash increase that counts as a "reset"
// (new budget / sale proceeds) to re-fire strategies.
export const SIGNAL_STRATEGY_MIN_CASH = 50;
export const SIGNAL_STRATEGY_CASH_DELTA = 50;
// Index instrument used for the 80% leg of the "Safe 80/20" strategy.
export const SIGNAL_STRATEGY_INDEX_SYMBOL = 'NORDNET_GLOBAL_INDEX';
export const SIGNAL_STRATEGY_INDEX_NAME = 'Nordnet Global Index';
export const SIGNAL_STRATEGY_INDEX_RATIO = 0.8;

// Portfolio rebalance target: 60% funds / 40% stocks. Monthly contributions are
// split toward this target (under-weight sleeve gets more of the new cash).
// Changed from 67/33 on 2026-07-09 (user decision: slightly more aggressive
// tilt for the 750 USD/month plan while quality names trade at a discount).
export const SIGNAL_PORTFOLIO_FUNDS_RATIO = 0.6;
export const SIGNAL_PORTFOLIO_STOCKS_RATIO = 0.4;
// How many diversified funds the weekly recommendation / funds sleeve suggests.
export const SIGNAL_FUND_RECOMMENDATION_COUNT = 4;

// The window in which a past BUY still counts as "recently signalled" for the
// re-confirmation control.
export const SIGNAL_RECENT_SIGNAL_WINDOW = ms('14 days');
// Liquidity/risk cap: exclude names whose annualised volatility exceeds this
// from buy recommendations (a proxy for wild, illiquid, blow-up-prone stocks).
export const SIGNAL_MAX_ANNUAL_VOL = 0.9;
// Quality gate for strategy eligibility: a composite-score floor that drops
// no-history / junk names (score 0) before the expected-value ranking. Lower
// than the strict BUY gate (55) since strategies rank a broader universe.
export const SIGNAL_STRATEGY_SCORE_FLOOR = 45;

// Fee-aware basket sizing: fees should never eat more than ~10% of a
// strategy's cash budget. Every extra leg is another order and therefore
// another fixed 9 SEK on top of the percentage, so splitting a small budget
// across many tickers is genuinely expensive. When the summed commission
// exceeds this share, drop the lowest-ranked (by EV) pick and recheck.
export const SIGNAL_STRATEGY_MAX_FEE_RATIO = 0.1;

// Fund-sleeve overlap: a stock/ETF candidate is flagged redundant when its
// category matches a held-fund category that already represents more than
// this fraction of the tracked fund sleeve's value — de-prioritized, not
// excluded, so the user can still see it.
export const SIGNAL_STRATEGY_REDUNDANCY_THRESHOLD = 0.4;

// Penalty applied to a redundant candidate's expected-value ranking key so it
// sorts behind non-redundant picks of similar quality without being hidden
// outright. Applied sign-safely (see penalisedExpectedValue): expected values
// are routinely NEGATIVE, and naively multiplying a negative EV by this factor
// makes it larger, which promoted redundant candidates instead of demoting
// them.
export const SIGNAL_STRATEGY_REDUNDANCY_PENALTY = 0.5;

// Fund-vs-fund overlap floor (recommendFunds): a candidate's risk-adjusted
// momentum is multiplied by max(FLOOR, 1 - ownedOverlapExposure), where
// ownedOverlapExposure is the dollar-weighted share of the fund sleeve that
// already conceptually duplicates the candidate's holdings. This is a
// CONTINUOUS penalty (not a threshold cliff like SIGNAL_STRATEGY_REDUNDANCY_
// THRESHOLD above) — a fund overlapping a SMALL existing position is barely
// penalized, one overlapping a LARGE existing position is penalized toward
// (never to) this floor. "De-prioritize, never exclude": a strong enough
// momentum edge always survives the floor and can still win.
export const SIGNAL_FUND_OVERLAP_PENALTY_FLOOR = 0.4;

// Pre-buy screen (advisory only — shown with a fired BUY signal, never blocks
// it; these filters look good on one month of simulation data but are
// unvalidated as hard rules).
// Sector tailwind: average 3-month return across watchlist symbols sharing
// the candidate's catalog category. Above +3% = RISING, below -3% = FALLING.
export const SIGNAL_SCREEN_SECTOR_TAILWIND_PCT = 3;
// Analyst rating trend: net-buy-ratio delta (latest month vs prior month)
// beyond which the trend counts as IMPROVING/DETERIORATING instead of FLAT.
export const SIGNAL_SCREEN_ANALYST_TREND_DELTA = 0.15;
// EPS revision trend: relative change of the current-year consensus EPS
// estimate vs 30 days ago beyond which it counts as UP/DOWN instead of FLAT.
export const SIGNAL_SCREEN_EPS_REVISION_PCT = 2;

// Cash balance (in base currency) above which a REINVEST suggestion is raised.
export const SIGNAL_DEFAULT_CASH_THRESHOLD = 250;

// Cooldown before the same signal can notify again (prevents flapping).
export const SIGNAL_NOTIFICATION_COOLDOWN = ms('6 hours');

export const GATHER_STATISTICS_DOCKER_HUB_PULLS_PROCESS_JOB_NAME =
  'GATHER_STATISTICS_DOCKER_HUB_PULLS';

export const GATHER_STATISTICS_GITHUB_CONTRIBUTORS_PROCESS_JOB_NAME =
  'GATHER_STATISTICS_GITHUB_CONTRIBUTORS';

export const GATHER_STATISTICS_GITHUB_STARGAZERS_PROCESS_JOB_NAME =
  'GATHER_STATISTICS_GITHUB_STARGAZERS';

export const GATHER_STATISTICS_UPTIME_PROCESS_JOB_NAME =
  'GATHER_STATISTICS_UPTIME';

export const INVESTMENT_ACTIVITY_TYPES = [
  Type.BUY,
  Type.DIVIDEND,
  Type.SELL
] as Type[];

export const PORTFOLIO_SNAPSHOT_PROCESS_JOB_NAME = 'PORTFOLIO';
export const PORTFOLIO_SNAPSHOT_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true
};

export const HEADER_KEY_IMPERSONATION = 'Impersonation-Id';
export const HEADER_KEY_TIMEZONE = 'Timezone';
export const HEADER_KEY_TOKEN = 'Authorization';
export const HEADER_KEY_SKIP_INTERCEPTOR = 'X-Skip-Interceptor';

export const MAX_TOP_HOLDINGS = 50;

export const NUMERICAL_PRECISION_THRESHOLD_3_FIGURES = 100;
export const NUMERICAL_PRECISION_THRESHOLD_5_FIGURES = 10000;
export const NUMERICAL_PRECISION_THRESHOLD_6_FIGURES = 100000;

export const PROPERTY_API_KEY_GHOSTFOLIO = 'API_KEY_GHOSTFOLIO';
export const PROPERTY_API_KEY_OPENROUTER = 'API_KEY_OPENROUTER';
export const PROPERTY_BENCHMARKS = 'BENCHMARKS';
export const PROPERTY_BETTER_UPTIME_MONITOR_ID = 'BETTER_UPTIME_MONITOR_ID';
export const PROPERTY_DOCKER_HUB_PULLS = 'DOCKER_HUB_PULLS';
export const PROPERTY_GITHUB_CONTRIBUTORS = 'GITHUB_CONTRIBUTORS';
export const PROPERTY_GITHUB_STARGAZERS = 'GITHUB_STARGAZERS';
export const PROPERTY_COUNTRIES_OF_SUBSCRIBERS = 'COUNTRIES_OF_SUBSCRIBERS';
export const PROPERTY_COUPONS = 'COUPONS';
export const PROPERTY_CURRENCIES = 'CURRENCIES';
export const PROPERTY_CUSTOM_CRYPTOCURRENCIES = 'CUSTOM_CRYPTOCURRENCIES';
export const PROPERTY_DATA_SOURCE_MAPPING = 'DATA_SOURCE_MAPPING';
export const PROPERTY_DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER_MAX_REQUESTS =
  'DATA_SOURCES_GHOSTFOLIO_DATA_PROVIDER_MAX_REQUESTS';
export const PROPERTY_DEMO_ACCOUNT_ID = 'DEMO_ACCOUNT_ID';
export const PROPERTY_DEMO_USER_ID = 'DEMO_USER_ID';
export const PROPERTY_IS_DATA_GATHERING_ENABLED = 'IS_DATA_GATHERING_ENABLED';
export const PROPERTY_IS_READ_ONLY_MODE = 'IS_READ_ONLY_MODE';
export const PROPERTY_IS_USER_SIGNUP_ENABLED = 'IS_USER_SIGNUP_ENABLED';
export const PROPERTY_OPENROUTER_MODEL = 'OPENROUTER_MODEL';
export const PROPERTY_OPENROUTER_MODEL_WEB_FETCH = 'OPENROUTER_MODEL_WEB_FETCH';
export const PROPERTY_SLACK_COMMUNITY_USERS = 'SLACK_COMMUNITY_USERS';
export const PROPERTY_STRIPE_CONFIG = 'STRIPE_CONFIG';
export const PROPERTY_SYSTEM_MESSAGE = 'SYSTEM_MESSAGE';
export const PROPERTY_UPTIME = 'UPTIME';
export const PROPERTY_WEB_FETCH_ROUTES = 'WEB_FETCH_ROUTES';

export const QUEUE_JOB_STATUS_LIST = [
  'active',
  'completed',
  'delayed',
  'failed',
  'paused',
  'waiting'
] as JobStatus[];

export const REPLACE_NAME_PARTS = [
  'Amundi Index Solutions -',
  'iShares ETF (CH) -',
  'iShares III Public Limited Company -',
  'iShares V PLC -',
  'iShares VI Public Limited Company -',
  'iShares VII PLC -',
  'Multi Units Luxembourg -',
  'VanEck ETFs N.V. -',
  'Vaneck Vectors Ucits Etfs Plc -',
  'Vanguard Funds Public Limited Company -',
  'Vanguard Index Funds -',
  'Xtrackers (IE) Plc -'
];

export const SECTORS = [
  'Basic Materials',
  'Communication Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Energy',
  'Financial Services',
  'Healthcare',
  'Industrials',
  'Other',
  'Real Estate',
  'Technology',
  'Utilities'
] as const;

export const STORYBOOK_PATH = '/development/storybook';

export const SUPPORTED_LANGUAGE_CODES = [
  'ca',
  'de',
  'en',
  'es',
  'fr',
  'it',
  'ko',
  'nl',
  'pl',
  'pt',
  'tr',
  'uk',
  'zh'
];

export const TAG_ID_EMERGENCY_FUND = '4452656d-9fa4-4bd0-ba38-70492e31d180';
export const TAG_ID_EXCLUDE_FROM_ANALYSIS =
  'f2e868af-8333-459f-b161-cbc6544c24bd';
export const TAG_ID_DEMO = 'efa08cb3-9b9d-4974-ac68-db13a19c4874';

export const UNKNOWN_KEY = 'UNKNOWN';

// ---------------------------------------------------------------------------
// Leader screening (Minervini). The engine's PRIMARY buy path as of 2026-08-21.
//
// Why these exist: the composite score weights (100 - RSI) and (1 - %B), so it
// rewards weakness by construction and ranked the wrong names — 153 backtested
// symbols, only 29% beat buy-and-hold, mean edge -23.5pp (docs §0.3). The
// screen below is the opposite sign: it buys confirmed strength near highs.
// ---------------------------------------------------------------------------

// Trend Template thresholds. Sourced from Minervini's published criteria; the
// preferred (stricter) values are noted where they differ from the minimum.
// Criterion 8 of the Trend Template. Minervini states the criterion as RS >= 70;
// 90 is his preference for what to actually BUY, which is a different question.
// Keep them separate: raising this to 90 would silently redefine what "8/8"
// means and break comparability with every historical screen.
export const SIGNAL_TREND_TEMPLATE_MIN_RS = 70;
/**
 * The stricter RS the daily Telegram alert requires — roughly the top decile.
 *
 * Gating the *message* rather than the *criterion* is what lets the universe
 * grow without the alert growing with it. At ~334 tracked names 13 were
 * actionable per day; at ~757 that is ~30, against a hard cap of 8 candidates
 * per message. Requiring the preferred RS keeps the list inside the cap while
 * the watchlist and Trend tab still show every qualifying name.
 */
export const SIGNAL_TREND_TEMPLATE_PREFERRED_RS = 90;
// Criterion 3: the 200-day average must have been rising for at least a month.
// Measured as a duration, not a level comparison — one sharp uptick after a
// long slide must not pass.
export const SIGNAL_TREND_TEMPLATE_SMA200_RISING_DAYS = 21;
// Criterion 6: price at least this far above the 52-week low.
export const SIGNAL_TREND_TEMPLATE_MIN_ABOVE_LOW_PCT = 0.3;
// Criterion 7: price no further than this below the 52-week high.
export const SIGNAL_TREND_TEMPLATE_MAX_BELOW_HIGH_PCT = 0.25;
// How many of the 8 criteria must pass for the name to be screen-eligible.
// 8/8 is the doctrinal reading; the pass count is reported either way so a
// near-miss is visible rather than silently dropped.
export const SIGNAL_TREND_TEMPLATE_MIN_PASSES = 8;

// Volatility Contraction Pattern. Minervini's own description: "the first
// correction might be 20%, 25%, 33%, and then... the contractions are about
// half of the previous correction."
// Minimum swing size (fraction) that counts as a real turn rather than noise
// when detecting contractions. Must stay below the tightest contraction we want
// to see (3-5%), or the final and most important one is invisible.
export const SIGNAL_VCP_SWING_THRESHOLD_PCT = 0.02;
export const SIGNAL_VCP_MIN_CONTRACTIONS = 3; // 2 only in a strong regime
export const SIGNAL_VCP_MAX_CONTRACTIONS = 6;
// Each contraction must be shallower than the one before it. Allow a little
// slack so a 12.0% -> 12.1% wobble is not treated as a widening base.
export const SIGNAL_VCP_CONTRACTION_TOLERANCE = 0.02;
// The final contraction should be tight — typically 3-5% before a breakout.
export const SIGNAL_VCP_MAX_FINAL_TIGHTNESS_PCT = 0.1;
// Base duration, in trading days: 4-12 weeks.
export const SIGNAL_VCP_MIN_BASE_DAYS = 20;
export const SIGNAL_VCP_MAX_BASE_DAYS = 60;
// Volume must dry up through the base: final-contraction volume as a fraction
// of the 50-day average.
export const SIGNAL_VCP_MAX_DRYUP_RATIO = 0.85;
// Breakout must come on real demand: 40-50% above average daily volume.
export const SIGNAL_VCP_BREAKOUT_VOLUME_RATIO = 1.4;
// How close BELOW the pivot counts as "at the pivot" for an actionable buy.
// One-sided on purpose: a stock already above its pivot has either broken out
// (confirmed by volume) or failed to (not confirmed). Neither is "approaching".
export const SIGNAL_VCP_PIVOT_PROXIMITY_PCT = 0.02;

/**
 * When a rally between two adjacent pullbacks recovers less than this fraction
 * of the first pullback, the two are one contraction that stair-stepped down,
 * not two contractions.
 *
 * This is what makes the base readable without letting the detector cherry-pick.
 * The previous implementation searched for the longest *subsequence* of swings
 * that happened to shrink, which let it skip over intervening price action
 * entirely: measured across 757 symbols, 77% of accepted bases contained a
 * stretch where price broke BELOW the prior trough - up to 22% below - directly
 * contradicting the higher-lows rule the search claimed to enforce, and 96.6%
 * had discarded a pullback deeper than the one they kept. Merging adjacent
 * pullbacks cannot hide a low, because the merged trough is the LOWER of the
 * two; skipping them could, and did.
 */
export const SIGNAL_VCP_MERGE_RALLY_PCT = 0.5;

/**
 * Deepest the whole base may be, peak to trough.
 *
 * Minervini's bases run 10-35%; deeper than that is a broken stock rather than
 * a consolidation. Currently a backstop rather than an active filter - measured
 * base depth is median 16%, p90 27% - but the shape was previously unbounded.
 */
export const SIGNAL_VCP_MAX_BASE_DEPTH_PCT = 0.35;

// Minervini risk management: never lose more than 7-8% on a position, and only
// take setups whose realistic target is worth the risk.
export const SIGNAL_LEADER_STOP_PCT = 0.075;
export const SIGNAL_LEADER_MIN_REWARD_RISK = 2;

/**
 * How long a single symbol stays silenced after its breakout is alerted.
 *
 * A breakout bar keeps satisfying the BREAKOUT test for several sessions
 * afterwards, so without a cooldown one event would re-alert every day until
 * the volume surge rolls out of the average. Five trading days is a week of
 * silence per name — long enough to stop the repeat, short enough that a
 * genuine second breakout from a new base still gets through.
 */
export const SIGNAL_LEADER_ALERT_COOLDOWN_DAYS = 5;

/**
 * How many Yahoo Profile pages the background expense-ratio warm-up fetches
 * at once.
 *
 * Deliberately small. Yahoo rate-limits bursts, and `getYahooEtfProfile`'s
 * single retry cannot recover from a block that the rest of its own burst is
 * still causing — so a wide fan-out is not just slower, it is self-defeating.
 * This runs off the request path, so throughput is irrelevant; landing in the
 * cache is the only thing that matters.
 */
export const SIGNAL_YAHOO_FEE_REFILL_CONCURRENCY = 4;

/**
 * Worker-pool width for the nightly OHLCV gather.
 *
 * Same reasoning as the fee refill, and the same number: one chart request per
 * symbol across the whole universe is the largest burst this application makes
 * at Yahoo, and it runs unattended at 22:05 with 25 minutes of headroom before
 * the leader screen reads the result. Being blocked halfway costs a day of
 * bars; finishing four minutes sooner buys nothing.
 */
export const SIGNAL_OHLC_REFRESH_CONCURRENCY = 4;

/**
 * How far back the nightly gather asks for, chosen from the gap since the newest
 * stored bar. Yahoo bills a range request the same regardless of span, but a
 * narrow range keeps the response small on the ordinary night where one bar is
 * missing. `createMany({ skipDuplicates: true })` makes any overlap free.
 */
export const SIGNAL_OHLC_REFRESH_RANGES = {
  /** Gap of a long holiday or a symbol that fell behind. */
  medium: { maxGapDays: 60, range: '3mo' },
  /** The ordinary case: one or two missing sessions. */
  short: { maxGapDays: 5, range: '1mo' },
  /** No stored bars at all, or a gap wide enough that history is missing. */
  full: { range: '5y' }
} as const;

/**
 * Share of the tracked universe that must be above its own 200-day average for
 * the market to count as healthy.
 *
 * Minervini's first rule is market direction, and this engine had no notion of
 * it. There is no index data stored locally (`^GSPC` and `^VIX` have zero rows
 * in both OhlcBar and MarketData), so BREADTH over the universe itself is the
 * honest proxy: it needs no new feed, it is computable point-in-time with no
 * lookahead, and it degrades gracefully as the universe grows.
 *
 * 50% is the natural dividing line rather than a tuned one - deliberately, since
 * the sample of breakouts is far too small to fit a threshold against without
 * simply overfitting it.
 */
export const SIGNAL_MARKET_BREADTH_HEALTHY_PCT = 0.5;

/**
 * RS floor for the daily Trend Template entrant alert.
 *
 * Measured over 94 trading days across 752 names, new 8/8 entrants arrive at a
 * mean of 13.4/day, median 7, and spike to 142 when the cross-section re-ranks.
 * That is unreadable within a week. Restricted to RS >= 90 the same series is a
 * mean of 3.9 and a median of 2, silent on 28 of 94 days - an alert rather than
 * a feed.
 */
export const SIGNAL_TT8_ALERT_MIN_RS = 90;

/**
 * How long a symbol stays silenced after its Trend Template entrant alert.
 *
 * Several criteria are boundary tests - price vs the 50-day, within 25% of the
 * 52-week high - and a name sitting on one of them can cross back and forth on
 * fractions of a percent. Without this, such a name re-alerts every other day
 * while telling you nothing new.
 */
export const SIGNAL_TT8_COOLDOWN_DAYS = 10;

/** Names per shortlist message; the rest are summarised as a "+N more" footer. */
export const SIGNAL_SHORTLIST_MAX = 12;

/**
 * How long a computed watchlist-metrics snapshot is reused.
 *
 * The snapshot costs a full history hydrate and cross-sectional ranking over
 * the whole universe, and the endpoint had no cache at all — so every page
 * load and every navigation recomputed it from scratch, on top of the 30-minute
 * poll the UI already runs. Five minutes is well inside the staleness the UI
 * is designed around and collapses a browsing session onto one computation.
 */
export const SIGNAL_WATCHLIST_METRICS_CACHE_TTL = 5 * 60 * 1000;

/**
 * TTL for the watchlist-wide inputs the asset-detail view rebuilds per call.
 *
 * Opening one ticker dialog needs the holdings of EVERY watchlist fund/ETF (to
 * compute overlap) and the user's whole activity history (to flag which of the
 * overlapping names are owned). Both are the same for every symbol, yet were
 * recomputed once per request — invisible when a human opens one dialog, but
 * the scheduled research task walks the watchlist symbol by symbol, and dozens
 * of back-to-back rebuilds is what took the API down.
 *
 * A minute is far shorter than either input actually changes (holdings refresh
 * with the nightly profile gather; activities change when the user files a
 * trade) and still collapses any burst onto one build.
 */
export const SIGNAL_ASSET_DETAIL_INPUT_CACHE_TTL = 60 * 1000;

// Liquidity floor for the screen (average daily dollar volume). A breakout on
// an illiquid name is unfillable at the quoted price, which is precisely the
// failure mode a backtest cannot see.
export const SIGNAL_SCREEN_MIN_DOLLAR_VOLUME = 5_000_000;

// Cross-sectional relative strength: IBD-style weighting of trailing returns,
// most recent quarter double-weighted, then converted to a 1-99 percentile
// across the universe.
export const SIGNAL_RS_WEIGHTS = {
  return3m: 0.4,
  return6m: 0.2,
  return9m: 0.2,
  return12m: 0.2
};
// Minimum universe size before a percentile means anything. Ranking 5 names
// 1-99 would be arithmetic theatre.
export const SIGNAL_RS_MIN_UNIVERSE = 30;

// Relative strength is CROSS-SECTIONAL: it cannot be derived from one symbol's
// history, only from the whole universe at once. The watchlist-metrics pass
// already computes the full map every refresh, so it publishes it here for
// per-symbol readers (the ticker dialog's Trend tab) rather than having each
// reader re-rank ~150 names on demand. A cold cache yields no rank, which
// renders as UNRANKED rather than as a failed criterion - the same distinction
// CrossSectionalService already draws for a newly listed stock.
export const SIGNAL_RS_RANK_CACHE_KEY = 'signals:rs-rank-map';
/**
 * Lifetime of the published map, in MILLISECONDS.
 *
 * The unit is not cosmetic: `RedisCacheService.set` hands this straight to
 * Keyv, whose TTL is milliseconds. Written as `60 * 60` under a "seconds"
 * comment it meant 3.6 SECONDS, so the map expired before any reader could use
 * it and every Trend tab rendered UNRANKED - which also failed criterion 8 and
 * made 8/8 unreachable there. Keep the `* 1000`.
 */
export const SIGNAL_RS_RANK_CACHE_TTL = 60 * 60 * 1000;
