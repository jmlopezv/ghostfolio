import {
  SIGNAL_BUY_SIGMA_MULT,
  SIGNAL_VOLATILITY_LOOKBACK_DAYS
} from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';

export interface IndicatorSnapshot {
  bollinger: { lower: number; middle: number; pctB: number; upper: number };
  momentum3M: number;
  momentum12M: number;
  macd: { histogram: number; macd: number; signal: number };
  price: number;
  rsi: number;
  sma50: number;
  sma200: number;
  /** Standard deviation of daily close-to-close returns (daily volatility). */
  volatility: number;
}

/**
 * Tier 1 of the trading-signals engine: pure, stateless technical-indicator math
 * over a series of closing prices, plus a composite 0-100 "buy attractiveness"
 * score and volatility-adaptive threshold helpers.
 *
 * Implemented directly (no external dependency) so it is fully unit-testable and
 * carries no install/version risk. EOD data only provides close prices, so
 * volatility is measured close-to-close rather than via true ATR.
 */
@Injectable()
export class IndicatorsService {
  public sma(values: number[], period: number): number {
    if (values.length < period || period <= 0) {
      return null;
    }

    const slice = values.slice(values.length - period);

    return slice.reduce((sum, value) => sum + value, 0) / period;
  }

  public ema(values: number[], period: number): number[] {
    if (values.length === 0 || period <= 0) {
      return [];
    }

    const multiplier = 2 / (period + 1);
    const result: number[] = [];
    let previous = values[0];
    result.push(previous);

    for (let i = 1; i < values.length; i++) {
      previous = (values[i] - previous) * multiplier + previous;
      result.push(previous);
    }

    return result;
  }

  /**
   * Wilder's RSI over the given period. Returns a value in [0, 100], or null if
   * there is insufficient data.
   */
  public rsi(values: number[], period = 14): number {
    if (values.length <= period) {
      return null;
    }

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      const change = values[i] - values[i - 1];

      if (change >= 0) {
        avgGain += change;
      } else {
        avgLoss -= change;
      }
    }

    avgGain /= period;
    avgLoss /= period;

    for (let i = period + 1; i < values.length; i++) {
      const change = values[i] - values[i - 1];
      const gain = change >= 0 ? change : 0;
      const loss = change < 0 ? -change : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;

    return 100 - 100 / (1 + rs);
  }

  public macd(
    values: number[],
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  ): { histogram: number; macd: number; signal: number } {
    if (values.length < slowPeriod + signalPeriod) {
      return { histogram: null, macd: null, signal: null };
    }

    const fastEma = this.ema(values, fastPeriod);
    const slowEma = this.ema(values, slowPeriod);

    const macdLine = values.map((_, i) => fastEma[i] - slowEma[i]);
    const signalLineSeries = this.ema(
      macdLine.slice(slowPeriod - 1),
      signalPeriod
    );

    const macd = macdLine[macdLine.length - 1];
    const signal = signalLineSeries[signalLineSeries.length - 1];

    return { histogram: macd - signal, macd, signal };
  }

  /**
   * Bollinger Bands plus %B (where price sits within the band: 0 = lower band,
   * 1 = upper band).
   */
  public bollinger(
    values: number[],
    period = 20,
    multiplier = 2
  ): { lower: number; middle: number; pctB: number; upper: number } {
    if (values.length < period) {
      return { lower: null, middle: null, pctB: null, upper: null };
    }

    const slice = values.slice(values.length - period);
    const middle = slice.reduce((sum, value) => sum + value, 0) / period;
    const variance =
      slice.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    const upper = middle + multiplier * standardDeviation;
    const lower = middle - multiplier * standardDeviation;
    const price = values[values.length - 1];
    const pctB = upper === lower ? 0.5 : (price - lower) / (upper - lower);

    return { lower, middle, pctB, upper };
  }

  /** Daily close-to-close log returns. */
  public logReturns(values: number[]): number[] {
    const returns: number[] = [];

    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] > 0 && values[i] > 0) {
        returns.push(Math.log(values[i] / values[i - 1]));
      }
    }

    return returns;
  }

  /**
   * Garman-Klass daily volatility from OHLC bars — ~7× more efficient than
   * close-to-close because it uses the intraday range. Underestimates a touch
   * (no overnight gap term). Returns a single daily-σ estimate over the window.
   */
  public garmanKlass(
    bars: { close: number; high: number; low: number; open: number }[]
  ): number {
    const valid = bars.filter(
      ({ close, high, low, open }) =>
        high > 0 && low > 0 && close > 0 && open > 0
    );

    if (valid.length < 2) {
      return 0;
    }

    const sum = valid.reduce((acc, { close, high, low, open }) => {
      const hl = Math.log(high / low);
      const co = Math.log(close / open);

      return acc + 0.5 * hl * hl - (2 * Math.LN2 - 1) * co * co;
    }, 0);

    return Math.sqrt(Math.max(0, sum / valid.length));
  }

  /**
   * Yang-Zhang daily volatility — the most efficient OHLC estimator (~8× vs
   * close-to-close), robust to overnight gaps and drift. Returns a single daily-σ
   * estimate over the window. Needs the previous close, so ≥3 bars.
   */
  public yangZhang(
    bars: { close: number; high: number; low: number; open: number }[]
  ): number {
    if (bars.length < 3) {
      return this.garmanKlass(bars);
    }

    const overnight: number[] = []; // ln(open_i / close_{i-1})
    const openClose: number[] = []; // ln(close_i / open_i)
    let rsSum = 0;
    let rsCount = 0;

    for (let i = 1; i < bars.length; i++) {
      const prev = bars[i - 1];
      const { close, high, low, open } = bars[i];

      if (open > 0 && prev.close > 0 && close > 0 && high > 0 && low > 0) {
        overnight.push(Math.log(open / prev.close));
        openClose.push(Math.log(close / open));
        // Rogers-Satchell term.
        rsSum +=
          Math.log(high / close) * Math.log(high / open) +
          Math.log(low / close) * Math.log(low / open);
        rsCount += 1;
      }
    }

    const n = overnight.length;

    if (n < 2 || rsCount === 0) {
      return this.garmanKlass(bars);
    }

    const sampleVar = (xs: number[]) => {
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;

      return xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
    };

    const varOvernight = sampleVar(overnight);
    const varOpen = sampleVar(openClose);
    const varRs = rsSum / rsCount;
    const k = 0.34 / (1.34 + (n + 1) / (n - 1));

    return Math.sqrt(Math.max(0, varOvernight + k * varOpen + (1 - k) * varRs));
  }

  /**
   * Standard deviation of daily returns (daily volatility), measured over the
   * trailing `SIGNAL_VOLATILITY_LOOKBACK_DAYS` observations.
   *
   * The lookback is pinned rather than "however long the caller's array
   * happens to be": σ sets every stop, target and trailing band, so letting
   * it drift with an unrelated fetch-window constant makes those levels move
   * for reasons that have nothing to do with the market. Callers must pass a
   * TRADING-day series (see toTradingDayCloses) for the √252 annualisation
   * downstream to hold.
   */
  public volatility(values: number[]): number {
    const window =
      values.length > SIGNAL_VOLATILITY_LOOKBACK_DAYS + 1
        ? values.slice(-(SIGNAL_VOLATILITY_LOOKBACK_DAYS + 1))
        : values;
    const returns = this.logReturns(window);

    if (returns.length < 2) {
      return 0;
    }

    const mean =
      returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance =
      returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (returns.length - 1);

    return Math.sqrt(variance);
  }

  /** Percentage change over the trailing `lookback` observations. */
  public momentum(values: number[], lookback: number): number {
    if (values.length <= lookback) {
      return null;
    }

    const past = values[values.length - 1 - lookback];
    const current = values[values.length - 1];

    if (!past) {
      return null;
    }

    return (current - past) / past;
  }

  /** Highest close over the trailing `lookback` observations (inclusive). */
  public highestClose(values: number[], lookback: number): number {
    if (values.length === 0) {
      return null;
    }

    return Math.max(...values.slice(Math.max(0, values.length - lookback)));
  }

  public computeSnapshot(closes: number[]): IndicatorSnapshot {
    return {
      bollinger: this.bollinger(closes),
      macd: this.macd(closes),
      momentum3M: this.momentum(closes, 63),
      momentum12M: this.momentum(closes, 252),
      price: closes[closes.length - 1],
      rsi: this.rsi(closes),
      sma50: this.sma(closes, 50),
      sma200: this.sma(closes, 200),
      volatility: this.volatility(closes)
    };
  }

  /**
   * Composite 0-100 "buy attractiveness" score. Higher means more attractive to
   * buy (oversold / near lower band), gated by a healthy long-term uptrend so we
   * avoid buying into a confirmed downtrend ("falling knife"). The score ranks
   * candidates; the actual category decision still uses adaptive price bands.
   */
  public computeScore(snapshot: IndicatorSnapshot): number {
    const weights = {
      bollinger: 0.3,
      macd: 0.15,
      momentum: 0.15,
      rsi: 0.25,
      trend: 0.15
    };

    let weightUsed = 0;
    let score = 0;

    // RSI: oversold (low) is attractive to buy.
    if (snapshot.rsi !== null) {
      score += weights.rsi * (100 - snapshot.rsi);
      weightUsed += weights.rsi;
    }

    // Bollinger %B: near/below lower band (low %B) is attractive to buy.
    if (snapshot.bollinger.pctB !== null) {
      const clamped = Math.max(0, Math.min(1, snapshot.bollinger.pctB));
      score += weights.bollinger * (1 - clamped) * 100;
      weightUsed += weights.bollinger;
    }

    // MACD histogram: positive momentum turning up is constructive.
    if (snapshot.macd.histogram !== null) {
      score += weights.macd * (snapshot.macd.histogram >= 0 ? 100 : 30);
      weightUsed += weights.macd;
    }

    // Trend regime: reward price above the 200-day average (healthy uptrend).
    if (snapshot.sma200 !== null) {
      score += weights.trend * (snapshot.price >= snapshot.sma200 ? 100 : 20);
      weightUsed += weights.trend;
    }

    // Long-term momentum: reward positive 12-month momentum (quality filter).
    if (snapshot.momentum12M !== null) {
      score += weights.momentum * (snapshot.momentum12M >= 0 ? 100 : 30);
      weightUsed += weights.momentum;
    }

    return weightUsed === 0 ? 0 : Math.round(score / weightUsed);
  }

  /**
   * Detects a disciplined reversal in a beaten-down name — the responsible way
   * to buy weakness without catching a falling knife. Requires ALL of:
   *  - beaten down: price below the 200-day average (a downtrend/bear context),
   *  - RSI turning up FROM oversold (yesterday's RSI < rsiOversoldMax, today's higher),
   *  - a higher low (the recent 5-day low above the prior 5-day low — selling easing),
   *  - reclaim of the 20-day average (price back above short-term trend).
   * Volume confirmation is layered on by the caller (capitulation).
   */
  public reversalStructure(
    closes: number[],
    rsiMax = 70
  ): {
    beatenDown: boolean;
    higherLow: boolean;
    isReversal: boolean;
    reclaimedSma20: boolean;
    rsi: number | null;
    rsiTurningUp: boolean;
  } {
    const rsi = this.rsi(closes);
    const rsiPrev = this.rsi(closes.slice(0, -1));
    const sma20 = this.sma(closes, 20);
    const sma200 = this.sma(closes, 200);
    const price = closes[closes.length - 1];

    const beatenDown = sma200 !== null && price < sma200;
    // RSI rising and not yet overbought/extended (the oversold was during the
    // decline; the higher-low + SMA20 reclaim confirm the bottom is in).
    const rsiTurningUp =
      rsi !== null && rsiPrev !== null && rsi > rsiPrev && rsi < rsiMax;
    const reclaimedSma20 = sma20 !== null && price >= sma20;

    let higherLow = false;
    if (closes.length >= 10) {
      const recentLow = Math.min(...closes.slice(-5));
      const priorLow = Math.min(...closes.slice(-10, -5));
      higherLow = recentLow > priorLow;
    }

    return {
      beatenDown,
      higherLow,
      isReversal: beatenDown && rsiTurningUp && reclaimedSma20 && higherLow,
      reclaimedSma20,
      rsi,
      rsiTurningUp
    };
  }

  /** True when the long-term trend is down (suppress dip-buying / falling knife). */
  public isDowntrend(snapshot: IndicatorSnapshot): boolean {
    if (snapshot.sma50 === null || snapshot.sma200 === null) {
      return false;
    }

    return snapshot.sma50 < snapshot.sma200 && snapshot.price < snapshot.sma200;
  }

  /**
   * Volatility-adaptive buy-dip reference price. Falls back to the fixed
   * `dropPct` below the recent high, but never tighter than a `sigmaMult`-sigma
   * band over the trading horizon (1.5 for stocks, 1.0 for ETFs), so calm
   * names don't trigger on noise.
   */
  public adaptiveBuyLevel({
    recentHigh,
    dropPct,
    horizonDays,
    sigmaMult = SIGNAL_BUY_SIGMA_MULT,
    volatility
  }: {
    dropPct: number;
    horizonDays: number;
    price?: number;
    recentHigh: number;
    sigmaMult?: number;
    volatility: number;
  }): number {
    const fixedLevel = recentHigh * (1 - dropPct);
    const sigmaDrop =
      recentHigh * (1 - sigmaMult * volatility * Math.sqrt(horizonDays));

    // Use whichever is the more conservative (lower) of the two references.
    return Math.min(fixedLevel, isFinite(sigmaDrop) ? sigmaDrop : fixedLevel);
  }

  /**
   * The expected-move band over the horizon (daily volatility scaled by √days).
   * Used as the common unit for the take-profit, stop-loss and trailing levels.
   */
  public horizonBand(volatility: number, horizonDays: number): number {
    const band = volatility * Math.sqrt(horizonDays);

    return isFinite(band) ? band : 0;
  }

  /**
   * Volatility-adaptive take-profit price scaled to the trading horizon. The
   * target gain is the larger of a fixed floor and a multiple of the stock's
   * own expected move, applied to the fee-adjusted cost basis.
   *
   * feePerShare: round-trip brokerage cost divided by position size, so the
   * target clears both the profit goal AND the fees.
   * floorPct: minimum gain (e.g. 0.08) so calm names still clear costs.
   */
  public adaptiveTakeProfitLevel({
    averageBuyPrice,
    feePerShare = 0,
    floorPct,
    horizonDays,
    volatility,
    volMult
  }: {
    averageBuyPrice: number;
    feePerShare?: number;
    floorPct: number;
    horizonDays: number;
    volatility: number;
    volMult: number;
  }): number {
    const effectiveCost = averageBuyPrice + feePerShare;
    const band = this.horizonBand(volatility, horizonDays);
    const gainPct = Math.max(floorPct, volMult * band);

    return effectiveCost * (1 + gainPct);
  }

  /**
   * Volatility-adaptive stop-loss price: a fixed multiple of the horizon band
   * below the average buy price. Provides defined downside on active trades.
   */
  public stopLossLevel({
    averageBuyPrice,
    horizonDays,
    volatility,
    volMult
  }: {
    averageBuyPrice: number;
    horizonDays: number;
    volatility: number;
    volMult: number;
  }): number {
    const band = this.horizonBand(volatility, horizonDays);

    return averageBuyPrice * (1 - volMult * band);
  }

  /**
   * Trailing-stop price: a multiple of the horizon band below the running peak
   * reached since the take-profit target was first hit. Lets winners run while
   * locking in gains on a pullback.
   */
  public trailingStopLevel({
    horizonDays,
    peak,
    volatility,
    volMult
  }: {
    horizonDays: number;
    peak: number;
    volatility: number;
    volMult: number;
  }): number {
    const band = this.horizonBand(volatility, horizonDays);

    return peak * (1 - volMult * band);
  }
}
