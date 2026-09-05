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
  createdAt: string;
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
  /** Expected value at fire time, as a fraction (see StrategiesService.expectedValue). */
  expectedValue?: number;
  /** Expected value recomputed from today's live metrics (for comparison against `expectedValue`). */
  currentExpectedValue?: number;
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
  /** Expected value per trade as a fraction: p × target − (1 − p) × stop. */
  expectedValue?: number;
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

  // --- Leader screening (Minervini). Research surface, not a buy trigger. ---
  /** Cross-sectional relative-strength percentile (1-99) across the watchlist. */
  rsRank?: number;
  /**
   * How far the live price has moved since the close the screen was computed
   * on, as a fraction.
   *
   * RS and the Trend Template are end-of-day statistics by construction — IBD,
   * MSCI and Minervini all define them on settled closes, and an intraday
   * percentile would churn all day without saying anything. That leaves a real
   * gap between what the row scores and what the stock currently costs, and the
   * honest answer is to show the gap rather than to hide it by folding a live
   * tick into the rank. This is what makes a name that has run since the rank
   * was struck visible as exactly that.
   */
  gapSinceRsAsOf?: number;
  /** How many of the 8 Trend Template criteria pass right now. */
  trendTemplatePasses?: number;
  /** Number of tightening contractions detected in the current base. */
  vcpContractions?: number;
  /** Each contraction's depth as a %, oldest first (e.g. [18, 12, 6]). */
  vcpDepthsPct?: number[];
  /** Buy trigger: the high of the final, tightest contraction. */
  vcpPivot?: number;
  /** Distance from the pivot as a fraction; negative means still below it. */
  vcpPivotDistancePct?: number;
  /** Latest volume as a multiple of the 50-day average. */
  vcpVolumeRatio?: number;
  /**
   * Mean volume across the FINAL contraction as a multiple of the 50-day
   * average; <= 0.85 to qualify. Set only when the VCP is valid — the detector
   * reports 0 for a rejected base, and a rendered 0 is indistinguishable from
   * "extremely dry" when it actually means "never measured".
   */
  vcpDryUpRatio?: number;
  /**
   * BREAKOUT        - through the pivot on >=1.4x volume.
   * AT_PIVOT        - within 2% BELOW the pivot, coiled.
   * FAILED_BREAKOUT - above the pivot, but volume never confirmed it.
   * FORMING         - a valid contraction sequence, price not at the pivot yet.
   * null            - no valid VCP (see vcpRejectedReason).
   */
  vcpStatus?: 'AT_PIVOT' | 'BREAKOUT' | 'FAILED_BREAKOUT' | 'FORMING';
  /** Why no valid VCP was found — shown as a tooltip rather than a blank cell. */
  vcpRejectedReason?: string;
}

/**
 * The cross-sectional RS map as published for per-symbol readers.
 *
 * A bare `{ symbol: rank }` was not enough to render honestly. A percentile
 * only means something relative to a cohort and a session, and two passes with
 * DIFFERENT cohorts (the watchlist, and the wider holdings-inclusive universe
 * the nightly leader screen ranks) write this same key — so a reader that shows
 * "RS 94" without saying what it was measured against, and when, is stating
 * more than it knows.
 */
export interface RsRankPublication {
  /** Session every window was anchored to (YYYY-MM-DD); null if unknown. */
  asOf: string | null;
  cohort: 'universe' | 'watchlist';
  /** How many names carry a rank in `ranks`. */
  cohortSize: number;
  ranks: { [symbol: string]: number };
}

export interface WatchlistMetricsResponse {
  metrics: Record<string, WatchlistMetric>;
}

/** One paper trade derived from a logged BUY signal, matched FIFO to a later SELL. */
export interface SimulatedTrade {
  assumedNotionalUsd: number;
  buyDate: string;
  buyPrice: number;
  /** Expected value (fraction) computed at BUY time (the SignalLog row's `expectedValue`). */
  expectedValueAtBuy?: number;
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
  /**
   * BUY archetype the trade opened under.
   *
   * DIP / REVERSAL   - the measured engine (uptrend dip, bear-market reversal).
   * LEADER           - any alerted Minervini VCP breakout.
   * LEADER_GATED     - a breakout that also cleared healthy market + RS >= 90.
   * TT8              - a Trend Template 8/8 name the user actually bought.
   */
  signalType:
    | 'BET'
    | 'DIP'
    | 'LEADER'
    | 'LEADER_GATED'
    | 'REVERSAL'
    | 'TT8'
    | 'UNTAGGED';
  /** Downside exit level set at BUY time (the SignalLog row's `stopLoss`). */
  stopLoss?: number;
  /**
   * How far this signal has got, as four distinct facts:
   *
   *   OPEN    - the signal fired and nothing was bought.
   *   BOUGHT  - a real purchase is linked to it.
   *   CLOSED  - the engine signalled an exit; the position is still held.
   *   SOLD    - a real sale happened, whether or not a signal asked for it.
   *
   * CLOSED and SOLD are deliberately different. The engine recommending a sale
   * and the user making one are separate events, and the two-state model this
   * replaced could not express "told to sell, chose to hold".
   */
  status: 'BOUGHT' | 'CLOSED' | 'OPEN' | 'SOLD';
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
  /**
   * LEADER breakdown, reported separately and DELIBERATELY EXCLUDED from the
   * headline `avgNetReturnPct` / `winRate` / `closedTrades` above.
   *
   * The two strategies are not comparable: DIP/REVERSAL buy weakness with a
   * volatility-scaled exit, LEADER buys strength with a flat 7.5% stop and no
   * take-profit. Blending them would silently redefine what the headline
   * numbers have meant since the engine started, and would do it at the exact
   * moment the LEADER sample is smallest and noisiest.
   */
  leaderAvgNetReturnPct?: number;
  leaderClosedTrades?: number;
  leaderWinRate?: number;
  /** Breakouts that also cleared the healthy-market + RS>=90 gate. */
  leaderGatedAvgNetReturnPct?: number;
  leaderGatedClosedTrades?: number;
  leaderGatedWinRate?: number;
  /** Trend Template 8/8 names actually bought — real positions only. */
  tt8AvgNetReturnPct?: number;
  tt8ClosedTrades?: number;
  tt8WinRate?: number;
}

/** A trailing-return readout period, from "as of today" out to 1 year back. */
export type SimulationReadoutPeriod =
  | '1d'
  | '1w'
  | '1m'
  | '3m'
  | '6m'
  | 'ytd'
  | '1y';

export interface SimulationResponse {
  /**
   * S&P 500 (^GSPC), % change from the earliest point among
   * dip/reversal/trackedSeries — for the chart overlay only. Omitted
   * entirely if the live fetch fails.
   */
  benchmarkSeries?: LineChartItem[];
  /**
   * Real, calendar-anchored trailing price returns for the S&P 500, computed
   * from its own full price history (NOT the chart-rebased benchmarkSeries
   * above) — so a period the engine itself hasn't run long enough to cover
   * (e.g. 1Y, when the engine is only 2 months old) still shows a genuine
   * number for the benchmark, rather than being empty like dip/reversal/
   * trackedSeries' own readouts necessarily are. A period key is omitted
   * when even the S&P's own fetched history doesn't reach back that far.
   */
  benchmarkReadout?: Partial<Record<SimulationReadoutPeriod, number>>;
  /**
   * Daily mark-to-market AVERAGE % net return across all DIP-signal trades
   * (open + closed), tracking how this bucket's return has developed over
   * time, from the first DIP trade's buy date to today. Closed trades
   * contribute their final locked netReturnPct from their sell date onward;
   * open trades are marked to market against stored daily closes.
   */
  dipSeries: LineChartItem[];
  generatedAt: string;
  /**
   * Same shape as dipSeries, filtered to LEADER (Minervini VCP breakout)
   * trades. Recorded forward-only from the first alerted breakout, so it is
   * empty until one fires and stays sparse while the sample builds — there is
   * no backfilled history behind this line.
   */
  leaderSeries: LineChartItem[];
  /**
   * Same, restricted to breakouts that also cleared healthy market + RS >= 90.
   * Roughly 11 events a year historically, so this line is deliberately sparse.
   */
  leaderGatedSeries: LineChartItem[];
  /**
   * Trend Template 8/8 positions the user actually opened.
   *
   * NOT every 8/8 entrant: at ~3.9 qualifying entrants a day, auto-logging them
   * would be ~1,000 lots a year — an equal-weight index of the screen rather
   * than a strategy, and it would swamp every other curve. Entrant alerts are
   * logged under category 'WATCH', which computeSimulation never reads. This
   * line exists only once a real purchase is recorded.
   */
  tt8Series: LineChartItem[];
  /** Same shape as dipSeries, filtered to REVERSAL (bear-market) trades. */
  reversalSeries: LineChartItem[];
  summary: SimulationSummary;
  /** Closed + open trades, newest buyDate first. */
  trades: SimulatedTrade[];
  /**
   * Every Trend Template entrant the engine has ALERTED, from the alert price.
   *
   * The running record of what was recommended, as opposed to tt8Series, which
   * is the far shorter list of entrants actually bought. Built from category
   * 'WATCH' rows, so it answers "was the shortlist any good?" independently of
   * whether the user acted on it. Never exits.
   */
  watchLeaderSeries: LineChartItem[];
  /**
   * The real portfolio's stock and ETF positions, FIFO-reconstructed from
   * activities and equal-weighted like every other line here.
   *
   * NOT the account's actual performance — that is what Overview and Holdings
   * report. This treats every position as the same size so it can be compared
   * with the hypothetical signal lines, which is the only question this chart
   * exists to answer. Funds are excluded: they are the buy-and-hold core.
   */
  trackedSeries: LineChartItem[];
  /** trackedSeries restricted to positions tagged BET — the user's own calls. */
  trackedBetSeries: LineChartItem[];
  /** trackedSeries restricted to positions tagged DIP — bought off a dip signal. */
  trackedDipSeries: LineChartItem[];
  /** trackedSeries restricted to positions tagged LEADER — bought off the screen. */
  trackedLeaderSeries: LineChartItem[];
  /** One row per real open position, for the table under the chart. */
  trackedPositions: TrackedPosition[];
  /** Every exit the engine actually signalled, for the chart's markers. */
  exitMarkers: SignalExitMarker[];
}

/**
 * A sell the engine told the user to take.
 *
 * These are the events the Simulation chart marks on the strategy lines. They
 * come from `SignalTradeTrackingService`'s terminal statuses, not from SELL
 * rows — the engine has never written one.
 */
export interface SignalExitMarker {
  /** ISO date the exit alert fired. */
  date: string;
  entryPrice: number;
  exitPrice: number;
  holdingDays: number;
  name?: string;
  /** Return net of the round-trip commission, in percent. */
  netReturnPct: number;
  /**
   * True when the exit price was inferred from the stored daily close because
   * the tracker did not record it. Shown to the reader — an inferred number
   * must never be presented as a recorded one.
   */
  reconstructed: boolean;
  /** Which strategy line this marker belongs on. */
  signalType: string;
  /** STOP_HIT or TRAILING_EXIT. */
  status: string;
  symbol: string;
  /**
   * The date a real sale actually happened, if one did.
   *
   * Deliberately separate from `date`, which is when the engine ASKED. The two
   * are different events — AMZN was signalled on 2026-08-03 and never sold — and
   * collapsing them was hiding the single most interesting fact on this table:
   * whether the advice was taken.
   */
  soldDate?: string;
  /** Realised return on the actual sale, net of both real commissions. */
  soldNetReturnPct?: number;
  soldPrice?: number;
}

/** A real, still-open position — what was paid, where it is, where it is going. */
export interface TrackedPosition {
  currency?: string;
  currentPrice?: number;
  entryDate: string;
  entryPrice: number;
  name?: string;
  netReturnPct?: number;
  /** Where this position came from: BET, DIP or LEADER. */
  provenance?: string;
  quantity: number;
  symbol: string;
  /**
   * Hand-set target where one exists, otherwise the engine's own take-profit.
   * Absent for ETFs, which have no single thesis price.
   */
  targetPrice?: number;
  /** Distance from the live price to the target, as a percentage. */
  toTargetPct?: number;
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
  cost: number;
  /** Expected value per trade as a fraction — the key legs are ranked by. Absent for the index/fund leg. */
  expectedValue?: number;
  fee: number;
  /** Probability [0-1] of a worthwhile gain over the horizon (the "why"). */
  hitProbability?: number;
  name: string;
  /** One-line explanation of the pick (expected value, probability, indicators). */
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
  /**
   * Minervini Trend Template + current base. Absent for anything without
   * persisted OHLC bars (MANUAL funds) or with less than ~a year of history.
   */
  trendTemplate?: TrendTemplateSnapshot;
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

/**
 * One name that passes the Minervini leader screen, with everything needed to
 * judge it by hand.
 *
 * Explicitly a *shortlist entry*, not a buy instruction. The 2026-08-21 event
 * study found breakout entries did not beat the universe base rate at 21/63/126
 * days, so these are surfaced for judgement rather than fired as signals — see
 * docs/TRADING_SIGNALS.md §0.3b.
 */
/**
 * One name on the Trend Template shortlist.
 *
 * The shortlist is a QUALITY filter, not a timing signal, and the distinction
 * is measured rather than stylistic: Trend Template 8/8 beats the universe base
 * rate by +2.49pp at 126 days (t=24.14, n=116,555), while buying at the VCP
 * pivot does not beat it at any horizon. So this carries no pivot distance and
 * is never ordered by one — ranking on proximity would rebuild the entry the
 * event study rejected. See docs/TRADING_SIGNALS.md §0.3b-bis.
 */
export interface ShortlistEntry {
  /** How far below the 52-week high, as a fraction. Context, not a rank key. */
  belowHighPct: number;
  currency?: string;
  dataSource: DataSource;
  name?: string;
  /** Sector/category the peer rank is computed within. */
  peerGroup?: string;
  /** 1-99 percentile of the GROUP against other groups (IBD's "L"). */
  peerGroupPercentile?: number;
  /** Position inside the peer group, 1 = strongest. */
  peerRank?: number;
  peerSize?: number;
  price: number;
  /** Cross-sectional relative-strength percentile, 1-99. */
  rsRank?: number;
  /** 3-month direction of the peer group as a whole. */
  sectorTailwind?: 'RISING' | 'FALLING' | 'MIXED';
  symbol: string;
  /** Present only when the name also happens to have a valid base. */
  vcpStatus?: 'AT_PIVOT' | 'BREAKOUT' | 'FAILED_BREAKOUT' | 'FORMING';
}

export interface ShortlistResponse {
  /** Market direction at the time of the run; null when unavailable. */
  breadth?: {
    breadth: number;
    healthy: boolean;
    total: number;
  };
  entries: ShortlistEntry[];
  /** How many names were evaluated, so an empty list is legible. */
  evaluated: number;
  generatedAt: string;
}

export interface LeaderCandidate {
  /** ATR(14) as a fraction of price — how much daily noise a stop must survive. */
  atrPct?: number;
  currency?: string;
  dataSource: DataSource;
  /** Average daily dollar volume over 50 days; the liquidity check. */
  dollarVolume?: number;
  name?: string;
  price: number;
  /** Suggested position size in the base currency. */
  positionSize?: number;
  /** Cross-sectional relative-strength percentile, 1-99. */
  rsRank?: number;
  /** Minervini's maximum: 7-8% below entry. */
  stopPrice?: number;
  symbol: string;
  /** Which of the 8 Trend Template criteria pass, by name. */
  trendCriteria: Record<string, boolean>;
  trendPasses: number;
  vcpContractionsPct?: number[];
  vcpPivot?: number;
  vcpPivotDistancePct?: number;
  /** FAILED_BREAKOUT = above the pivot but volume never confirmed it. */
  vcpStatus?: 'AT_PIVOT' | 'BREAKOUT' | 'FAILED_BREAKOUT' | 'FORMING';
  vcpVolumeRatio?: number;
  /** Final-contraction volume vs the 50-day average; <= 0.85 to qualify. */
  vcpDryUpRatio?: number;
  /** Non-price context reused from the existing pre-buy screen. */
  analystTrend?: string;
  daysToEarnings?: number;
  sectorTailwind?: string;
}

/**
 * Everything the ticker dialog's Trend tab renders: the 8 Trend Template
 * criteria with the number each was decided on, plus the current base.
 *
 * Carried on AssetDetailResponse rather than passed through the dialog's params
 * because the dialog is opened from four places (watchlist, Analytics,
 * Correlation, Simulation) and only the watchlist has a metrics row to hand.
 */
export interface TrendTemplateSnapshot {
  /** Distance above the 52-week low, as a fraction. */
  aboveLowPct: number;
  /** Distance below the 52-week high, as a fraction. */
  belowHighPct: number;
  /** The 8 criteria by name; keys match TrendTemplateResult['criteria']. */
  criteria: Record<string, boolean>;
  passCount: number;
  /**
   * Cross-sectional percentile, 1-99, or null when no rank is available. Null
   * means UNRANKED, not weak — criterion 8 renders accordingly, and
   * `rsUnavailableReason` says which of the three causes applies rather than
   * letting the UI guess.
   */
  rsRank: number | null;
  /**
   * Why `rsRank` is null. Absent when there is a rank.
   *
   * The dialog used to print "universe too small to rank" for every null, which
   * named a cause it had never checked — and the cause was almost always
   * NOT_PUBLISHED (the published map had expired). Three genuinely different
   * situations, and conflating them hid a cache bug for as long as it existed.
   */
  rsUnavailableReason?:
    | 'INSUFFICIENT_HISTORY'
    | 'NOT_PUBLISHED'
    | 'UNIVERSE_TOO_SMALL';
  /** Session the percentile describes (YYYY-MM-DD), when one is known. */
  rsAsOf?: string;
  /** How many names the percentile was measured against. */
  rsCohortSize?: number;
  /** Consecutive days the SMA200 has been non-decreasing. */
  sma200RisingDays: number;
  /** The raw numbers behind each criterion. */
  values: {
    high52: number;
    low52: number;
    price: number;
    sma50: number;
    sma150: number;
    sma200: number;
  };
  /** The current base, when one is valid. */
  vcp?: {
    baseDays: number;
    breakoutVolumeRatio: number;
    depthsPct: number[];
    dryUpRatio: number;
    pivot: number;
    pivotDistancePct: number;
    status: 'AT_PIVOT' | 'BREAKOUT' | 'FAILED_BREAKOUT' | 'FORMING';
  };
  /** Why no valid base was found, when there is none. */
  vcpRejectedReason?: string;
}

export interface LeaderCandidatesResponse {
  /** Market direction at the time of the run; null when unavailable. */
  breadth?: {
    breadth: number;
    healthy: boolean;
    total: number;
  };
  candidates: LeaderCandidate[];
  /** How many names were evaluated, so an empty list is legible. */
  evaluated: number;
  generatedAt: string;
  /** How many passed all 8 Trend Template criteria (before the VCP filter). */
  trendPassCount: number;
}
