import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { SIGNAL_OHLC_REFRESH_RANGES } from '@ghostfolio/common/config';
import { AssetProfileIdentifier } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';
import { DataSource, Prisma } from '@prisma/client';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A single daily bar. Deliberately a plain shape rather than the Prisma row so
 * the indicator layer never has to know where bars came from — the same struct
 * is produced by a live Yahoo fetch (`OhlcService`) and by a stored backfill.
 */
export interface Bar {
  close: number;
  date: string; // YYYY-MM-DD
  high: number;
  low: number;
  open: number;
  volume: number;
}

/**
 * Persistence for full daily OHLCV bars.
 *
 * Why this exists: `MarketData` stores `marketPrice` only, so every one of its
 * ~628k rows is close-only. That makes ATR, VCP, volume dry-up, breakout
 * confirmation and Darvas boxes computable for *today* (via a live fetch) but
 * impossible to *backtest*. This table is what makes those rules testable over
 * history, which is the precondition for trusting any of them.
 *
 * `MarketData` is left strictly alone — see the `OhlcBar` model comment for why
 * OHLCV could not simply be extra columns there.
 */
/**
 * How far back to ask Yahoo for one symbol, given the newest bar already stored.
 *
 * Pure so the nightly gather's only real decision is testable without a network
 * or a database. Calendar days, not trading days: the gap only decides how much
 * slack to request, and over-requesting is free — `upsertMany` skips duplicates
 * — while under-requesting silently leaves a hole.
 *
 * Measured in UTC on both sides. Bar dates are stored at UTC midnight and
 * `getLatestDates` slices the ISO string, so comparing them against a LOCAL
 * calendar day (what date-fns `differenceInCalendarDays` does) shifts the gap by
 * one for every timezone east of UTC — which silently downgraded a same-day
 * gather to the next range up.
 *
 * A symbol with no stored bars, or one far enough behind that history is
 * genuinely missing rather than merely stale, gets the full range.
 */
export function refreshRangeFor({
  latestDate,
  now
}: {
  latestDate: string | undefined;
  now: Date;
}): '1mo' | '3mo' | '5y' {
  if (!latestDate) {
    return SIGNAL_OHLC_REFRESH_RANGES.full.range;
  }

  const gapDays = Math.round(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.parse(`${latestDate}T00:00:00.000Z`)) /
      MILLISECONDS_PER_DAY
  );

  // A stored bar dated in the future is not a small gap, it is bad data; asking
  // for the full range is the only response that can repair it.
  if (gapDays < 0) {
    return SIGNAL_OHLC_REFRESH_RANGES.full.range;
  }

  if (gapDays <= SIGNAL_OHLC_REFRESH_RANGES.short.maxGapDays) {
    return SIGNAL_OHLC_REFRESH_RANGES.short.range;
  }

  if (gapDays <= SIGNAL_OHLC_REFRESH_RANGES.medium.maxGapDays) {
    return SIGNAL_OHLC_REFRESH_RANGES.medium.range;
  }

  return SIGNAL_OHLC_REFRESH_RANGES.full.range;
}

@Injectable()
export class OhlcBarService {
  public constructor(private readonly prismaService: PrismaService) {}

  /**
   * Idempotent bulk insert. Uses `skipDuplicates` against the
   * `(dataSource, date, symbol)` unique index so a backfill can be re-run or
   * resumed after a crash without deleting anything first.
   *
   * Returns the number of rows actually written, which is what lets the
   * backfill distinguish "already had it" from "nothing came back".
   */
  public async upsertMany({
    bars,
    dataSource,
    symbol
  }: {
    bars: Bar[];
    dataSource: DataSource;
    symbol: string;
  }): Promise<number> {
    if (bars.length === 0) {
      return 0;
    }

    const data: Prisma.OhlcBarCreateManyInput[] = bars.map((bar) => {
      return {
        close: bar.close,
        dataSource,
        date: new Date(`${bar.date}T00:00:00.000Z`),
        high: bar.high,
        low: bar.low,
        open: bar.open,
        symbol,
        volume: bar.volume
      };
    });

    const { count } = await this.prismaService.ohlcBar.createMany({
      data,
      skipDuplicates: true
    });

    return count;
  }

  /** Ordered bars for one symbol. Oldest first, so indicator windows can slice from the end. */
  public async getBars({
    dataSource,
    from,
    symbol,
    to
  }: {
    dataSource: DataSource;
    from?: Date;
    symbol: string;
    to?: Date;
  }): Promise<Bar[]> {
    const rows = await this.prismaService.ohlcBar.findMany({
      orderBy: { date: 'asc' },
      where: {
        dataSource,
        symbol,
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {})
              }
            }
          : {})
      }
    });

    return rows.map((row) => {
      return {
        close: row.close,
        date: row.date.toISOString().slice(0, 10),
        high: row.high,
        low: row.low,
        open: row.open,
        volume: row.volume
      };
    });
  }

  /**
   * Bars for many symbols in one query, keyed by symbol.
   *
   * Mirrors the shape of `SignalsService.getHistory` (`{ [symbol]: … }`) on
   * purpose: the cross-sectional ranking layer composes the two, and having
   * them disagree about their return shape would be a needless friction.
   */
  public async getBarsForSymbols({
    assetProfileIdentifiers,
    from,
    to
  }: {
    assetProfileIdentifiers: AssetProfileIdentifier[];
    from?: Date;
    to?: Date;
  }): Promise<{ [symbol: string]: Bar[] }> {
    if (assetProfileIdentifiers.length === 0) {
      return {};
    }

    const rows = await this.prismaService.ohlcBar.findMany({
      orderBy: { date: 'asc' },
      where: {
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {})
              }
            }
          : {}),
        OR: assetProfileIdentifiers.map(({ dataSource, symbol }) => {
          return { dataSource, symbol };
        })
      }
    });

    const bySymbol: { [symbol: string]: Bar[] } = {};

    // findMany returned date-ascending, so pushing preserves the order.
    for (const row of rows) {
      (bySymbol[row.symbol] ??= []).push({
        close: row.close,
        date: row.date.toISOString().slice(0, 10),
        high: row.high,
        low: row.low,
        open: row.open,
        volume: row.volume
      });
    }

    return bySymbol;
  }

  /**
   * Most recent stored bar date per symbol — what an incremental gather needs
   * to know so it only asks Yahoo for the gap rather than the whole history.
   */
  public async getLatestDates(
    dataSource: DataSource
  ): Promise<{ [symbol: string]: string }> {
    const rows = await this.prismaService.ohlcBar.groupBy({
      _max: { date: true },
      by: ['symbol'],
      where: { dataSource }
    });

    const bySymbol: { [symbol: string]: string } = {};

    for (const row of rows) {
      if (row._max.date) {
        bySymbol[row.symbol] = row._max.date.toISOString().slice(0, 10);
      }
    }

    return bySymbol;
  }

  /** Row counts per symbol — used by the backfill to report coverage honestly. */
  public async getCoverage(
    dataSource: DataSource
  ): Promise<{ [symbol: string]: number }> {
    const rows = await this.prismaService.ohlcBar.groupBy({
      _count: { _all: true },
      by: ['symbol'],
      where: { dataSource }
    });

    const bySymbol: { [symbol: string]: number } = {};

    for (const row of rows) {
      bySymbol[row.symbol] = row._count._all;
    }

    return bySymbol;
  }
}
