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

/** Trading days per period — the series is daily bars, not calendar days. */
const PERIOD_DAYS = {
  month1: 21,
  month3: 63,
  month6: 126,
  month9: 189,
  month12: 252
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
   * Names with too little history are excluded rather than given a low rank: a
   * newly listed stock is *unranked*, not *weak*, and conflating the two would
   * quietly bias the screen against recent IPOs.
   */
  public rank({
    asOf,
    seriesBySymbol
  }: {
    asOf?: Date;
    seriesBySymbol: { [symbol: string]: DatedClose[] };
  }): RelativeStrength[] {
    const cutoff = asOf ? asOf.toISOString().slice(0, 10) : null;

    const scored: Omit<RelativeStrength, 'rsRank'>[] = [];

    for (const [symbol, series] of Object.entries(seriesBySymbol)) {
      // Point-in-time: never look at a bar dated after `asOf`.
      const visible = cutoff
        ? series.filter(({ date }) => date <= cutoff)
        : series;

      if (visible.length < PERIOD_DAYS.month12 + 1) {
        continue;
      }

      const closes = visible.map(({ close }) => close);

      const return3m = this.periodReturn(closes, PERIOD_DAYS.month3);
      const return6m = this.periodReturn(closes, PERIOD_DAYS.month6);
      const return9m = this.periodReturn(closes, PERIOD_DAYS.month9);
      const return12m = this.periodReturn(closes, PERIOD_DAYS.month12);

      if (
        return3m === null ||
        return6m === null ||
        return9m === null ||
        return12m === null
      ) {
        continue;
      }

      scored.push({
        momentum12m2: this.momentum12m2(closes),
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

  /** Convenience lookup: `{ [symbol]: rsRank }` for the screen's criterion 8. */
  public rankMap(params: {
    asOf?: Date;
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
   */
  public momentum12m2(closes: number[]): number | null {
    if (closes.length < PERIOD_DAYS.month12 + 1) {
      return null;
    }

    const end = closes[closes.length - 1 - PERIOD_DAYS.month1];
    const start = closes[closes.length - 1 - PERIOD_DAYS.month12];

    if (!(start > 0) || !(end > 0)) {
      return null;
    }

    return end / start - 1;
  }

  private periodReturn(closes: number[], days: number): number | null {
    if (closes.length < days + 1) {
      return null;
    }

    const start = closes[closes.length - 1 - days];
    const end = closes[closes.length - 1];

    if (!(start > 0) || !(end > 0)) {
      return null;
    }

    return end / start - 1;
  }
}
