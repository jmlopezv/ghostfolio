import { AssetClass, AssetSubClass, DataSource, Type } from '@prisma/client';
import { JobOptions, JobStatus } from 'bull';
import ms from 'ms';

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

// Weekly fund recommendation ("which funds to buy" for monthly accumulation).
export const FUND_SIGNALS_PROCESS_JOB_NAME = 'FUND_SIGNALS';
export const FUND_SIGNALS_PROCESS_JOB_OPTIONS: JobOptions = {
  removeOnComplete: true,
  removeOnFail: true
};

// Tag used to mark a holding as actively traded (eligible for take-profit SELL signals).
export const SIGNAL_TAG_ACTIVE_TRADE = 'ACTIVE_TRADE';

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

// Nordnet brokerage fees (per order, not per share). $5 flat for a single
// instrument; ~$5.5–6 for multiple instruments in the same order. Since each
// signal fires per-ticker and the full position is always traded at once,
// $5/side = $10 round-trip is the right figure to use.
export const SIGNAL_BUY_FEE_USD = 5;
export const SIGNAL_SELL_FEE_USD = 5;

// Flat position size (USD) the Simulation tab assumes for every paper trade's
// fee-adjusted return, since SignalLog never records a real share count. The
// calculator lets the user override this per-trade with a real $ amount.
export const SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD = 1000;

// Exit style. 'trailing' = the swing state machine (stop → take-profit → tight
// trail). 'hold-with-stop' = let winners RUN: no take-profit, only a wide
// peak-trailing stop that cuts losses and locks big gains. The backtest showed
// the tight trailing capped winners and lost to buy-and-hold, so the default is
// hold-with-stop; flip back to 'trailing' to revert.
export type SignalExitMode = 'hold-with-stop' | 'trailing';
export const SIGNAL_EXIT_MODE: SignalExitMode = 'hold-with-stop';
// Width of the hold-with-stop trailing stop: exit when price falls this far
// below the running peak (≈ give a winner room; cut a loser here too).
export const SIGNAL_HOLD_TRAIL_PCT = 0.22;

// Exit framework, tuned for a ~2-month (42 trading day) swing horizon (EOD
// close-to-close vol). Every level uses band = dailyVolatility ×
// √SIGNAL_HORIZON_DAYS as its unit. Also the forecast/reach-probability
// horizon shown to the user, so the displayed text always matches the band.
export const SIGNAL_HORIZON_DAYS = 42; // ~2 trading months (42 trading days)
// Take-profit never targets less than +13.4% over the fee-adjusted cost basis,
// otherwise scales up with the stock's own expected move over the horizon.
// Scaled from the old 8% (set for the 15-day horizon) by √(42/15) ≈ 1.673 so
// reach-probability/EV/conviction stay as conservative at 42 days as they
// were at 15 — otherwise a fixed 8% target gets strictly easier to reach
// (in the terminal-probability sense) purely by giving it more calendar
// time, with nothing about the stock itself improving.
export const SIGNAL_TAKE_PROFIT_FLOOR_PCT = 0.134;
export const SIGNAL_TAKE_PROFIT_VOL_MULT = 1.5; // target band: 1.5σ over the horizon
export const SIGNAL_STOP_VOL_MULT = 2; // stop-loss: 2σ below entry (defined downside)
export const SIGNAL_TRAIL_VOL_MULT = 1; // trailing stop: 1σ below the running peak

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

// Notional position size (USD) the backtest assumes per trade, so the flat
// round-trip fee is expressed as a realistic drag (matches the user's monthly
// stock budget of ~$200–250).
export const SIGNAL_BACKTEST_POSITION_SIZE = 250;
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

// Strategy conviction = score × (1−w + w×reachProbability): how much the
// probability of a gain weighs vs the raw composite score. Plus the bonus for an
// actual dip-buy setup, and the window in which a past BUY still counts as
// "recently signalled" for the re-confirmation control.
export const SIGNAL_CONVICTION_PROB_WEIGHT = 0.5;
export const SIGNAL_BUYZONE_CONVICTION_BONUS = 8;
export const SIGNAL_RECENT_SIGNAL_WINDOW = ms('14 days');
// Liquidity/risk cap: exclude names whose annualised volatility exceeds this
// from buy recommendations (a proxy for wild, illiquid, blow-up-prone stocks).
export const SIGNAL_MAX_ANNUAL_VOL = 0.9;
// Quality gate for strategy eligibility: a composite-score floor that drops
// no-history / junk names (score 0) before the expected-value ranking. Lower
// than the strict BUY gate (55) since strategies rank a broader universe.
export const SIGNAL_STRATEGY_SCORE_FLOOR = 45;

// Fee-aware basket sizing: fees should never eat more than ~10% of a
// strategy's cash budget. If (ticker-count x SIGNAL_BUY_FEE_USD) / cash
// exceeds this, drop the lowest-conviction pick and recheck.
export const SIGNAL_STRATEGY_MAX_FEE_RATIO = 0.1;

// Fund-sleeve overlap: a stock/ETF candidate is flagged redundant when its
// category matches a held-fund category that already represents more than
// this fraction of the tracked fund sleeve's value — de-prioritized, not
// excluded, so the user can still see it.
export const SIGNAL_STRATEGY_REDUNDANCY_THRESHOLD = 0.4;

// Conviction multiplier applied to a redundant candidate's expected-value
// ranking key (not its displayed conviction score) so it sorts behind
// non-redundant picks of similar quality without hiding it outright.
export const SIGNAL_STRATEGY_REDUNDANCY_PENALTY = 0.5;

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
