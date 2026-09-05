import { DateQuery } from '@ghostfolio/api/app/portfolio/interfaces/date-query.interface';
import { DataGatheringItem } from '@ghostfolio/api/services/interfaces/interfaces';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { UpdateMarketDataDto } from '@ghostfolio/common/dtos';
import { resetHours } from '@ghostfolio/common/helper';
import { AssetProfileIdentifier } from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';
import {
  DataSource,
  MarketData,
  MarketDataState,
  Prisma
} from '@prisma/client';
import { groupBy } from 'lodash';

/**
 * Filters `(dataSource, symbol)` pairs with one `IN` list per data source
 * instead of one `OR` branch per pair.
 *
 * The two forms select exactly the same rows — grouping the pairs by their
 * data source and OR-ing the groups is the same predicate, just factored — but
 * Postgres plans them very differently. The watchlist passes 930 pairs, and as
 * 930 OR branches (~1,861 bind parameters) the planner abandons the index:
 * measured 42.8s against 4.3s for this form, both returning a byte-identical
 * 404,345 rows.
 *
 * The returned shape is structural so it serves any model keyed by
 * `(dataSource, symbol)` — `MarketData` and `OhlcBar` both.
 */
export function identifierFilter(
  assetProfileIdentifiers: AssetProfileIdentifier[]
): { dataSource: DataSource; symbol: { in: string[] } }[] {
  return Object.entries(
    groupBy(assetProfileIdentifiers, ({ dataSource }) => {
      return dataSource;
    })
  ).map(([dataSource, identifiers]) => {
    return {
      dataSource: dataSource as DataSource,
      symbol: {
        in: identifiers.map(({ symbol }) => {
          return symbol;
        })
      }
    };
  });
}

@Injectable()
export class MarketDataService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async deleteMany({ dataSource, symbol }: AssetProfileIdentifier) {
    return this.prismaService.marketData.deleteMany({
      where: {
        dataSource,
        symbol
      }
    });
  }

  public async get({
    dataSource,
    date = new Date(),
    symbol
  }: DataGatheringItem): Promise<MarketData> {
    return await this.prismaService.marketData.findFirst({
      where: {
        dataSource,
        symbol,
        date: resetHours(date)
      }
    });
  }

  /**
   * Market data for a symbol on a date, falling back to the most recent row
   * at or before it.
   *
   * `get` above matches the date exactly, which is right when the caller
   * needs to know whether a specific day was recorded. It is wrong for
   * valuing something on a date that may not be a trading day: FX pairs have
   * no row on New Year's Day or Good Friday, so an activity dated 2026-01-01
   * made `toCurrencyAtDate` compute `1 / undefined` and return undefined.
   * Carrying the last known price forward is the standard convention for a
   * non-trading day, and is what `getExchangeRatesByCurrency` already does
   * for the chart path.
   */
  public async getAsOf({
    dataSource,
    date = new Date(),
    symbol
  }: DataGatheringItem): Promise<MarketData> {
    return this.prismaService.marketData.findFirst({
      orderBy: {
        date: 'desc'
      },
      where: {
        dataSource,
        symbol,
        date: {
          lte: resetHours(date)
        }
      }
    });
  }

  /**
   * The symbol's highest recorded close, and the day it was FIRST reached.
   *
   * The date tiebreak is not cosmetic. MarketData forward-fills weekends and
   * holidays, so a Friday high is copied onto the Saturday and Sunday rows and
   * the maximum is genuinely tied across several dates — 105 symbols have such
   * a tie. Without an explicit second key the winner was whatever the plan
   * happened to return, which reported all-time highs as occurring on days the
   * market was shut. Earliest wins: that is the day the price was actually hit.
   */
  public async getMax({ dataSource, symbol }: AssetProfileIdentifier) {
    return this.prismaService.marketData.findFirst({
      select: {
        date: true,
        marketPrice: true
      },
      orderBy: [
        {
          marketPrice: 'desc'
        },
        {
          date: 'asc'
        }
      ],
      where: {
        dataSource,
        symbol
      }
    });
  }

  public async getRange({
    assetProfileIdentifiers,
    dateQuery,
    skip,
    take
  }: {
    assetProfileIdentifiers: AssetProfileIdentifier[];
    dateQuery: DateQuery;
    skip?: number;
    take?: number;
  }): Promise<MarketData[]> {
    return this.prismaService.marketData.findMany({
      skip,
      take,
      orderBy: [
        {
          date: 'asc'
        },
        {
          symbol: 'asc'
        }
      ],
      where: {
        date: dateQuery,
        OR: identifierFilter(assetProfileIdentifiers)
      }
    });
  }

  /**
   * `getRange` restricted to the three columns a close-price series needs.
   *
   * The signals engine builds `DatedClose` objects from 400k+ rows per
   * watchlist snapshot, and hydrating full `MarketData` models for those (with
   * `createdAt`, `state`, …) costs both time and heap for fields nobody reads.
   * Selecting only what is used takes the same query from 3.2s to 1.4s and
   * roughly halves the allocation.
   *
   * Kept separate from `getRange` rather than adding a `select` parameter to
   * it: `getRange` has nine callers that expect a full `MarketData[]`.
   *
   * Settled closes only. `getQuotes` writes today's live price back as an
   * INTRADAY row while a market is open, so an unfiltered series ended on a
   * partial tick for whichever exchanges happened to be trading and on
   * yesterday's close for the rest — measured at one point, 303 of 859 symbols
   * on one side of that line and 556 on the other. Every window built from this
   * series (SMA, RSI, MACD, sigma, trailing returns) is then comparing symbols
   * as of different moments, which is precisely what a cross-sectional read must
   * not do. The current price is not lost: every caller that needs it takes
   * `livePrice` from the quote directly, alongside this series.
   */
  public async getDatedCloses({
    assetProfileIdentifiers,
    dateQuery,
    states = [MarketDataState.CLOSE]
  }: {
    assetProfileIdentifiers: AssetProfileIdentifier[];
    dateQuery: DateQuery;
    /**
     * Which rows count. Defaults to settled closes; pass every state when the
     * caller needs the series exactly as stored, including today's live tick.
     */
    states?: MarketDataState[];
  }): Promise<Pick<MarketData, 'date' | 'marketPrice' | 'symbol'>[]> {
    return this.prismaService.marketData.findMany({
      orderBy: [
        {
          date: 'asc'
        },
        {
          symbol: 'asc'
        }
      ],
      select: {
        date: true,
        marketPrice: true,
        symbol: true
      },
      where: {
        date: dateQuery,
        state: { in: states },
        OR: identifierFilter(assetProfileIdentifiers)
      }
    });
  }

  /**
   * All-time high per symbol — price AND the day it happened — in ONE query.
   *
   * `getMax` answers this for a single symbol, and the watchlist called it once
   * per symbol: 932 queries, each measured at 843ms because Postgres serves it
   * by scanning the global `MarketData_marketPrice_idx` BACKWARD across all
   * 1.3M rows looking for the first row of that symbol. That is ~786 seconds of
   * database work to build one page, and it holds the connection pool the whole
   * time, which is why the rest of the app stalled alongside it.
   *
   * `DISTINCT ON` gives the same rows in one pass — measured 3.3s for the whole
   * table, with prices identical to `getMax` for all 932 watchlist symbols. Both
   * paths share the `date ASC` tiebreak, without which a tied maximum resolved
   * differently in each (see `getMax`).
   *
   * Filtering by data source and symbol separately rather than by exact pairs is
   * deliberate: a pair-wise `OR` is the 930-branch planner cliff `identifierFilter`
   * exists to avoid. Over-fetching a symbol that exists under two sources is
   * harmless — the result is keyed on the pair, so callers still read only what
   * they asked for.
   */
  public async getMaxBySymbols(
    assetProfileIdentifiers: AssetProfileIdentifier[]
  ): Promise<Map<string, { date: Date; marketPrice: number }>> {
    const byKey = new Map<string, { date: Date; marketPrice: number }>();

    if (assetProfileIdentifiers.length === 0) {
      return byKey;
    }

    const dataSources = [
      ...new Set(
        assetProfileIdentifiers.map(({ dataSource }) => {
          return dataSource as string;
        })
      )
    ];
    const symbols = [
      ...new Set(
        assetProfileIdentifiers.map(({ symbol }) => {
          return symbol;
        })
      )
    ];

    const rows = await this.prismaService.$queryRaw<
      { dataSource: string; date: Date; marketPrice: number; symbol: string }[]
    >`
      SELECT DISTINCT ON ("dataSource", "symbol")
        "dataSource"::text AS "dataSource", "symbol", "date", "marketPrice"
      FROM "MarketData"
      WHERE "dataSource"::text IN (${Prisma.join(dataSources)})
        AND "symbol" IN (${Prisma.join(symbols)})
      ORDER BY "dataSource", "symbol", "marketPrice" DESC, "date" ASC
    `;

    for (const row of rows) {
      byKey.set(`${row.dataSource}:${row.symbol}`, {
        date: row.date,
        marketPrice: row.marketPrice
      });
    }

    return byKey;
  }

  public async getRangeCount({
    assetProfileIdentifiers,
    dateQuery
  }: {
    assetProfileIdentifiers: AssetProfileIdentifier[];
    dateQuery: DateQuery;
  }): Promise<number> {
    return this.prismaService.marketData.count({
      where: {
        date: dateQuery,
        OR: identifierFilter(assetProfileIdentifiers)
      }
    });
  }

  public async marketDataItems(params: {
    select?: Prisma.MarketDataSelectScalar;
    skip?: number;
    take?: number;
    cursor?: Prisma.MarketDataWhereUniqueInput;
    where?: Prisma.MarketDataWhereInput;
    orderBy?: Prisma.MarketDataOrderByWithRelationInput;
  }): Promise<MarketData[]> {
    const { select, skip, take, cursor, where, orderBy } = params;

    return this.prismaService.marketData.findMany({
      select,
      cursor,
      orderBy,
      skip,
      take,
      where
    });
  }

  /**
   * Atomically replace market data for a symbol within a date range.
   * Deletes existing data in the range and inserts new data within a single
   * transaction to prevent data loss if the operation fails.
   */
  public async replaceForSymbol({
    data,
    dataSource,
    symbol
  }: AssetProfileIdentifier & { data: Prisma.MarketDataUpdateInput[] }) {
    await this.prismaService.$transaction(async (prisma) => {
      if (data.length > 0) {
        let minTime = Infinity;
        let maxTime = -Infinity;

        for (const { date } of data) {
          const time = (date as Date).getTime();

          if (time < minTime) {
            minTime = time;
          }

          if (time > maxTime) {
            maxTime = time;
          }
        }

        const minDate = new Date(minTime);
        const maxDate = new Date(maxTime);

        await prisma.marketData.deleteMany({
          where: {
            dataSource,
            symbol,
            date: {
              gte: minDate,
              lte: maxDate
            }
          }
        });

        await prisma.marketData.createMany({
          data: data.map(({ date, marketPrice, state }) => ({
            dataSource,
            symbol,
            date: date as Date,
            marketPrice: marketPrice as number,
            state: state as MarketDataState
          })),
          skipDuplicates: true
        });
      }
    });
  }

  public async updateAssetProfileIdentifier(
    oldAssetProfileIdentifier: AssetProfileIdentifier,
    newAssetProfileIdentifier: AssetProfileIdentifier
  ) {
    return this.prismaService.marketData.updateMany({
      data: {
        dataSource: newAssetProfileIdentifier.dataSource,
        symbol: newAssetProfileIdentifier.symbol
      },
      where: {
        dataSource: oldAssetProfileIdentifier.dataSource,
        symbol: oldAssetProfileIdentifier.symbol
      }
    });
  }

  public async updateMarketData(params: {
    data: {
      state: MarketDataState;
    } & UpdateMarketDataDto;
    where: Prisma.MarketDataWhereUniqueInput;
  }): Promise<MarketData> {
    const { data, where } = params;

    return this.prismaService.marketData.upsert({
      where,
      create: {
        dataSource: where.dataSource_date_symbol.dataSource,
        date: where.dataSource_date_symbol.date,
        marketPrice: data.marketPrice,
        state: data.state,
        symbol: where.dataSource_date_symbol.symbol
      },
      update: { marketPrice: data.marketPrice, state: data.state }
    });
  }

  /**
   * Upsert market data by imitating missing upsertMany functionality
   * with $transaction
   */
  public async updateMany({
    data
  }: {
    data: Prisma.MarketDataUpdateInput[];
  }): Promise<MarketData[]> {
    const upsertPromises = data.map(
      ({ dataSource, date, marketPrice, symbol, state }) => {
        return this.prismaService.marketData.upsert({
          create: {
            dataSource: dataSource as DataSource,
            date: date as Date,
            marketPrice: marketPrice as number,
            state: state as MarketDataState,
            symbol: symbol as string
          },
          update: {
            marketPrice: marketPrice as number,
            state: state as MarketDataState
          },
          where: {
            dataSource_date_symbol: {
              dataSource: dataSource as DataSource,
              date: date as Date,
              symbol: symbol as string
            }
          }
        });
      }
    );

    return this.prismaService.$transaction(upsertPromises);
  }
}
