import type { DataSource } from '@prisma/client';

import type { LineChartItem } from './line-chart-item.interface';

export type TradingSignalCategory = 'BUY' | 'HOLD' | 'REINVEST' | 'SELL';

/**
 * Advisory pre-buy screen snapshot for a fired BUY signal. Every field is
 * best-effort and independently optional — the screen informs, never blocks.
 */
export interface PreBuyScreenResult {
  analystTrend?: 'IMPROVING' | 'DETERIORATING' | 'FLAT';
  daysToEarnings?: number;
  epsRevisionTrend?: 'UP' | 'DOWN' | 'FLAT';
  headlines?: { publishedAt?: string; source?: string; title: string }[];
  nextEarningsDate?: string;
  sectorTailwind?: 'RISING' | 'FALLING' | 'MIXED';
  trend200d?: 'ABOVE' | 'BELOW';
}

export interface TradingSignal {
  category: TradingSignalCategory;
  /** Volatility-adaptive reference price for the active threshold. */
  adaptiveLevel?: number;
  /** SymbolProfile.assetSubClass at evaluation (drives ETF-calibrated dip labeling). */
  assetSubClass?: string;
  /** The user's base/ranking currency (e.g. USD). */
  baseCurrency?: string;
  /** True when the name is in a confirmed downtrend (bear-market / counter-trend). */
  bearMarket?: boolean;
  /** BUY archetype: a safe dip-in-uptrend vs a higher-risk reversal of a downtrend. */
  signalType?: 'DIP' | 'REVERSAL';
  currency?: string;
  dataSource: DataSource;
  /** Expected-move band over the forecast horizon (absolute prices). */
  forecastBand?: { expected: number; lower: number; upper: number };
  /** Monte Carlo probability [0-1] of touching the target within the horizon. */
  hitTargetProbability?: number;
  livePrice: number;
  /** Live price converted to the base currency (for cross-asset ranking). */
  livePriceInBaseCurrency?: number;
  name: string;
  /** Average buy price in the asset's native currency (owned holdings only). */
  averageBuyPrice?: number;
  quantity?: number;
  /** Human-readable explanation of why this signal fired. */
  reason: string;
  /** Composite 0-100 buy-attractiveness score (used to rank candidates). */
  score?: number;
  /** Wilder's RSI(14) at evaluation. */
  rsi?: number;
  /** MACD(12/26/9) histogram (macd − signal). */
  macdHistogram?: number;
  /** Bollinger %B(20): position within the band, 0 = lower, 1 = upper. */
  bollingerPctB?: number;
  /** 200-day SMA at evaluation (drives the pre-buy screen's trend line). */
  sma200?: number;
  /**
   * Advisory pre-buy screen attached when a BUY fires — analyst rating
   * direction, EPS revisions, sector tailwind, next earnings, headlines.
   * Never blocks a signal; persisted to SignalLog.metrics for later review.
   */
  preBuyScreen?: PreBuyScreenResult;
  /** Analytic terminal probability [0-1] of reaching the upside target (drift 0). */
  reachProbability?: number;
  /** Upside target gain as a fraction (horizon-scaled band). */
  targetGainPct?: number;
  /** Downside stop as a fraction (horizon-scaled band). */
  stopLossPct?: number;
  /** Annualised volatility (liquidity/risk proxy). */
  annualVol?: number;
  /** News sentiment score [-1, 1] at evaluation (null/absent when uncovered). */
  newsScore?: number;
  /**
   * Composite 0-100 valuation/quality/growth score from Yahoo fundamentals
   * (forward P/E, ROE, earnings growth, analyst consensus) — independent of
   * `score` (purely technical). Absent when uncovered (e.g. most funds/ETFs).
   */
  fundamentalsScore?: number;
  /** Suggested amount to deploy (REINVEST / BUY), in the user's base currency. */
  suggestedAmount?: number;
  symbol: string;
}

/** One persisted, actionable signal event (matches the SignalLog Prisma model). */
export interface SignalLogEntry {
  adaptiveLevel?: number;
  bearMarket: boolean;
  bollingerPctB?: number;
  category: string;
  conviction?: number;
  createdAt: string;
  /** Conviction recomputed from today's live metrics (for comparison against `conviction`). */
  currentConviction?: number;
  currency?: string;
  /** Live price at read time (for comparison against `livePrice`). */
  currentPrice?: number;
  /** Reach probability recomputed from today's live metrics. */
  currentReachProbability?: number;
  /** RSI(14) recomputed from today's live metrics. */
  currentRsi?: number;
  /** Composite score recomputed from today's live metrics. */
  currentScore?: number;
  dataSource: DataSource;
  /** Calendar days elapsed between `createdAt` and now. */
  daysSinceSignal?: number;
  expectedValue?: number;
  forecastLower?: number;
  forecastUpper?: number;
  id: string;
  livePrice?: number;
  macdHistogram?: number;
  name?: string;
  newsScore?: number;
  reachProbability?: number;
  reason?: string;
  rsi?: number;
  score?: number;
  signalType?: string;
  stopLoss?: number;
  suggestedAmount?: number;
  symbol: string;
  takeProfit?: number;
  trailingStop?: number;
}

/** Live technical-indicator snapshot for a watchlist symbol (not tied to a BUY/SELL signal). */
export interface WatchlistMetric {
  annualVol?: number;
  bollingerPctB?: number;
  conviction?: number;
  /** Ongoing annual fee % (ETFs: TER catalog; funds: Nordnet/Avanza). */
  feePct?: number;
  macdHistogram?: number;
  reachProbability?: number;
  /** Trailing price returns from accumulated history, in %. */
  return1mPct?: number;
  return1wPct?: number;
  return1yPct?: number;
  return3mPct?: number;
  return6mPct?: number;
  rsi?: number;
  score?: number;
  /** Simple moving averages of the close, for trend-at-a-glance columns. */
  sma50?: number;
  sma200?: number;
}

export interface WatchlistMetricsResponse {
  metrics: Record<string, WatchlistMetric>;
}

/** One paper trade derived from a logged BUY signal, matched FIFO to a later SELL. */
export interface SimulatedTrade {
  assumedNotionalUsd: number;
  buyDate: string;
  buyPrice: number;
  /** Conviction (0-100) computed at BUY time (the SignalLog row's `conviction`). */
  convictionAtBuy?: number;
  currency?: string;
  /** Live price at read time — OPEN trades only, lets the UI show where price sits between stopLoss and takeProfit. */
  currentPrice?: number;
  dataSource: DataSource;
  /**
   * Undefined only when a current/sell price genuinely isn't known yet (a
   * live-quote hiccup, or a rare data gap on the matched SELL row) — the
   * trade itself is never dropped for this; every logged BUY always shows a
   * row, just without a return figure until a price is known.
   */
  effectiveAnnualRatePct?: number;
  grossReturnPct?: number;
  holdingDays: number;
  name?: string;
  netReturnPct?: number;
  /** Analytic TERMINAL reach-probability (0-1) at BUY time (the SignalLog row's `reachProbability`). */
  reachProbabilityAtBuy?: number;
  /** Real fill date (ISO) from the matched Order, once tracked (see `tracked`). */
  realBuyDate?: string;
  /** Real fill price from the matched Order, once tracked (see `tracked`). */
  realBuyPrice?: number;
  /** Composite 0-100 RSI at BUY time (the SignalLog row's `rsi`). */
  rsiAtBuy?: number;
  /** Composite 0-100 buy-attractiveness score at BUY time (the SignalLog row's `score`). */
  scoreAtBuy?: number;
  sellDate?: string;
  sellPrice?: number;
  /** BUY archetype the trade opened under (DIP = uptrend dip, REVERSAL = bear-market). */
  signalType: 'DIP' | 'REVERSAL';
  /** Downside exit level set at BUY time (the SignalLog row's `stopLoss`). */
  stopLoss?: number;
  status: 'CLOSED' | 'OPEN';
  symbol: string;
  /** Upside target price set at BUY time (the SignalLog row's `takeProfit`). */
  takeProfit?: number;
  /** True once a real BUY Order has been auto-matched to this signal (SignalTradeTrackingService). */
  tracked?: boolean;
  /** Highest price seen since the frozen target was reached (TRAILING state only). */
  trackedPeakPrice?: number;
  /** TRACKING (watching frozen levels) -> STOP_HIT, or TRAILING (target hit, riding the trend) -> TRAILING_EXIT. */
  trackedStatus?: 'STOP_HIT' | 'TRACKING' | 'TRAILING' | 'TRAILING_EXIT';
  /** % change of current/sell price vs. the real fill price — only present for tracked trades. */
  vsBuyPct?: number;
  /** % change of current/sell price vs. the signal's own live price at fire time (buyPrice). */
  vsSignalPct?: number;
}

export interface SimulationSummary {
  avgEffectiveAnnualRatePct: number;
  avgNetReturnPct: number;
  closedTrades: number;
  openTrades: number;
  totalFeesUsd: number;
  /** Fraction (0-1) of closed trades with netReturnPct > 0. */
  winRate: number;
  /** Per-signal-type breakdown (closed trades only) — the simulation evidence
   * that DIP entries outperform REVERSAL entries, kept visible. */
  dipAvgNetReturnPct?: number;
  dipClosedTrades?: number;
  dipWinRate?: number;
  reversalAvgNetReturnPct?: number;
  reversalClosedTrades?: number;
  reversalWinRate?: number;
}

export interface SimulationResponse {
  /** One point per CLOSED DIP trade: { date: sellDate, value: effectiveAnnualRatePct }. */
  dipSeries: LineChartItem[];
  generatedAt: string;
  /** One point per CLOSED REVERSAL (bear-market) trade: { date: sellDate, value: effectiveAnnualRatePct }. */
  reversalSeries: LineChartItem[];
  summary: SimulationSummary;
  /** Closed + open trades, newest buyDate first. */
  trades: SimulatedTrade[];
}

export interface SignalLogResponse {
  entries: SignalLogEntry[];
  summary: {
    /** Counts per category over the last 7 days. */
    last7d: Record<string, number>;
    /** Counts per category over the last 30 days. */
    last30d: Record<string, number>;
    /** Total rows returned (after filters). */
    total: number;
  };
}

export interface PortfolioReportRow {
  /** Native currency of the asset. */
  currency: string;
  dataSource: DataSource;
  /** Change vs the previous close (fraction, e.g. 0.012 = +1.2%). */
  dayChangePct?: number;
  livePrice: number;
  /** Live price converted to the base currency. */
  livePriceInBaseCurrency: number;
  name: string;
  /** Change vs the average buy price (fraction). */
  referenceChangePct?: number;
  symbol: string;
  /** Position value in the base currency (quantity × price). */
  valueInBaseCurrency: number;
  /** Change vs the close ~5 trading days ago (fraction). */
  weekChangePct?: number;
}

export interface PortfolioReport {
  baseCurrency: string;
  rows: PortfolioReportRow[];
  totalValueInBaseCurrency: number;
}

export interface TradingSignalsResponse {
  buy: TradingSignal[];
  hold: TradingSignal[];
  reinvest: TradingSignal[];
  sell: TradingSignal[];
}

export interface BacktestTrade {
  buyDate: string;
  buyPrice: number;
  exitReason: 'OPEN' | 'STOP_LOSS' | 'TRAILING';
  holdingDays: number;
  netReturnPct: number;
  returnPct: number;
  sellDate: string;
  sellPrice: number;
}

export interface StrategyLeg {
  category: string | null;
  /** Conviction score 0-100 (solid × likely); absent for the index/fund leg. */
  conviction?: number;
  cost: number;
  fee: number;
  /** Probability [0-1] of a worthwhile gain over the horizon (the "why"). */
  hitProbability?: number;
  name: string;
  /** One-line explanation of the pick (conviction, probability, indicators). */
  rationale?: string;
  shares: number;
  symbol: string;
  unitPrice: number;
}

export interface InvestmentStrategy {
  cashLeft: number;
  description: string;
  fees: number;
  invested: number;
  legs: StrategyLeg[];
  name: string;
}

export interface FundPick {
  amount: number;
  category: string;
  currency: string;
  feePct: number;
  name: string;
  /** 0-100: how much of the fund sleeve's value already dollar-weighted-overlaps this fund's holdings (see recommendFunds). Undefined/0 = no meaningful overlap. */
  overlapExposurePct?: number;
  symbol: string;
}

export interface RebalancePlan {
  currentFundsPct: number;
  currentStocksPct: number;
  fundsCash: number;
  fundsValue: number;
  stocksCash: number;
  stocksValue: number;
  targetFundsPct: number;
}

export interface InvestmentStrategiesResponse {
  baseCurrency: string;
  cash: number;
  fundPicks: FundPick[];
  generatedAt: string;
  rebalance: RebalancePlan;
  strategies: InvestmentStrategy[];
}

export interface FundRecommendationResponse {
  baseCurrency: string;
  generatedAt: string;
  picks: FundPick[];
}

/**
 * Per-fund analytics computed from our own accumulated NAV history
 * (MarketData), enriched with cached Avanza fund-guide facts. Nullable fields
 * mean "not enough history yet" (e.g. Nordnet-branded funds accumulating
 * forward) or "fact not published for this fund".
 */
export interface FundMetric {
  annualVolPct?: number;
  /** Assets under management (fund currency). */
  aum?: number;
  category: string;
  currency: string;
  daysOfHistory: number;
  feePct: number;
  maxDrawdownPct?: number;
  /** Number of Nordnet customers holding the fund (popularity proxy). */
  owners?: number;
  /** Morningstar rating 1-5 (Nordnet details page / Avanza fund guide). */
  rating?: number;
  return1mPct?: number;
  return1yPct?: number;
  return3mPct?: number;
  return6mPct?: number;
  /** return6mPct / annualVolPct — the ranking key for "interesting funds". */
  riskAdjustedMomentum?: number;
  sharpeRatio?: number;
  name: string;
  nav?: number;
  symbol: string;
  topHoldings?: { name: string; weight: number }[];
}

export interface FundMetricsResponse {
  funds: FundMetric[];
  generatedAt: string;
}

/** One constituent of a fund/ETF (top holdings). */
export interface AssetHolding {
  name: string;
  /** Portfolio weight as a fraction (0-1). */
  weight: number;
  /** Ticker where known (Yahoo ETFs); absent for Nordnet funds. */
  symbol?: string;
}

/**
 * Derived Morningstar-style box for an ETF (from Yahoo equity-holdings inputs).
 * `size` × `style` locate the highlighted 3×3 cell; funds carry only
 * category + rating.
 */
export interface AssetStyleBox {
  category?: string;
  /**
   * Real annual fee, from Yahoo Finance's own "Annual Report Expense Ratio
   * (net)" (e.g. 0.35 = 0.35%/year) — fetched from the same Profile page as
   * the Morningstar Style Box, so it's always Yahoo's real published number,
   * not a hand-curated guess.
   */
  expenseRatioPct?: number;
  /**
   * Median market cap of the fund's holdings. Yahoo's own aggregate field is
   * essentially never populated for European-listed ETFs (confirmed by live
   * audit) — genuinely absent for most ETFs in that case, not derived from
   * anything else (a constituent-based estimate was tried and reverted: it
   * requires converting each holding's own-currency market cap and is
   * structurally biased toward the fund's largest names since only the
   * top 10 holdings are ever available — see `getStyleBox`'s comments).
   */
  medianMarketCap?: number;
  /** Morningstar overall rating 1-5. */
  morningStarRating?: number;
  priceToBook?: number;
  priceToCashflow?: number;
  priceToEarnings?: number;
  priceToSales?: number;
  size?: 'SMALL' | 'MID' | 'LARGE';
  style?: 'VALUE' | 'BLEND' | 'GROWTH';
  /**
   * 'MORNINGSTAR' when `size`/`style` are the real classification decoded
   * from Yahoo Finance's own Profile page (the exact cell Yahoo itself
   * shows); 'ESTIMATED' when Yahoo had no classification for this listing
   * and it was derived from raw valuation ratios instead (see
   * `classifyStyleBox`) — shown in the UI so it's never presented as more
   * authoritative than it is.
   */
  sizeStyleSource?: 'MORNINGSTAR' | 'ESTIMATED';
  threeYearEarningsGrowth?: number;
  /** Asset-mix percentages (0-100). */
  bondPct?: number;
  cashPct?: number;
  otherPct?: number;
  stockPct?: number;
}

/** Holdings-overlap of the selected asset with one other watchlist fund/ETF. */
export interface AssetOverlap {
  assetSubClass?: string;
  dataSource: DataSource;
  name: string;
  /** Shared holdings-weight overlap, 0-100. */
  overlapPct: number;
  owned: boolean;
  /**
   * Of this overlap's shared weight (from the selected asset's side), the %
   * that belongs to holding names the user already owns directly as
   * individual stocks elsewhere in their portfolio — 0-100.
   */
  ownedSharedPct: number;
  /** Number of holding names in common (length of sharedHoldings' full set). */
  sharedCount: number;
  /** Names of the top shared holdings (for the tooltip). */
  sharedHoldings: string[];
  symbol: string;
}

/** One trailing period return, e.g. { period: '1W', pct: -0.6 }. */
export interface AssetPeriodReturn {
  period: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';
  pct: number;
}

/**
 * Full ETF↔ETF holdings-overlap matrix — every watchlist ETF against every
 * other one, not just a single selected asset vs. the rest. `matrix[i][j]`
 * is the overlap % (0-100) between `symbols[i]` and `symbols[j]`; symmetric,
 * diagonal is 100.
 */
export interface CorrelationMatrixResponse {
  generatedAt: string;
  matrix: number[][];
  /**
   * `owned` reflects current net activity quantities (netQuantity > 0) at
   * request time — always live, updates automatically as positions are
   * bought/closed, no separate bookkeeping needed.
   */
  symbols: {
    dataSource: DataSource;
    name: string;
    owned: boolean;
    symbol: string;
  }[];
}

export interface AssetDetailResponse {
  assetSubClass?: string;
  currency?: string;
  dataSource: DataSource;
  holdings: AssetHolding[];
  name: string;
  /** Every other watchlist fund/ETF, sorted by overlap (most similar first). */
  overlaps: AssetOverlap[];
  owned: boolean;
  /** Trailing period returns (1D/1W/1M/3M/6M/1Y) where computable. */
  returns: AssetPeriodReturn[];
  sectors: { name: string; weight: number }[];
  styleBox?: AssetStyleBox;
  symbol: string;
}

export interface BacktestSummary {
  maxDrawdownPct: number;
  sharpe: number;
  sortino: number;
  totalNetReturnPct: number;
  trades: number;
  winRate: number;
}

export interface BacktestRow {
  benchmarkPct: number;
  /** netPct − benchmarkPct: did trading beat holding? */
  edgePct: number;
  maxDrawdownPct: number;
  name: string;
  netPct: number;
  oosSharpe: number;
  sharpe: number;
  symbol: string;
  trades: number;
  winRate: number;
}

export interface BacktestAllResponse {
  rows: BacktestRow[];
  summary: {
    avgEdgePct: number;
    beatBenchmark: number;
    evaluated: number;
    medianEdgePct: number;
  };
}

export interface BacktestResult {
  avgHoldingDays: number;
  avgNetReturnPct: number;
  avgReturnPct: number;
  /** Buy-and-hold return over the same window — the benchmark to beat. */
  benchmarkReturnPct: number;
  cagrPct: number;
  /** CAGR ÷ max drawdown. */
  calmar: number;
  dataSource: DataSource;
  /** % of bars spent holding a position. */
  exposurePct: number;
  maxDrawdownPct: number;
  openAtEnd: number;
  /** Metrics on the held-out last 30% (out-of-sample) — guards against overfit. */
  outOfSample: BacktestSummary;
  positionSize: number;
  profitFactor: number;
  sharpe: number;
  slippageBps: number;
  sortino: number;
  stopLossExits: number;
  symbol: string;
  totalNetReturnPct: number;
  totalReturnPct: number;
  tradingDays: number;
  trades: BacktestTrade[];
  trailingExits: number;
  winRate: number;
}
