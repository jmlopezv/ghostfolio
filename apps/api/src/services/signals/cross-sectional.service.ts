import {
  SIGNAL_RS_MIN_UNIVERSE,
  SIGNAL_RS_WEIGHTS
} from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';

/** The minimum a series needs for ranking: a close and the day it belongs to. */
export interface DatedClose {
  close: number;
  date: string; // YYYY-MM-DD
}

export interface RelativeStrength {
  /** Weighted composite of trailing returns, before ranking. Unitless. */
  rsScore: number;
  /** 1-99 percentile of rsScore across the universe. Higher is stronger. */
  rsRank: number;
  /** 12-month return excluding the most recent month, as a fraction. */
  momentum12m2: number | null;
  return3m: number | null;
  return6m: number | null;
  return9m: number | null;
  return12m: number | null;
  symbol: string;
}

/** Lookback windows, in CALENDAR months. See `periodReturn`. */
const PERIOD_MONTHS = {
  month1: 1,
  month3: 3,
  month6: 6,
  month9: 9,
  month12: 12
};

/**
 * A sanity floor on how many points a series must carry before it is ranked.
 *
 * The real eligibility test is date-based (see `periodReturn`), but a series
 * spanning a year in a handful of points is not a daily series at all, and its
 * "12-month return" would be measured between two arbitrary dots.
 */
const MIN_BARS_FOR_RANK = 200;

/**
 * How far before a window boundary the anchoring bar may sit, in calendar days.
 *
 * A cutoff routinely lands on a weekend or a holiday, so the nearest earlier bar
 * is normally 1-4 days off, and a Christmas or Easter cluster stretches that.
 * Beyond this the series does not merely align awkwardly, it has a hole, and
 * anchoring to whatever bar precedes the gap would silently measure a different
 * window from the rest of the universe.
 *
 * Applied to the numerator as well, which is what keeps a symbol whose gather
 * has stalled out of the cohort instead of ranking stale prices against fresh.
 */
const MAX_ANCHOR_STALENESS_DAYS = 15;

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** `date` shifted back by whole calendar months, clamped to a real day. */
export function monthsBefore(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const targetMonth = month - 1 - months;
  // 31 March minus one month is 28 February, not 3 March.
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonth + 1, 0)
  ).getUTCDate();

  return new Date(
    Date.UTC(year, targetMonth, Math.min(day, lastDayOfTargetMonth))
  )
    .toISOString()
    .slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      MILLISECONDS_PER_DAY
  );
}

/**
 * The close on `cutoff`, else the most recent one before it.
 *
 * Null when the nearest earlier bar is more than `MAX_ANCHOR_STALENESS_DAYS`
 * away. The series is ascending, so this walks back from the end and stops at
 * the first hit.
 */
function closeAsOf(series: DatedClose[], cutoff: string): number | null {
  for (let index = series.length - 1; index >= 0; index--) {
    const point = series[index];

    if (point.date <= cutoff) {
      if (daysBetween(point.date, cutoff) > MAX_ANCHOR_STALENESS_DAYS) {
        return null;
      }

      return point.close > 0 ? point.close : null;
    }
  }

  return null;
}

/**
 * Converts a local-currency close to the shared numéraire on a given date.
 *
 * Passed in rather than resolved here so this service stays pure and testable —
 * and because the rate lookup is asynchronous and DB-backed, which a scoring
 * loop must not be doing per bar. Callers precompute the handful of factors the
 * shared cutoff dates need; see `SignalsService.buildRsFxFactors`.
 */
export type FxFactorLookup = (currency: string, date: string) => number;

const IDENTITY_FX: FxFactorLookup = () => {
  return 1;
};

/**
 * Cross-sectional ranking across the whole universe at a point in time.
 *
 * Every other indicator in this engine is *absolute* and single-symbol: RSI,
 * MACD, Bollinger and the composite score all answer "how does this stock
 * compare with its own past?". None of them can answer "how does this stock
 * compare with every other stock right now?", which is the question a
 * relative-strength rank exists to answer, and the one Minervini's criterion 8
 * and O'Neil's RS Rating both depend on.
 *
 * Look-ahead is the whole risk here. A cross-sectional rank computed from the
 * full series and then applied to a historical date silently encodes the future,
 * and the resulting backtest is worthless in a way that looks perfectly healthy.
 * Hence `asOf` on every entry point, and a regression test asserting that
 * appending future bars does not change a past ranking.
 */
@Injectable()
export class CrossSectionalService {
  /**
   * Relative-strength ranks for the universe as of a given date.
   *
   * Weighting follows IBD's published approach — the most recent quarter counts
   * double the others — so the rank responds to a stock turning up without being
   * whipsawed by a single strong month.
   *
   * Every symbol is measured over the SAME calendar windows, anchored to one
   * reference date for the whole universe: `asOf` when the caller pins it, else
   * the newest bar date anywhere in the universe. Anchoring per symbol instead
   * would let a name whose data is a few days behind be scored over a shifted
   * window — a difference in bookkeeping masquerading as a difference in
   * strength, which is exactly the contamination a percentile must not carry.
   *
   * Names with too little history are excluded rather than given a low rank: a
   * newly listed stock is *unranked*, not *weak*, and conflating the two would
   * quietly bias the screen against recent IPOs.
   */
  public rank({
    asOf,
    currencyBySymbol,
    fxFactor = IDENTITY_FX,
    seriesBySymbol
  }: {
    asOf?: Date;
    /** Quote currency per symbol. Omit to compare raw local-currency returns. */
    currencyBySymbol?: { [symbol: string]: string };
    fxFactor?: FxFactorLookup;
    seriesBySymbol: { [symbol: string]: DatedClose[] };
  }): RelativeStrength[] {
    const cutoff = asOf ? asOf.toISOString().slice(0, 10) : null;

    const visibleBySymbol = new Map<string, DatedClose[]>();
    let referenceDate = cutoff;

    for (const [symbol, series] of Object.entries(seriesBySymbol)) {
      // Point-in-time: never look at a bar dated after `asOf`.
      const visible = cutoff
        ? series.filter(({ date }) => date <= cutoff)
        : series;

      if (visible.length < MIN_BARS_FOR_RANK) {
        continue;
      }

      visibleBySymbol.set(symbol, visible);

      const newest = visible[visible.length - 1].date;

      if (!referenceDate || newest > referenceDate) {
        referenceDate = newest;
      }
    }

    const scored: Omit<RelativeStrength, 'rsRank'>[] = [];

    for (const [symbol, visible] of visibleBySymbol) {
      const currency = currencyBySymbol?.[symbol];
      const inNumeraire = (close: number, date: string) => {
        return currency ? close * fxFactor(currency, date) : close;
      };

      const return3m = this.periodReturn(
        visible,
        PERIOD_MONTHS.month3,
        referenceDate,
        inNumeraire
      );
      const return6m = this.periodReturn(
        visible,
        PERIOD_MONTHS.month6,
        referenceDate,
        inNumeraire
      );
      const return9m = this.periodReturn(
        visible,
        PERIOD_MONTHS.month9,
        referenceDate,
        inNumeraire
      );
      const return12m = this.periodReturn(
        visible,
        PERIOD_MONTHS.month12,
        referenceDate,
        inNumeraire
      );

      if (
        return3m === null ||
        return6m === null ||
        return9m === null ||
        return12m === null
      ) {
        continue;
      }

      scored.push({
        momentum12m2: this.momentum12m2(visible, referenceDate),
        return12m,
        return3m,
        return6m,
        return9m,
        rsScore:
          SIGNAL_RS_WEIGHTS.return3m * return3m +
          SIGNAL_RS_WEIGHTS.return6m * return6m +
          SIGNAL_RS_WEIGHTS.return9m * return9m +
          SIGNAL_RS_WEIGHTS.return12m * return12m,
        symbol
      });
    }

    if (scored.length < SIGNAL_RS_MIN_UNIVERSE) {
      // Percentiles over a handful of names are arithmetic theatre. Return the
      // scores with a null-equivalent rank rather than pretend to a percentile.
      return scored
        .sort((a, b) => b.rsScore - a.rsScore)
        .map((entry) => ({ ...entry, rsRank: null }));
    }

    const ascending = [...scored].sort((a, b) => a.rsScore - b.rsScore);
    const rankBySymbol = new Map<string, number>();

    ascending.forEach((entry, index) => {
      // Percentile in 1-99, matching how IBD and TradingView report RS. Ties are
      // rare with float returns, so a simple index-based percentile is honest.
      const percentile = Math.round(
        1 + (index / Math.max(1, ascending.length - 1)) * 98
      );

      rankBySymbol.set(entry.symbol, percentile);
    });

    return scored
      .map((entry) => ({ ...entry, rsRank: rankBySymbol.get(entry.symbol) }))
      .sort((a, b) => b.rsRank - a.rsRank);
  }

  /**
   * The date `rank` would anchor every window to for these same inputs — what a
   * caller publishes alongside the ranks so a reader knows which session the
   * percentile actually describes.
   */
  public referenceDateFor({
    asOf,
    seriesBySymbol
  }: {
    asOf?: Date;
    seriesBySymbol: { [symbol: string]: DatedClose[] };
  }): string | null {
    if (asOf) {
      return asOf.toISOString().slice(0, 10);
    }

    let newest: string | null = null;

    for (const series of Object.values(seriesBySymbol)) {
      if (series.length < MIN_BARS_FOR_RANK) {
        continue;
      }

      const last = series[series.length - 1].date;

      if (!newest || last > newest) {
        newest = last;
      }
    }

    return newest;
  }

  /** Convenience lookup: `{ [symbol]: rsRank }` for the screen's criterion 8. */
  public rankMap(params: {
    asOf?: Date;
    currencyBySymbol?: { [symbol: string]: string };
    fxFactor?: FxFactorLookup;
    seriesBySymbol: { [symbol: string]: DatedClose[] };
  }): { [symbol: string]: number } {
    const map: { [symbol: string]: number } = {};

    for (const entry of this.rank(params)) {
      if (entry.rsRank !== null) {
        map[entry.symbol] = entry.rsRank;
      }
    }

    return map;
  }

  /**
   * Where each symbol ranks INSIDE its peer group, and where that group ranks
   * against the other groups.
   *
   * This is the filter the engine has been missing. `rankMap` answers "how
   * strong is this stock against everything?" — IBD's *L* in CAN SLIM asks a
   * second question, "and is its industry group leading?", on the doctrine that
   * roughly half a winner's move belongs to its group. A stock ranked 3rd of 21
   * in a leading group is a different proposition from the same RS in a group
   * nobody wants, and until now the screen could not tell them apart.
   *
   * Groups are scored on the MEDIAN member rsRank rather than the mean, so one
   * runaway constituent cannot carry an otherwise weak sector. Groups with
   * fewer than `minGroupSize` ranked members are returned with a null
   * groupPercentile — too thin to rank is not the same as bottom-ranked, the
   * same distinction `rank` already draws for a newly listed stock.
   */
  public peerRankMap({
    groupBySymbol,
    minGroupSize = 3,
    rankBySymbol
  }: {
    /** Peer group per symbol, e.g. from `peerGroupFor`. Null = ungrouped. */
    groupBySymbol: { [symbol: string]: string | null };
    minGroupSize?: number;
    /** Output of `rankMap`. */
    rankBySymbol: { [symbol: string]: number };
  }): {
    [symbol: string]: {
      group: string;
      groupPercentile: number | null;
      groupSize: number;
      rankInGroup: number;
    };
  } {
    const members = new Map<string, { rsRank: number; symbol: string }[]>();

    for (const [symbol, rsRank] of Object.entries(rankBySymbol)) {
      const group = groupBySymbol[symbol];

      if (!group) {
        continue;
      }

      if (!members.has(group)) {
        members.set(group, []);
      }

      members.get(group).push({ rsRank, symbol });
    }

    // Median member rank per group, then rank the groups against each other.
    const groupScores: { group: string; score: number }[] = [];

    for (const [group, list] of members) {
      if (list.length < minGroupSize) {
        continue;
      }

      const sorted = list.map(({ rsRank }) => rsRank).sort((a, b) => a - b);

      groupScores.push({
        group,
        score: sorted[Math.floor(sorted.length / 2)]
      });
    }

    groupScores.sort((a, b) => a.score - b.score);

    const groupPercentile = new Map<string, number>();

    groupScores.forEach(({ group }, index) => {
      // 1-99, matching the convention rsRank already uses.
      groupPercentile.set(
        group,
        groupScores.length > 1
          ? Math.max(
              1,
              Math.min(
                99,
                Math.round((index / (groupScores.length - 1)) * 98) + 1
              )
            )
          : 50
      );
    });

    const result: {
      [symbol: string]: {
        group: string;
        groupPercentile: number | null;
        groupSize: number;
        rankInGroup: number;
      };
    } = {};

    for (const [group, list] of members) {
      const ordered = [...list].sort((a, b) => b.rsRank - a.rsRank);

      ordered.forEach(({ symbol }, index) => {
        result[symbol] = {
          group,
          groupPercentile: groupPercentile.has(group)
            ? groupPercentile.get(group)
            : null,
          groupSize: ordered.length,
          rankInGroup: index + 1
        };
      });
    }

    return result;
  }

  /**
   * 12-month return excluding the most recent month.
   *
   * The skipped month is not a rounding detail: short-horizon returns
   * mean-revert, so raw 12-month momentum systematically buys names that are
   * about to give back a recent spike. Dropping the last month is the standard
   * academic correction (Jegadeesh-Titman, and Gray & Vogel's *Quantitative
   * Momentum* build on it).
   *
   * Reported alongside the IBD-style `rsScore` rather than folded into it: the
   * two conventions disagree by design, and collapsing them would hide which
   * one a given number follows.
   */
  public momentum12m2(
    series: DatedClose[],
    referenceDate?: string
  ): number | null {
    const anchor = referenceDate ?? series[series.length - 1]?.date;

    if (!anchor) {
      return null;
    }

    const end = closeAsOf(series, monthsBefore(anchor, PERIOD_MONTHS.month1));
    const start = closeAsOf(
      series,
      monthsBefore(anchor, PERIOD_MONTHS.month12)
    );

    if (start === null || end === null) {
      return null;
    }

    return end / start - 1;
  }

  /**
   * Trailing return over whole CALENDAR months, not a fixed number of bars.
   *
   * Counting array positions assumes exactly one row per trading day, and the
   * moment that assumption slips the window moves silently. Duplicated rows
   * shortened every lookback here — 527 of 866 symbols carried ~8% surplus
   * rows, putting "63 bars back" anywhere inside a 33-day range — and differing
   * market holiday calendars shift it between exchanges even on clean data.
   * Anchoring to dates makes the window mean the same thing for every name,
   * which is the minimum a cross-sectional percentile requires, and matches how
   * IBD and MSCI define their momentum windows.
   *
   * `inNumeraire` converts both ends into one currency before they are divided.
   * The universe spans ten quote currencies, and a raw local-currency return
   * ranks a name partly on what its currency did — a 20% gain in a currency
   * that fell 10% is not the same 20% as one in a currency that held. The rate
   * is taken at each window boundary rather than at the bar that anchors it;
   * those differ by at most a few days, which is noise against a 3-to-12-month
   * return.
   */
  private periodReturn(
    series: DatedClose[],
    months: number,
    referenceDate: string,
    inNumeraire: (close: number, date: string) => number
  ): number | null {
    const startCutoff = monthsBefore(referenceDate, months);
    const end = closeAsOf(series, referenceDate);
    const start = closeAsOf(series, startCutoff);

    if (start === null || end === null) {
      return null;
    }

    const endValue = inNumeraire(end, referenceDate);
    const startValue = inNumeraire(start, startCutoff);

    if (!(startValue > 0) || !(endValue > 0)) {
      return null;
    }

    return endValue / startValue - 1;
  }
}
