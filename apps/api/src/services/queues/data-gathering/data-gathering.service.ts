import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { DataEnhancerInterface } from '@ghostfolio/api/services/data-provider/interfaces/data-enhancer.interface';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { DataGatheringItem } from '@ghostfolio/api/services/interfaces/interfaces';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import {
  DATA_GATHERING_QUEUE,
  DATA_GATHERING_QUEUE_PRIORITY_HIGH,
  DATA_GATHERING_QUEUE_PRIORITY_LOW,
  DATA_GATHERING_QUEUE_PRIORITY_MEDIUM,
  GATHER_HISTORICAL_MARKET_DATA_PROCESS_JOB_NAME,
  GATHER_HISTORICAL_MARKET_DATA_PROCESS_JOB_OPTIONS,
  PROPERTY_BENCHMARKS
} from '@ghostfolio/common/config';
import {
  DATE_FORMAT,
  getAssetProfileIdentifier,
  resetHours
} from '@ghostfolio/common/helper';
import {
  AssetProfileIdentifier,
  BenchmarkProperty
} from '@ghostfolio/common/interfaces';

import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from '@prisma/client';
import { JobOptions, Queue } from 'bull';
import {
  addDays,
  differenceInCalendarDays,
  format,
  max,
  min,
  subDays,
  subMilliseconds,
  subYears
} from 'date-fns';
import { isEmpty } from 'lodash';
import ms, { StringValue } from 'ms';

// How far back to look when deciding whether a symbol's recent market data
// is genuinely complete, or has a hole hiding behind a single fresh day
// (e.g. after a multi-week outage). Wide enough to cover a long vacation.
const GAP_CHECK_LOOKBACK_DAYS = 45;
// A symbol's most recent CLOSE may be this many calendar days old and still
// count as "fresh" (tolerates weekends plus a holiday Monday/Friday).
const RECENT_CLOSE_TOLERANCE_DAYS = 4;
// A gap larger than this between two consecutive stored CLOSE dates is
// treated as missing data, not just an ordinary weekend/holiday break.
const MAX_ALLOWED_GAP_DAYS = 5;

@Injectable()
export class DataGatheringService {
  private readonly logger = new Logger(DataGatheringService.name);

  public constructor(
    @Inject('DataEnhancers')
    private readonly dataEnhancers: DataEnhancerInterface[],
    @InjectQueue(DATA_GATHERING_QUEUE)
    private readonly dataGatheringQueue: Queue,
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly prismaService: PrismaService,
    private readonly propertyService: PropertyService,
    private readonly symbolProfileService: SymbolProfileService
  ) {}

  public async addJobToQueue({
    data,
    name,
    opts
  }: {
    data: any;
    name: string;
    opts?: JobOptions;
  }) {
    return this.dataGatheringQueue.add(name, data, opts);
  }

  public async addJobsToQueue(
    jobs: { data: any; name: string; opts?: JobOptions }[]
  ) {
    return this.dataGatheringQueue.addBulk(jobs);
  }

  public async gather7Days() {
    await this.gatherSymbols({
      dataGatheringItems: await this.getCurrencies7D(),
      priority: DATA_GATHERING_QUEUE_PRIORITY_HIGH
    });

    await this.gatherSymbols({
      dataGatheringItems: await this.getSymbols7D({
        withUserSubscription: true
      }),
      priority: DATA_GATHERING_QUEUE_PRIORITY_MEDIUM
    });

    await this.gatherSymbols({
      dataGatheringItems: await this.getSymbols7D({
        withUserSubscription: false
      }),
      priority: DATA_GATHERING_QUEUE_PRIORITY_LOW
    });
  }

  public async gatherMax() {
    const dataGatheringItems = await this.getSymbolsMax();
    await this.gatherSymbols({
      dataGatheringItems,
      priority: DATA_GATHERING_QUEUE_PRIORITY_LOW
    });
  }

  public async gatherSymbol({ dataSource, date, symbol }: DataGatheringItem) {
    const dataGatheringItems = (await this.getSymbolsMax())
      .filter((dataGatheringItem) => {
        return (
          dataGatheringItem.dataSource === dataSource &&
          dataGatheringItem.symbol === symbol
        );
      })
      .map((item) => ({
        ...item,
        date: date ?? item.date
      }));

    await this.gatherSymbols({
      dataGatheringItems,
      force: true,
      priority: DATA_GATHERING_QUEUE_PRIORITY_HIGH
    });
  }

  public async gatherSymbolForDate({
    dataSource,
    date,
    symbol
  }: {
    dataSource: DataSource;
    date: Date;
    symbol: string;
  }) {
    try {
      const historicalData = await this.dataProviderService.getHistoricalRaw({
        assetProfileIdentifiers: [{ dataSource, symbol }],
        from: date,
        to: date
      });

      const marketPrice =
        historicalData[symbol][format(date, DATE_FORMAT)].marketPrice;

      if (marketPrice) {
        return await this.prismaService.marketData.upsert({
          create: {
            dataSource,
            date,
            marketPrice,
            symbol
          },
          update: { marketPrice },
          where: { dataSource_date_symbol: { dataSource, date, symbol } }
        });
      }
    } catch (error) {
      this.logger.error(error);
    } finally {
      return undefined;
    }
  }

  public async gatherAssetProfiles(
    aAssetProfileIdentifiers?: AssetProfileIdentifier[]
  ) {
    let assetProfileIdentifiers = aAssetProfileIdentifiers?.filter(
      (dataGatheringItem) => {
        return dataGatheringItem.dataSource !== 'MANUAL';
      }
    );

    if (!assetProfileIdentifiers) {
      assetProfileIdentifiers = await this.getActiveAssetProfileIdentifiers();
    }

    if (assetProfileIdentifiers.length <= 0) {
      return;
    }

    const assetProfiles = await this.dataProviderService.getAssetProfiles(
      assetProfileIdentifiers
    );
    const symbolProfiles = await this.symbolProfileService.getSymbolProfiles(
      assetProfileIdentifiers
    );

    for (const [symbol, assetProfile] of Object.entries(assetProfiles)) {
      const symbolProfile = symbolProfiles.find(
        ({ symbol: symbolProfileSymbol }) => {
          return symbolProfileSymbol === symbol;
        }
      );

      const symbolMapping = symbolProfile?.symbolMapping;

      let enhancedAssetProfile = symbolProfile
        ? {
            ...assetProfile,
            assetClass: symbolProfile.assetClass ?? assetProfile.assetClass,
            assetSubClass:
              symbolProfile.assetSubClass ?? assetProfile.assetSubClass
          }
        : assetProfile;

      for (const dataEnhancer of this.dataEnhancers) {
        try {
          enhancedAssetProfile = await dataEnhancer.enhance({
            response: enhancedAssetProfile,
            symbol: symbolMapping?.[dataEnhancer.getName()] ?? symbol
          });
        } catch (error) {
          this.logger.error(
            `Failed to enhance data for ${symbol} (${
              assetProfile.dataSource
            }) by ${dataEnhancer.getName()}`,
            error
          );
        }
      }

      const { assetClass, assetSubClass } = assetProfile;

      const {
        countries,
        currency,
        cusip,
        dataSource,
        figi,
        figiComposite,
        figiShareClass,
        holdings,
        isin,
        name,
        sectors,
        url
      } = enhancedAssetProfile;

      try {
        await this.prismaService.symbolProfile.upsert({
          create: {
            assetClass,
            assetSubClass,
            countries,
            currency,
            cusip,
            dataSource,
            figi,
            figiComposite,
            figiShareClass,
            holdings,
            isin,
            name,
            sectors,
            symbol,
            url
          },
          update: {
            assetClass,
            assetSubClass,
            countries,
            currency,
            cusip,
            figi,
            figiComposite,
            figiShareClass,
            holdings,
            isin,
            name,
            sectors,
            url
          },
          where: {
            dataSource_symbol: {
              dataSource,
              symbol
            }
          }
        });
      } catch (error) {
        this.logger.error(`${symbol}: ${error?.meta?.cause}`, error);

        if (assetProfileIdentifiers.length === 1) {
          throw error;
        }
      }
    }
  }

  public async gatherSymbols({
    dataGatheringItems,
    force = false,
    priority
  }: {
    dataGatheringItems: DataGatheringItem[];
    force?: boolean;
    priority: number;
  }) {
    await this.addJobsToQueue(
      dataGatheringItems.map(({ dataSource, date, symbol }) => {
        return {
          data: {
            dataSource,
            date,
            force,
            symbol
          },
          name: GATHER_HISTORICAL_MARKET_DATA_PROCESS_JOB_NAME,
          opts: {
            ...GATHER_HISTORICAL_MARKET_DATA_PROCESS_JOB_OPTIONS,
            priority,
            jobId: `${getAssetProfileIdentifier({
              dataSource,
              symbol
            })}-${format(date, DATE_FORMAT)}`
          }
        };
      })
    );
  }

  /**
   * Returns active asset profile identifiers
   *
   * @param {StringValue} maxAge - Optional. Specifies the maximum allowed age
   * of a profile’s last update timestamp. Only asset profiles considered stale
   * are returned.
   */
  public async getActiveAssetProfileIdentifiers({
    maxAge
  }: {
    maxAge?: StringValue;
  } = {}): Promise<AssetProfileIdentifier[]> {
    return this.prismaService.symbolProfile.findMany({
      orderBy: [{ symbol: 'asc' }, { dataSource: 'asc' }],
      select: {
        dataSource: true,
        symbol: true
      },
      where: {
        dataSource: {
          notIn: ['MANUAL', 'RAPID_API']
        },
        isActive: true,
        ...(maxAge && {
          updatedAt: {
            lt: subMilliseconds(new Date(), ms(maxAge))
          }
        })
      }
    });
  }

  public async getWatchlistAssetProfileIdentifiers(): Promise<
    AssetProfileIdentifier[]
  > {
    return this.prismaService.symbolProfile.findMany({
      orderBy: [{ symbol: 'asc' }, { dataSource: 'asc' }],
      select: {
        dataSource: true,
        symbol: true
      },
      where: {
        watchedBy: {
          some: {}
        }
      }
    });
  }

  /**
   * A symbol only counts as "complete" (safe to skip gathering) when BOTH:
   * - its most recent CLOSE is fresh (tolerant of weekends/a holiday Monday)
   * - there is no multi-day hole between any two of its recent CLOSE rows
   *
   * Checking freshness alone is what let a single fresh day (written by a
   * live quote fetch's incidental "today" row, or by a prior run that only
   * looked back a fixed number of days) mask a real gap sitting just behind
   * it - e.g. a 2-week vacation gap that a later day's data made invisible
   * to a naive "6+ CLOSE rows in the last 7 days" check.
   */
  private async getAssetProfileIdentifiersWithCompleteMarketData(): Promise<
    AssetProfileIdentifier[]
  > {
    const rows = await this.prismaService.marketData.findMany({
      orderBy: { date: 'asc' },
      select: { dataSource: true, date: true, symbol: true },
      where: {
        date: { gt: subDays(resetHours(new Date()), GAP_CHECK_LOOKBACK_DAYS) },
        state: 'CLOSE'
      }
    });

    const byIdentifier = new Map<
      string,
      { dataSource: DataSource; dates: Date[]; symbol: string }
    >();

    for (const { dataSource, date, symbol } of rows) {
      const key = getAssetProfileIdentifier({ dataSource, symbol });
      const entry = byIdentifier.get(key) ?? { dataSource, dates: [], symbol };
      entry.dates.push(date);
      byIdentifier.set(key, entry);
    }

    const complete: AssetProfileIdentifier[] = [];

    for (const { dataSource, dates, symbol } of byIdentifier.values()) {
      const mostRecentDate = dates[dates.length - 1];

      const isFresh =
        differenceInCalendarDays(resetHours(new Date()), mostRecentDate) <=
        RECENT_CLOSE_TOLERANCE_DAYS;

      if (isFresh && !this.hasGapLargerThan(dates, MAX_ALLOWED_GAP_DAYS)) {
        complete.push({ dataSource, symbol });
      }
    }

    return complete;
  }

  /** `dates` must already be sorted ascending. */
  private hasGapLargerThan(dates: Date[], maxGapDays: number): boolean {
    for (let i = 1; i < dates.length; i++) {
      if (differenceInCalendarDays(dates[i], dates[i - 1]) > maxGapDays) {
        return true;
      }
    }

    return false;
  }

  private async getCurrencies7D(): Promise<DataGatheringItem[]> {
    const assetProfileIdentifiersWithCompleteMarketData =
      await this.getAssetProfileIdentifiersWithCompleteMarketData();

    const lastCloseDateMap = await this.getLastCloseDates();

    return this.exchangeRateDataService
      .getCurrencyPairs()
      .filter(({ dataSource, symbol }) => {
        return !assetProfileIdentifiersWithCompleteMarketData.some((item) => {
          return item.dataSource === dataSource && item.symbol === symbol;
        });
      })
      .map(({ dataSource, symbol }) => {
        return {
          dataSource,
          symbol,
          date: this.getSinceLastCloseDate(
            { dataSource, symbol },
            lastCloseDateMap
          )
        };
      });
  }

  private getEarliestDate(aStartDate: Date) {
    return min([aStartDate, subYears(new Date(), 10)]);
  }

  /**
   * Returns the most recent CLOSE market data date per asset profile, so
   * gap-fill gathering can resume exactly where it left off instead of using
   * a fixed lookback window that cannot recover an outage longer than that
   * window (e.g. a multi-week vacation). Only CLOSE rows count - an
   * INTRADAY row written as a side effect of a live quote fetch must not be
   * mistaken for a real historical close, or the gap behind it would never
   * get backfilled.
   */
  private async getLastCloseDates(): Promise<Map<string, Date>> {
    const rows = await this.prismaService.marketData.groupBy({
      _max: { date: true },
      by: ['dataSource', 'symbol'],
      where: { state: 'CLOSE' }
    });

    const map = new Map<string, Date>();

    for (const { _max, dataSource, symbol } of rows) {
      if (_max.date) {
        map.set(getAssetProfileIdentifier({ dataSource, symbol }), _max.date);
      }
    }

    return map;
  }

  /**
   * Resumes the day after the last stored close (capped at ~1 year back so
   * this lightweight job never requests unbounded history - a truly
   * ancient/never-gathered symbol is handled by gatherMax() instead), but
   * never later than the gap-check lookback window's start. Without that
   * floor, a symbol whose most recent close is fresh (e.g. yesterday) but
   * which has an older internal hole (e.g. a 2-week vacation gap sitting
   * behind that one fresh day) would resume from "yesterday" and never
   * actually re-fetch the days that are missing.
   */
  private getSinceLastCloseDate(
    { dataSource, symbol }: AssetProfileIdentifier,
    lastCloseDateMap: Map<string, Date>
  ) {
    const oneYearAgo = subYears(resetHours(new Date()), 1);
    const gapCheckWindowStart = subDays(
      resetHours(new Date()),
      GAP_CHECK_LOOKBACK_DAYS
    );
    const lastCloseDate = lastCloseDateMap.get(
      getAssetProfileIdentifier({ dataSource, symbol })
    );

    if (!lastCloseDate) {
      return oneYearAgo;
    }

    const sinceLastClose = max([addDays(lastCloseDate, 1), oneYearAgo]);

    return min([sinceLastClose, gapCheckWindowStart]);
  }

  private async getSymbols7D({
    withUserSubscription = false
  }: {
    withUserSubscription?: boolean;
  }): Promise<DataGatheringItem[]> {
    const symbolProfiles =
      await this.symbolProfileService.getActiveSymbolProfilesByUserSubscription(
        {
          withUserSubscription
        }
      );

    const assetProfileIdentifiersWithCompleteMarketData =
      await this.getAssetProfileIdentifiersWithCompleteMarketData();

    const lastCloseDateMap = await this.getLastCloseDates();

    return symbolProfiles
      .filter(({ dataSource, scraperConfiguration, symbol }) => {
        const manualDataSourceWithScraperConfiguration =
          dataSource === 'MANUAL' && !isEmpty(scraperConfiguration);

        return (
          !assetProfileIdentifiersWithCompleteMarketData.some((item) => {
            return item.dataSource === dataSource && item.symbol === symbol;
          }) &&
          (dataSource !== 'MANUAL' || manualDataSourceWithScraperConfiguration)
        );
      })
      .map((symbolProfile) => {
        return {
          ...symbolProfile,
          date: this.getSinceLastCloseDate(symbolProfile, lastCloseDateMap)
        };
      });
  }

  private async getSymbolsMax(): Promise<DataGatheringItem[]> {
    const benchmarkAssetProfileIdMap: { [key: string]: boolean } = {};
    (
      (await this.propertyService.getByKey<BenchmarkProperty[]>(
        PROPERTY_BENCHMARKS
      )) ?? []
    ).forEach(({ symbolProfileId }) => {
      benchmarkAssetProfileIdMap[symbolProfileId] = true;
    });
    const startDate =
      (
        await this.prismaService.order.findFirst({
          orderBy: [{ date: 'asc' }]
        })
      )?.date ?? new Date();

    const currencyPairsToGather = this.exchangeRateDataService
      .getCurrencyPairs()
      .map(({ dataSource, symbol }) => {
        return {
          dataSource,
          symbol,
          date: this.getEarliestDate(startDate)
        };
      });

    const symbolProfilesToGather = (
      await this.prismaService.symbolProfile.findMany({
        orderBy: [{ symbol: 'asc' }],
        select: {
          activities: {
            orderBy: [{ date: 'asc' }],
            select: { date: true },
            take: 1
          },
          dataSource: true,
          id: true,
          scraperConfiguration: true,
          symbol: true
        },
        where: {
          isActive: true
        }
      })
    )
      .filter((symbolProfile) => {
        const manualDataSourceWithScraperConfiguration =
          symbolProfile.dataSource === 'MANUAL' &&
          !isEmpty(symbolProfile.scraperConfiguration);

        return (
          symbolProfile.dataSource !== 'MANUAL' ||
          manualDataSourceWithScraperConfiguration
        );
      })
      .map((symbolProfile) => {
        let date = symbolProfile.activities?.[0]?.date ?? startDate;

        if (benchmarkAssetProfileIdMap[symbolProfile.id]) {
          date = this.getEarliestDate(startDate);
        }

        return {
          ...symbolProfile,
          date
        };
      });

    return [...currencyPairsToGather, ...symbolProfilesToGather];
  }
}
