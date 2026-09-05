import { BenchmarkService } from '@ghostfolio/api/services/benchmark/benchmark.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { DataGatheringService } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import {
  SIGNAL_WATCHLIST_HISTORY_YEARS,
  WATCHLIST_ITEMS_CACHE_TTL
} from '@ghostfolio/common/config';
import { WatchlistResponse } from '@ghostfolio/common/interfaces';

import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, Prisma } from '@prisma/client';
import { subYears } from 'date-fns';

@Injectable()
export class WatchlistService {
  public constructor(
    private readonly benchmarkService: BenchmarkService,
    private readonly dataGatheringService: DataGatheringService,
    private readonly dataProviderService: DataProviderService,
    private readonly marketDataService: MarketDataService,
    private readonly prismaService: PrismaService,
    private readonly symbolProfileService: SymbolProfileService
  ) {}

  public async createWatchlistItem({
    dataSource,
    symbol,
    userId
  }: {
    dataSource: DataSource;
    symbol: string;
    userId: string;
  }): Promise<void> {
    const symbolProfile = await this.prismaService.symbolProfile.findUnique({
      where: {
        dataSource_symbol: { dataSource, symbol }
      }
    });

    if (!symbolProfile) {
      const assetProfiles = await this.dataProviderService.getAssetProfiles([
        { dataSource, symbol }
      ]);

      if (!assetProfiles[symbol]?.currency) {
        throw new BadRequestException(
          `Asset profile not found for ${symbol} (${dataSource})`
        );
      }

      await this.symbolProfileService.add(
        assetProfiles[symbol] as Prisma.SymbolProfileCreateInput
      );
    }

    // Explicit 5-year floor: gatherSymbol otherwise falls back to this
    // symbol's own first activity date (or a global earliest-order date),
    // which for a freshly-watchlisted, not-yet-held symbol can resolve to
    // just a few days ago - too short for SMA200/momentum12M to compute, and
    // too short for longer-horizon charts/indicators generally.
    await this.dataGatheringService.gatherSymbol({
      dataSource,
      symbol,
      date: subYears(new Date(), SIGNAL_WATCHLIST_HISTORY_YEARS)
    });

    await this.prismaService.user.update({
      data: {
        watchlist: {
          connect: {
            dataSource_symbol: { dataSource, symbol }
          }
        }
      },
      where: { id: userId }
    });

    // Adding or removing a symbol must show on the next load, not in five
    // minutes.
    this.itemsCache.delete(userId);
  }

  public async deleteWatchlistItem({
    dataSource,
    symbol,
    userId
  }: {
    dataSource: DataSource;
    symbol: string;
    userId: string;
  }) {
    await this.prismaService.user.update({
      data: {
        watchlist: {
          disconnect: {
            dataSource_symbol: { dataSource, symbol }
          }
        }
      },
      where: { id: userId }
    });

    // Adding or removing a symbol must show on the next load, not in five
    // minutes.
    this.itemsCache.delete(userId);
  }

  /**
   * Assembled watchlist rows, reused for WATCHLIST_ITEMS_CACHE_TTL.
   *
   * Holds the PROMISE rather than the resolved value so concurrent callers join
   * one build instead of each starting their own — the same shape
   * SignalsService.getWatchlistMetrics uses, and for the same reason: the page
   * issues both requests at once, and a cold rebuild is expensive enough that
   * doing it twice is worth preventing.
   */
  private readonly itemsCache = new Map<
    string,
    { expiresAt: number; value: Promise<WatchlistResponse['watchlist']> }
  >();

  public async getWatchlistItems(
    userId: string
  ): Promise<WatchlistResponse['watchlist']> {
    const cached = this.itemsCache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = this.buildWatchlistItems(userId);

    this.itemsCache.set(userId, {
      expiresAt: Date.now() + WATCHLIST_ITEMS_CACHE_TTL,
      value
    });

    // A failure must not be cached; the identity guard keeps a later successful
    // build from being evicted by an older rejection.
    value.catch(() => {
      if (this.itemsCache.get(userId)?.value === value) {
        this.itemsCache.delete(userId);
      }
    });

    return value;
  }

  private async buildWatchlistItems(
    userId: string
  ): Promise<WatchlistResponse['watchlist']> {
    const user = await this.prismaService.user.findUnique({
      select: {
        watchlist: {
          select: { dataSource: true, symbol: true }
        }
      },
      where: { id: userId }
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [assetProfiles, quotes, recentBuyLogs] = await Promise.all([
      this.symbolProfileService.getSymbolProfiles(user.watchlist),
      this.dataProviderService.getQuotes({
        items: user.watchlist.map(({ dataSource, symbol }) => {
          return { dataSource, symbol };
        })
      }),
      // Symbols with a BUY signal logged in the last 30 days → watchlist flag.
      this.prismaService.signalLog.findMany({
        distinct: ['symbol'],
        select: { symbol: true },
        where: {
          userId,
          category: 'BUY',
          createdAt: { gte: thirtyDaysAgo }
        }
      })
    ]);

    const recentBuySymbols = new Set(recentBuyLogs.map(({ symbol }) => symbol));

    // Two bulk reads instead of two per symbol. Previously this method issued
    // 2 x 932 = ~1,864 queries per page open — getMax alone measured 843ms each,
    // roughly 786 SECONDS of database work — and held the Prisma pool for the
    // duration, which is why every other tab stalled while the Watchlist loaded.
    const [allTimeHighs, trendsByKey] = await Promise.all([
      this.marketDataService.getMaxBySymbols(user.watchlist),
      this.benchmarkService.getBenchmarkTrendsForSymbols(user.watchlist)
    ]);

    const profileByKey = new Map(
      assetProfiles.map((profile) => {
        return [`${profile.dataSource}:${profile.symbol}`, profile];
      })
    );

    const watchlist = user.watchlist.map(({ dataSource, symbol }) => {
      const key = `${dataSource}:${symbol}`;
      // find() over ~932 profiles per symbol was quietly O(n^2); the map is
      // built once.
      const assetProfile = profileByKey.get(key);
      const allTimeHigh = allTimeHighs.get(key);
      const trends = trendsByKey.get(key) ?? {
        trend200d: 'UNKNOWN' as const,
        trend50d: 'UNKNOWN' as const
      };

      const performancePercent =
        this.benchmarkService.calculateChangeInPercentage(
          allTimeHigh?.marketPrice,
          quotes[symbol]?.marketPrice
        );

      return {
        dataSource,
        symbol,
        assetSubClass: assetProfile?.assetSubClass,
        currency: assetProfile?.currency,
        hasRecentBuySignal: recentBuySymbols.has(symbol),
        marketCondition:
          this.benchmarkService.getMarketCondition(performancePercent),
        marketPrice: quotes[symbol]?.marketPrice,
        name: assetProfile?.name,
        performances: {
          allTimeHigh: {
            performancePercent,
            date: allTimeHigh?.date
          }
        },
        trend50d: trends.trend50d,
        trend200d: trends.trend200d
      };
    });

    return watchlist.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  }
}
