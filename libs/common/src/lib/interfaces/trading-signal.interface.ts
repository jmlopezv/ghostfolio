import type { DataSource } from '@prisma/client';

import type { LineChartItem } from './line-chart-item.interface';

export type TradingSignalCategory = 'BUY' | 'HOLD' | 'REINVEST' | 'SELL';

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
}

export interface WatchlistMetricsResponse {
  metrics: Record<string, WatchlistMetric>;
}

/** One paper trade derived from a logged BUY signal, matched FIFO to a later SELL. */
export interface SimulatedTrade {
  assumedNotionalUsd: number;
  buyDate: string;
  buyPrice: number;
  currency?: string;
  /** Live price at read time — OPEN trades only, lets the UI show where price sits between stopLoss and takeProfit. */
  currentPrice?: number;
  dataSource: DataSource;
  effectiveAnnualRatePct: number;
  grossReturnPct: number;
  holdingDays: number;
  name?: string;
  netReturnPct: number;
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
}

export interface SimulationSummary {
  avgEffectiveAnnualRatePct: number;
  avgNetReturnPct: number;
  closedTrades: number;
  openTrades: number;
  totalFeesUsd: number;
  /** Fraction (0-1) of closed trades with netReturnPct > 0. */
  winRate: number;
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
