import {
  EVALUATE_TRADING_SIGNALS_PROCESS_JOB_NAME,
  EVALUATE_TRADING_SIGNALS_PROCESS_JOB_OPTIONS,
  FUND_SIGNALS_PROCESS_JOB_NAME,
  FUND_SIGNALS_PROCESS_JOB_OPTIONS,
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
}
