import {
  EVALUATE_TRADING_SIGNALS_PROCESS_JOB_NAME,
  EVALUATE_TRADING_SIGNALS_PROCESS_JOB_OPTIONS,
  FUND_SIGNALS_PROCESS_JOB_NAME,
  FUND_SIGNALS_PROCESS_JOB_OPTIONS,
  INTRADAY_TRAILING_CHECK_PROCESS_JOB_NAME,
  LEADER_SCREEN_PROCESS_JOB_NAME,
  LEADER_SCREEN_PROCESS_JOB_OPTIONS,
  OHLC_REFRESH_PROCESS_JOB_NAME,
  OHLC_REFRESH_PROCESS_JOB_OPTIONS,
  SHORTLIST_PROCESS_JOB_NAME,
  SHORTLIST_PROCESS_JOB_OPTIONS,
  TT8_ENTRANTS_PROCESS_JOB_NAME,
  TT8_ENTRANTS_PROCESS_JOB_OPTIONS,
  INTRADAY_TRAILING_CHECK_PROCESS_JOB_OPTIONS,
  PORTFOLIO_REPORT_PROCESS_JOB_NAME,
  PORTFOLIO_REPORT_PROCESS_JOB_OPTIONS,
  TRADING_SIGNALS_QUEUE
} from '@ghostfolio/common/config';

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bull';
import { format } from 'date-fns';

@Injectable()
export class TradingSignalsService {
  public constructor(
    @InjectQueue(TRADING_SIGNALS_QUEUE)
    private readonly tradingSignalsQueue: Queue
  ) {}

  public async addEvaluationToQueue() {
    return this.tradingSignalsQueue.add(
      EVALUATE_TRADING_SIGNALS_PROCESS_JOB_NAME,
      {},
      {
        ...EVALUATE_TRADING_SIGNALS_PROCESS_JOB_OPTIONS,
        // De-duplicate overlapping runs within the same 30-minute bucket.
        jobId: `evaluate-${format(new Date(), 'yyyyMMddHHmm')}`
      }
    );
  }

  public async addReportToQueue() {
    return this.tradingSignalsQueue.add(
      PORTFOLIO_REPORT_PROCESS_JOB_NAME,
      {},
      {
        ...PORTFOLIO_REPORT_PROCESS_JOB_OPTIONS,
        // Delay by 5 minutes so the report never fires at the same time as the
        // 30-minute evaluation job (every 4 hours both crons align). Without
        // this the two processors run concurrently and Telegram's 1 msg/sec
        // per-chat limit silently drops whichever message hits second.
        delay: 5 * 60 * 1000,
        // De-duplicate overlapping runs within the same hour bucket.
        jobId: `report-${format(new Date(), 'yyyyMMddHH')}`
      }
    );
  }

  public async addFundSignalToQueue() {
    return this.tradingSignalsQueue.add(
      FUND_SIGNALS_PROCESS_JOB_NAME,
      {},
      {
        ...FUND_SIGNALS_PROCESS_JOB_OPTIONS,
        // De-duplicate within the same day bucket (weekly cadence).
        jobId: `fund-signals-${format(new Date(), 'yyyyMMdd')}`
      }
    );
  }

  public async addLeaderScreenToQueue() {
    return this.tradingSignalsQueue.add(
      LEADER_SCREEN_PROCESS_JOB_NAME,
      {},
      {
        ...LEADER_SCREEN_PROCESS_JOB_OPTIONS,
        // Offset from the evaluation and report jobs so three Telegram
        // messages never race the 1 msg/sec per-chat limit.
        delay: 10 * 60 * 1000,
        // De-duplicate within the same day bucket (daily cadence).
        jobId: `leader-screen-${format(new Date(), 'yyyyMMdd')}`
      }
    );
  }

  public async addTrendTemplateEntrantsToQueue() {
    return this.tradingSignalsQueue.add(
      TT8_ENTRANTS_PROCESS_JOB_NAME,
      {},
      {
        ...TT8_ENTRANTS_PROCESS_JOB_OPTIONS,
        // De-duplicate within the same day bucket (daily cadence).
        jobId: `tt8-entrants-${format(new Date(), 'yyyyMMdd')}`
      }
    );
  }

  public async addOhlcRefreshToQueue() {
    return this.tradingSignalsQueue.add(
      OHLC_REFRESH_PROCESS_JOB_NAME,
      {},
      {
        ...OHLC_REFRESH_PROCESS_JOB_OPTIONS,
        // One gather per day. The boot catch-up and the cron can both enqueue
        // the same day's job; a shared id makes the second a no-op rather than
        // a second pass over the whole universe.
        jobId: `ohlc-refresh-${format(new Date(), 'yyyyMMdd')}`
      }
    );
  }

  public async addShortlistToQueue() {
    return this.tradingSignalsQueue.add(
      SHORTLIST_PROCESS_JOB_NAME,
      {},
      {
        ...SHORTLIST_PROCESS_JOB_OPTIONS,
        // Offset so the digest never races the entrant alert for the 1 msg/sec
        // per-chat limit on the two days a month they both fire.
        delay: 5 * 60 * 1000,
        jobId: `shortlist-${format(new Date(), 'yyyyMMdd')}`
      }
    );
  }

  public async addIntradayTrailingCheckToQueue() {
    return this.tradingSignalsQueue.add(
      INTRADAY_TRAILING_CHECK_PROCESS_JOB_NAME,
      {},
      {
        ...INTRADAY_TRAILING_CHECK_PROCESS_JOB_OPTIONS,
        // De-duplicate overlapping runs within the same 5-minute bucket.
        jobId: `intraday-trailing-${format(new Date(), 'yyyyMMddHHmm')}`
      }
    );
  }
}
