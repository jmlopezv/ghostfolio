import { UserService } from '@ghostfolio/api/app/user/user.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { DataGatheringService } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.service';
import { StatisticsGatheringService } from '@ghostfolio/api/services/queues/statistics-gathering/statistics-gathering.service';
import { TradingSignalsService } from '@ghostfolio/api/services/queues/trading-signals/trading-signals.service';
import { TwitterBotService } from '@ghostfolio/api/services/twitter-bot/twitter-bot.service';
import {
  DATA_GATHERING_QUEUE_PRIORITY_LOW,
  GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
  GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
  PROPERTY_IS_DATA_GATHERING_ENABLED
} from '@ghostfolio/common/config';
import { getAssetProfileIdentifier } from '@ghostfolio/common/helper';

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isWeekend } from 'date-fns';

@Injectable()
export class CronService implements OnApplicationBootstrap {
  private static readonly EVERY_HOUR_AT_RANDOM_MINUTE = `${new Date().getMinutes()} * * * *`;
  private static readonly EVERY_MONDAY_AT_LUNCH_TIME = '0 12 * * 1';
  private static readonly EVERY_SUNDAY_AT_LUNCH_TIME = '0 12 * * 0';
  // 22:05 CET: both the European (~17:30) and US (22:00) closes have settled,
  // and the gather has 25 minutes to finish before the leader screen reads the
  // bars it writes.
  private static readonly EVERY_WEEKDAY_BEFORE_LEADER_SCREEN = '5 22 * * 1-5';
  // 22:30 CET ≈ 30 min after the 16:00 ET US close, so the daily bar is settled.
  private static readonly EVERY_WEEKDAY_AFTER_US_CLOSE = '30 22 * * 1-5';
  // 07:00 CET, ahead of the 09:00 European open, reading the settled US close.
  private static readonly EVERY_WEEKDAY_BEFORE_EU_OPEN = '0 7 * * 1-5';
  // The 1st and the 15th, same pre-open slot.
  private static readonly TWICE_MONTHLY_BEFORE_EU_OPEN = '0 7 1,15 * *';

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly dataGatheringService: DataGatheringService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly propertyService: PropertyService,
    private readonly statisticsGatheringService: StatisticsGatheringService,
    private readonly tradingSignalsService: TradingSignalsService,
    private readonly twitterBotService: TwitterBotService,
    private readonly userService: UserService
  ) {}

  public async onApplicationBootstrap() {
    // Trigger a gap-fill gather immediately on boot instead of waiting for
    // the next hourly tick - getSymbols7D()/getCurrencies7D() now resume
    // from each symbol's actual last close date, so this heals any gap left
    // by downtime (a long weekend, a stopped container, a vacation) right
    // away and is a cheap no-op for symbols that are already current.
    if (await this.isDataGatheringEnabled()) {
      await this.dataGatheringService.gather7Days();
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  public async runEvery30Minutes() {
    // Skip weekends - markets are closed and prices do not move.
    if (isWeekend(new Date())) {
      return;
    }

    await this.tradingSignalsService.addEvaluationToQueue();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  public async runEvery5Minutes() {
    // Skip weekends - markets are closed and prices do not move. Only real
    // tracked positions past their frozen target are checked here (typically
    // a handful of symbols), not the full watchlist - see
    // SignalTradeTrackingService.checkTrailingPositionsIntraday.
    if (isWeekend(new Date())) {
      return;
    }

    await this.tradingSignalsService.addIntradayTrailingCheckToQueue();
  }

  @Cron(CronExpression.EVERY_4_HOURS)
  public async runEvery4Hours() {
    // Heartbeat portfolio report - skip weekends (markets closed).
    if (isWeekend(new Date())) {
      return;
    }

    await this.tradingSignalsService.addReportToQueue();
  }

  @Cron(CronService.EVERY_WEEKDAY_BEFORE_LEADER_SCREEN)
  public async runEveryWeekdayBeforeLeaderScreen() {
    // Nightly OHLCV gather. Nothing else in the application appends to
    // `OhlcBar`, so without this the Trend Template, the VCP detector, ATR and
    // the RS percentile keep reading whatever day the backfill script last ran.
    if (!isWeekend(new Date())) {
      await this.tradingSignalsService.addOhlcRefreshToQueue();
    }
  }

  @Cron(CronService.EVERY_WEEKDAY_AFTER_US_CLOSE)
  public async runEveryWeekdayAfterUsClose() {
    // Minervini leader screen. After the US close so the day's bar — and the
    // breakout volume that confirms it — is final rather than intraday.
    if (!isWeekend(new Date())) {
      await this.tradingSignalsService.addLeaderScreenToQueue();
    }
  }

  @Cron(CronService.EVERY_WEEKDAY_BEFORE_EU_OPEN)
  public async runEveryWeekdayBeforeEuOpen() {
    // Trend Template entrants: names that crossed into 8/8 at RS >= 90 on the
    // settled US close. Event-driven, so most days this sends nothing.
    if (!isWeekend(new Date())) {
      await this.tradingSignalsService.addTrendTemplateEntrantsToQueue();
    }
  }

  @Cron(CronService.TWICE_MONTHLY_BEFORE_EU_OPEN)
  public async runTwiceMonthlyBeforeEuOpen() {
    await this.tradingSignalsService.addShortlistToQueue();
  }

  @Cron(CronService.EVERY_MONDAY_AT_LUNCH_TIME)
  public async runEveryMondayAtLunch() {
    // Weekly fund recommendation (which funds to buy for monthly accumulation).
    await this.tradingSignalsService.addFundSignalToQueue();
  }

  @Cron(CronExpression.EVERY_HOUR)
  public async runEveryHour() {
    if (this.configurationService.get('ENABLE_FEATURE_STATISTICS')) {
      await this.statisticsGatheringService.addJobsToQueue();
    }
  }

  @Cron(CronService.EVERY_HOUR_AT_RANDOM_MINUTE)
  public async runEveryHourAtRandomMinute() {
    if (await this.isDataGatheringEnabled()) {
      await this.dataGatheringService.gather7Days();
    }
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  public async runEveryTwelveHours() {
    await this.exchangeRateDataService.loadCurrencies();
  }

  @Cron(CronExpression.EVERY_DAY_AT_5PM)
  public async runEveryDayAtFivePm() {
    if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
      this.twitterBotService.tweetFearAndGreedIndex();
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async runEveryDayAtMidnight() {
    if (this.configurationService.get('ENABLE_FEATURE_SUBSCRIPTION')) {
      this.userService.resetAnalytics();
    }
  }

  @Cron(CronService.EVERY_SUNDAY_AT_LUNCH_TIME)
  public async runEverySundayAtTwelvePm() {
    if (await this.isDataGatheringEnabled()) {
      const assetProfileIdentifiers =
        await this.dataGatheringService.getActiveAssetProfileIdentifiers({
          maxAge: '60 days'
        });

      await this.dataGatheringService.addJobsToQueue(
        assetProfileIdentifiers.map(({ dataSource, symbol }) => {
          return {
            data: {
              dataSource,
              symbol
            },
            name: GATHER_ASSET_PROFILE_PROCESS_JOB_NAME,
            opts: {
              ...GATHER_ASSET_PROFILE_PROCESS_JOB_OPTIONS,
              jobId: getAssetProfileIdentifier({ dataSource, symbol }),
              priority: DATA_GATHERING_QUEUE_PRIORITY_LOW
            }
          };
        })
      );
    }
  }

  private async isDataGatheringEnabled() {
    return (await this.propertyService.getByKey(
      PROPERTY_IS_DATA_GATHERING_ENABLED
    )) === false
      ? false
      : true;
  }
}
