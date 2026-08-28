import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import { Bar } from '@ghostfolio/api/services/signals/ohlc-bar.service';
import {
  SIGNAL_TREND_TEMPLATE_MAX_BELOW_HIGH_PCT,
  SIGNAL_TREND_TEMPLATE_MIN_ABOVE_LOW_PCT,
  SIGNAL_TREND_TEMPLATE_MIN_PASSES,
  SIGNAL_TREND_TEMPLATE_MIN_RS,
  SIGNAL_TREND_TEMPLATE_SMA200_RISING_DAYS,
  SIGNAL_VCP_BREAKOUT_VOLUME_RATIO,
  SIGNAL_VCP_CONTRACTION_TOLERANCE,
  SIGNAL_VCP_MAX_BASE_DAYS,
  SIGNAL_VCP_MAX_BASE_DEPTH_PCT,
  SIGNAL_VCP_MAX_CONTRACTIONS,
  SIGNAL_VCP_MAX_DRYUP_RATIO,
  SIGNAL_VCP_MAX_FINAL_TIGHTNESS_PCT,
  SIGNAL_VCP_MERGE_RALLY_PCT,
  SIGNAL_VCP_MIN_BASE_DAYS,
  SIGNAL_VCP_MIN_CONTRACTIONS,
  SIGNAL_VCP_PIVOT_PROXIMITY_PCT,
  SIGNAL_VCP_SWING_THRESHOLD_PCT
} from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';

/** One peak-to-trough pullback inside a base. */
export interface Contraction {
  depthPct: number; // (peak - trough) / peak
  fromDate: string;
  /** Bar index of the peak, within the analysed window. */
  fromIndex: number;
  peak: number;
  toDate: string;
  /** Bar index of the trough, within the analysed window. */
  toIndex: number;
  trough: number;
  /** Mean daily volume across the contraction — must fall from one to the next. */
  volume: number;
}

/**
 * Where the latest close sits relative to the pivot.
 *
 * FAILED_BREAKOUT is deliberately its own state rather than being folded into
 * AT_PIVOT. Price above the pivot without confirming volume is the textbook
 * breakout failure - supply absorbed the move - and it used to be filed as
 * "at pivot" by a symmetric proximity test. Measured, that was 45 of the 110
 * at-pivot names, i.e. 41% of a bucket meant to hold names still approaching.
 */
export type VcpStatus = 'AT_PIVOT' | 'BREAKOUT' | 'FAILED_BREAKOUT' | 'FORMING';

export interface VcpStructure {
  /**
   * Ordered oldest -> newest, CONTIGUOUS, depths shrinking monotonically.
   *
   * Contiguous is the load-bearing word: consecutive entries are adjacent
   * pullbacks with only the recovery rally between them. No pullback inside
   * the base is skipped, which is what stops a lower low being hidden.
   */
  contractions: Contraction[];
  /** Depth of the whole base, highest peak to lowest trough. */
  baseDepthPct: number;
  /** Where price sits relative to the pivot — derived once, read everywhere. */
  status: VcpStatus;
  /** Bars from the first peak to the last trough. */
  baseDays: number;
  /** Latest close is within SIGNAL_VCP_PIVOT_PROXIMITY_PCT of the pivot. */
  atPivot: boolean;
  /** Latest close is above the pivot on confirming volume. */
  breakout: boolean;
  /** Latest volume as a multiple of the 50-day average. */
  breakoutVolumeRatio: number;
  /** Final-contraction volume vs the 50-day average; < 1 means sellers dried up. */
  dryUpRatio: number;
  /** The shape passed every structural rule. Breakout/entry is a separate question. */
  isValid: boolean;
  /** The high of the final, tightest contraction — the buy trigger. */
  pivot: number;
  /** Depth of the final contraction; Minervini looks for 3-5%. */
  finalTightnessPct: number;
  /** Why it failed, when it did — so a near-miss is legible instead of a silent null. */
  rejectedReason: string | null;
}

export interface TrendTemplateResult {
  criteria: {
    /** 1. Price above the 50-, 150- and 200-day averages. */
    aboveAllMovingAverages: boolean;
    /** 2. SMA150 above SMA200. */
    sma150AboveSma200: boolean;
    /** 3. SMA200 trending up for at least a month. */
    sma200Rising: boolean;
    /** 4. SMA50 > SMA150 > SMA200 — the full stack, in order. */
    movingAveragesStacked: boolean;
    /** 5. Price above the 50-day. Overlaps criterion 1; both are in Minervini's list. */
    aboveSma50: boolean;
    /** 6. At least 30% above the 52-week low. */
    above52WeekLow: boolean;
    /** 7. Within 25% of the 52-week high. */
    near52WeekHigh: boolean;
    /** 8. Relative strength percentile >= 70 (prefer 90). */
    relativeStrength: boolean;
  };
  /** Distance below the 52-week high, as a fraction — reported even when it fails. */
  belowHighPct: number;
  /** Distance above the 52-week low, as a fraction. */
  aboveLowPct: number;
  /** Consecutive days the SMA200 has been non-decreasing. */
  sma200RisingDays: number;
  passCount: number;
  passed: boolean;
  rsRank: number | null;
  /**
   * The raw numbers each criterion was decided on, so a UI can show *why* a
   * test passed or failed rather than a bare tick. Computed anyway inside
   * `trendTemplate`; returning them costs nothing and makes a near-miss legible.
   */
  values: {
    high52: number;
    low52: number;
    price: number;
    sma50: number;
    sma150: number;
    sma200: number;
  };
}

/**
 * Minervini's Trend Template and Volatility Contraction Pattern.
 *
 * This is the engine's PRIMARY buy path as of 2026-08-21. It exists because the
 * composite score in `IndicatorsService.computeScore` weights `(100 - RSI)` and
 * `(1 - %B)`, so it rewards weakness by construction — across 153 backtested
 * names only 29% beat buy-and-hold, mean edge -23.5pp (docs §0.3). No amount of
 * exit tuning fixes an entry that systematically prefers falling stocks, so this
 * screen deliberately runs the opposite sign: buy confirmed strength near highs.
 *
 * Honest limitation: the VCP is a *discretionary* pattern that traders read
 * visually. What follows is a quantitative proxy — a swing detector plus
 * monotonic-contraction and volume rules. It will disagree with a human eye on
 * edge cases, in both directions, and it should be read as a shortlist rather
 * than a verdict.
 */
/**
 * Whether an instrument can have an ongoing expense ratio at all.
 *
 * Only pooled products charge one. Asking a data provider for a single stock's
 * expense ratio is not merely slow, it is guaranteed to find nothing — and the
 * watchlist fee lookup did exactly that for every one of the ~700 stocks it
 * watched, on every page load, each with its own timeout and retry.
 */
export function canHaveExpenseRatio(assetSubClass?: string | null): boolean {
  return assetSubClass === 'ETF' || assetSubClass === 'MUTUALFUND';
}

/** SignalState key for a leader alert's per-symbol cooldown. */
export function leaderAlertKey({
  dataSource,
  symbol
}: {
  dataSource: string;
  symbol: string;
}): string {
  return `LEADER:${dataSource}:${symbol}`;
}

/**
 * Which screened candidates are worth a message right now.
 *
 * Two rules, and both exist because of a specific observed failure:
 *
 *  1. **BREAKOUT only.** AT_PIVOT is a state, not an event — a name can sit at
 *     its pivot for a fortnight, so alerting on it re-sent the same two dozen
 *     names every evening. A breakout is dated and self-limiting: across 833
 *     tracked names a session typically produces about four. No extra RS floor
 *     is applied, because every candidate reaching here has already passed all
 *     8 Trend Template criteria and criterion 8 *is* RS >= 70.
 *  2. **Per-symbol cooldown.** The breakout bar keeps satisfying the test for
 *     several sessions afterwards, until its volume surge rolls out of the
 *     50-day average, so one event would otherwise alert every day for a week.
 */
export function selectFreshBreakouts<
  T extends { dataSource: string; symbol: string; vcpStatus?: string }
>({
  candidates,
  cooldownMs,
  lastNotifiedByKey,
  now
}: {
  candidates: T[];
  cooldownMs: number;
  /** SignalState.lastNotifiedAt by `leaderAlertKey`, for known symbols only. */
  lastNotifiedByKey: Map<string, Date | null | undefined>;
  now: Date;
}): T[] {
  return candidates.filter((candidate) => {
    if (candidate.vcpStatus !== 'BREAKOUT') {
      return false;
    }

    const lastNotifiedAt = lastNotifiedByKey.get(leaderAlertKey(candidate));

    return (
      !lastNotifiedAt || now.getTime() - lastNotifiedAt.getTime() >= cooldownMs
    );
  });
}

/**
 * Which open LEADER lots have hit their stop.
 *
 * There is no take-profit counterpart on purpose: the doctrine this screen
 * implements is to cut at 7-8% and let winners run, so a lot is only ever
 * closed by its stop. A lot with no stop, or a symbol with no live price, is
 * left open rather than guessed at.
 */
export function selectStoppedLots<
  T extends { stopLoss?: number | null; symbol: string }
>({
  lots,
  priceBySymbol
}: {
  lots: T[];
  priceBySymbol: Map<string, number | undefined>;
}): T[] {
  return lots.filter(({ stopLoss, symbol }) => {
    const price = priceBySymbol.get(symbol);

    return stopLoss != null && price != null && price <= stopLoss;
  });
}

@Injectable()
export class LeaderScreenService {
  public constructor(private readonly indicatorsService: IndicatorsService) {}

  /**
   * The eight Trend Template criteria.
   *
   * `rsRank` is a *cross-sectional* percentile and cannot be derived from one
   * symbol's history, so it is passed in from `CrossSectionalService`. Passing
   * null evaluates the seven price-only criteria and fails criterion 8, which is
   * the correct behaviour for a universe too small to rank.
   */
  public trendTemplate({
    bars,
    rsRank
  }: {
    bars: Bar[];
    rsRank: number | null;
  }): TrendTemplateResult | null {
    // 200-day average plus a month of slope history is the binding requirement.
    if (bars.length < 200 + SIGNAL_TREND_TEMPLATE_SMA200_RISING_DAYS) {
      return null;
    }

    const closes = bars.map(({ close }) => close);
    const price = closes[closes.length - 1];

    const sma50 = this.indicatorsService.sma(closes, 50);
    const sma150 = this.indicatorsService.sma(closes, 150);
    const sma200 = this.indicatorsService.sma(closes, 200);

    if (sma50 === null || sma150 === null || sma200 === null) {
      return null;
    }

    const sma200Series = this.indicatorsService.smaSeries(closes, 200);
    const sma200RisingDays =
      this.indicatorsService.slopeUpDuration(sma200Series);

    const high52 = this.indicatorsService.highestHigh(bars, 252);
    const low52 = this.indicatorsService.lowestLow(bars, 252);

    const aboveLowPct = low52 > 0 ? (price - low52) / low52 : 0;
    const belowHighPct = high52 > 0 ? (high52 - price) / high52 : 1;

    const criteria = {
      aboveAllMovingAverages: price > sma50 && price > sma150 && price > sma200,
      aboveSma50: price > sma50,
      above52WeekLow: aboveLowPct >= SIGNAL_TREND_TEMPLATE_MIN_ABOVE_LOW_PCT,
      movingAveragesStacked: sma50 > sma150 && sma150 > sma200,
      near52WeekHigh: belowHighPct <= SIGNAL_TREND_TEMPLATE_MAX_BELOW_HIGH_PCT,
      relativeStrength:
        rsRank !== null && rsRank >= SIGNAL_TREND_TEMPLATE_MIN_RS,
      sma150AboveSma200: sma150 > sma200,
      sma200Rising: sma200RisingDays >= SIGNAL_TREND_TEMPLATE_SMA200_RISING_DAYS
    };

    const passCount = Object.values(criteria).filter(Boolean).length;

    return {
      aboveLowPct,
      belowHighPct,
      criteria,
      passCount,
      passed: passCount >= SIGNAL_TREND_TEMPLATE_MIN_PASSES,
      rsRank,
      sma200RisingDays,
      values: { high52, low52, price, sma50, sma150, sma200 }
    };
  }

  /**
   * Detects a Volatility Contraction Pattern in the trailing base.
   *
   * Minervini's own description: "the first correction might be 20%, 25%, 33%,
   * and then it'll contract usually the contractions are about half of the
   * previous correction. So maybe it contracts to 10 or 15 and then contracts to
   * 3, 4 or 5 or 8%." Volume dries up as each contraction tightens, then expands
   * 40-50% above average on the breakout through the pivot.
   *
   * Always returns a structure (never null once there are enough bars) so the
   * caller can show *why* a name missed. `isValid` is the gate.
   */
  public vcpStructure(bars: Bar[]): VcpStructure | null {
    if (bars.length < SIGNAL_VCP_MIN_BASE_DAYS + 50) {
      return null;
    }

    const window = bars.slice(-SIGNAL_VCP_MAX_BASE_DAYS);
    const volumes = bars.map(({ volume }) => volume);
    const averageVolume = this.indicatorsService.averageVolume(volumes, 50);
    const latest = bars[bars.length - 1];

    const swings = this.detectSwings(window);
    const rawContractions = this.toContractions(swings, window);
    const merged = this.mergeStalledRallies(rawContractions, window);
    const contractions = this.tighteningSuffix(merged);

    const empty = (rejectedReason: string): VcpStructure => {
      return {
        atPivot: false,
        baseDays: window.length,
        baseDepthPct: 0,
        breakout: false,
        breakoutVolumeRatio:
          averageVolume > 0 ? latest.volume / averageVolume : 0,
        contractions,
        dryUpRatio: 0,
        finalTightnessPct: 0,
        isValid: false,
        pivot: null,
        rejectedReason,
        status: 'FORMING'
      };
    };

    if (contractions.length < SIGNAL_VCP_MIN_CONTRACTIONS) {
      return empty(
        `only ${contractions.length} consecutive tightening contraction(s) out of ${merged.length} pullbacks; need ${SIGNAL_VCP_MIN_CONTRACTIONS}`
      );
    }

    if (contractions.length > SIGNAL_VCP_MAX_CONTRACTIONS) {
      return empty(
        `${contractions.length} tightening steps is more base than setup`
      );
    }

    const finalContraction = contractions[contractions.length - 1];
    const finalTightnessPct = finalContraction.depthPct;

    if (finalTightnessPct > SIGNAL_VCP_MAX_FINAL_TIGHTNESS_PCT) {
      return empty(
        `final contraction ${(finalTightnessPct * 100).toFixed(1)}% is not tight enough`
      );
    }

    const baseDays = this.tradingDaysBetween(
      window,
      contractions[0].fromDate,
      finalContraction.toDate
    );

    if (baseDays < SIGNAL_VCP_MIN_BASE_DAYS) {
      return empty(
        `base is only ${baseDays} days; too young to be accumulation`
      );
    }

    const highestPeak = Math.max(...contractions.map(({ peak }) => peak));
    const lowestTrough = Math.min(...contractions.map(({ trough }) => trough));
    const baseDepthPct =
      highestPeak > 0 ? (highestPeak - lowestTrough) / highestPeak : 0;

    if (baseDepthPct > SIGNAL_VCP_MAX_BASE_DEPTH_PCT) {
      return empty(
        `base is ${(baseDepthPct * 100).toFixed(1)}% deep; that is a broken stock, not a consolidation`
      );
    }

    // Volume must fall through the base — that is the whole "sellers exhausted"
    // premise. Compare the final contraction's volume with the 50-day average.
    const dryUpRatio =
      averageVolume > 0 ? finalContraction.volume / averageVolume : 1;

    if (dryUpRatio > SIGNAL_VCP_MAX_DRYUP_RATIO) {
      return empty(
        `volume did not dry up (${dryUpRatio.toFixed(2)}x average in the final contraction)`
      );
    }

    const pivot = finalContraction.peak;
    const breakoutVolumeRatio =
      averageVolume > 0 ? latest.volume / averageVolume : 0;
    const distanceToPivot = pivot > 0 ? (latest.close - pivot) / pivot : -1;
    const abovePivot = latest.close > pivot;
    const onVolume = breakoutVolumeRatio >= SIGNAL_VCP_BREAKOUT_VOLUME_RATIO;

    // One-sided: "at pivot" means still BELOW it and closing in. Above the
    // pivot the only question is whether volume confirmed the move.
    const atPivot =
      !abovePivot && distanceToPivot >= -SIGNAL_VCP_PIVOT_PROXIMITY_PCT;
    const breakout = abovePivot && onVolume;

    return {
      atPivot,
      baseDays,
      baseDepthPct,
      breakout,
      breakoutVolumeRatio,
      contractions,
      dryUpRatio,
      finalTightnessPct,
      isValid: true,
      pivot,
      rejectedReason: null,
      status: breakout
        ? 'BREAKOUT'
        : abovePivot
          ? 'FAILED_BREAKOUT'
          : atPivot
            ? 'AT_PIVOT'
            : 'FORMING'
    };
  }

  /**
   * Darvas box: the consolidation ceiling and floor a stock is currently caught
   * between. Cheaper and cruder than a VCP — no contraction sequence, just the
   * boundaries — but useful as a breakout reference when no VCP is present.
   */
  public darvasBox(
    bars: Bar[],
    lookback = 40
  ): { bottom: number; top: number; withinBox: boolean } | null {
    if (bars.length < lookback) {
      return null;
    }

    const window = bars.slice(-lookback);
    const top = Math.max(...window.map(({ high }) => high));
    const topIndex = window.findIndex(({ high }) => high === top);

    // The floor is the lowest low set *after* the ceiling — that is what makes
    // it a box rather than just a range.
    const afterTop = window.slice(topIndex);

    if (afterTop.length < 2) {
      return null;
    }

    const bottom = Math.min(...afterTop.map(({ low }) => low));
    const close = bars[bars.length - 1].close;

    return { bottom, top, withinBox: close >= bottom && close <= top };
  }

  /**
   * Fuses adjacent pullbacks that a weak rally failed to separate.
   *
   * A base often steps down in two or three moves with only a feeble bounce
   * between them. To the eye that is ONE contraction; to a ZigZag it is
   * several. The previous implementation handled this by searching for the
   * longest *subsequence* of pullbacks that happened to shrink, skipping the
   * rest — which is not the same thing at all, because a skipped stretch can
   * contain a lower low that the surviving sequence then claims never
   * happened. Measured across 757 symbols, 77% of accepted bases contained
   * exactly that contradiction, and 96.6% had discarded a pullback deeper
   * than the one they kept.
   *
   * Merging is the honest version of the same idea: the merged contraction
   * spans from the first peak to the LOWER of the two troughs, so a deeper
   * low is absorbed into the depth rather than hidden behind it.
   */
  private mergeStalledRallies(
    contractions: Contraction[],
    bars: Bar[]
  ): Contraction[] {
    if (contractions.length < 2) {
      return [...contractions];
    }

    const merged: Contraction[] = [contractions[0]];

    for (let i = 1; i < contractions.length; i++) {
      const previous = merged[merged.length - 1];
      const current = contractions[i];
      const pullback = previous.peak - previous.trough;
      // Fraction of the previous pullback the intervening rally recovered.
      const recovered =
        pullback > 0 ? (current.peak - previous.trough) / pullback : 1;

      if (recovered >= SIGNAL_VCP_MERGE_RALLY_PCT) {
        merged.push(current);

        continue;
      }

      const trough = Math.min(previous.trough, current.trough);
      const toIndex =
        current.trough <= previous.trough ? current.toIndex : previous.toIndex;

      merged[merged.length - 1] = {
        depthPct:
          previous.peak > 0 ? (previous.peak - trough) / previous.peak : 0,
        fromDate: previous.fromDate,
        fromIndex: previous.fromIndex,
        peak: previous.peak,
        toDate: bars[toIndex]?.date ?? previous.toDate,
        toIndex,
        trough,
        volume: this.meanVolume(bars, previous.fromIndex, toIndex)
      };
    }

    return merged;
  }

  /**
   * The longest run of pullbacks, ending at the most recent one, that both
   * tighten and make higher lows.
   *
   * A *suffix*, not a subsequence: every pullback between the base start and
   * now is included, so the moment price makes a lower low the base is
   * truncated there rather than the offending move being stepped over. The
   * chain must end at the latest pullback because its peak is the pivot — a
   * sequence that stopped tightening weeks ago is not a live setup.
   */
  private tighteningSuffix(contractions: Contraction[]): Contraction[] {
    if (contractions.length === 0) {
      return [];
    }

    let start = contractions.length - 1;

    while (start > 0) {
      const earlier = contractions[start - 1];
      const later = contractions[start];

      const tightens =
        later.depthPct <
        earlier.depthPct * (1 - SIGNAL_VCP_CONTRACTION_TOLERANCE);
      const higherLow = later.trough > earlier.trough;

      if (!tightens || !higherLow) {
        break;
      }

      start--;
    }

    return contractions.slice(start);
  }

  private meanVolume(bars: Bar[], fromIndex: number, toIndex: number): number {
    const span = bars.slice(fromIndex, toIndex + 1);

    return span.length > 0
      ? span.reduce((sum, { volume }) => sum + volume, 0) / span.length
      : 0;
  }

  /**
   * Swing turning points via a ZigZag filter.
   *
   * A fixed-width fractal (a bar higher than its N neighbours) was the obvious
   * alternative and is wrong here: VCP contractions get progressively tighter,
   * so a width tuned to catch the first 20% pullback is far too coarse for the
   * final 4% one — precisely the contraction that defines the pivot. A
   * percentage-move filter stays proportional all the way down the base.
   */
  private detectSwings(
    bars: Bar[]
  ): { date: string; index: number; kind: 'PEAK' | 'TROUGH'; price: number }[] {
    const swings: {
      date: string;
      index: number;
      kind: 'PEAK' | 'TROUGH';
      price: number;
    }[] = [];

    if (bars.length === 0) {
      return swings;
    }

    let direction: 'UP' | 'DOWN' = 'UP';
    let extremePrice = bars[0].high;
    let extremeIndex = 0;

    for (let i = 1; i < bars.length; i++) {
      const bar = bars[i];

      if (direction === 'UP') {
        if (bar.high >= extremePrice) {
          extremePrice = bar.high;
          extremeIndex = i;
        } else if (
          (extremePrice - bar.low) / extremePrice >=
          SIGNAL_VCP_SWING_THRESHOLD_PCT
        ) {
          swings.push({
            date: bars[extremeIndex].date,
            index: extremeIndex,
            kind: 'PEAK',
            price: extremePrice
          });
          direction = 'DOWN';
          extremePrice = bar.low;
          extremeIndex = i;
        }
      } else {
        if (bar.low <= extremePrice) {
          extremePrice = bar.low;
          extremeIndex = i;
        } else if (
          (bar.high - extremePrice) / extremePrice >=
          SIGNAL_VCP_SWING_THRESHOLD_PCT
        ) {
          swings.push({
            date: bars[extremeIndex].date,
            index: extremeIndex,
            kind: 'TROUGH',
            price: extremePrice
          });
          direction = 'UP';
          extremePrice = bar.high;
          extremeIndex = i;
        }
      }
    }

    return swings;
  }

  /** Pairs each peak with the trough that follows it — one pullback per pair. */
  private toContractions(
    swings: {
      date: string;
      index: number;
      kind: 'PEAK' | 'TROUGH';
      price: number;
    }[],
    bars: Bar[]
  ): Contraction[] {
    const contractions: Contraction[] = [];

    for (let i = 0; i < swings.length - 1; i++) {
      const peak = swings[i];
      const trough = swings[i + 1];

      if (peak.kind !== 'PEAK' || trough.kind !== 'TROUGH') {
        continue;
      }

      contractions.push({
        depthPct: peak.price > 0 ? (peak.price - trough.price) / peak.price : 0,
        fromDate: peak.date,
        fromIndex: peak.index,
        peak: peak.price,
        toDate: trough.date,
        toIndex: trough.index,
        trough: trough.price,
        volume: this.meanVolume(bars, peak.index, trough.index)
      });
    }

    return contractions;
  }

  private tradingDaysBetween(
    bars: Bar[],
    fromDate: string,
    toDate: string
  ): number {
    const fromIndex = bars.findIndex(({ date }) => date === fromDate);
    const toIndex = bars.findIndex(({ date }) => date === toDate);

    return fromIndex >= 0 && toIndex >= fromIndex ? toIndex - fromIndex + 1 : 0;
  }
}
