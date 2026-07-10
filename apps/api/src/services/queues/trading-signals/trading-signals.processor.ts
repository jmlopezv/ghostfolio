import { SignalsService } from '@ghostfolio/api/services/signals/signals.service';
import {
  EVALUATE_TRADING_SIGNALS_PROCESS_JOB_NAME,
  FUND_SIGNALS_PROCESS_JOB_NAME,
  PORTFOLIO_REPORT_PROCESS_JOB_NAME,
  TRADING_SIGNALS_QUEUE
} from '@ghostfolio/common/config';

import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
@Processor(TRADING_SIGNALS_QUEUE)
export class TradingSignalsProcessor {
  private readonly logger = new Logger(TradingSignalsProcessor.name);

  public constructor(private readonly signalsService: SignalsService) {}

  @Process({ concurrency: 1, name: EVALUATE_TRADING_SIGNALS_PROCESS_JOB_NAME })
  public async evaluateTradingSignals() {
    try {
      this.logger.log('Trading-signals evaluation has been started');

      await this.signalsService.evaluateAllUsers();

      this.logger.log('Trading-signals evaluation has been completed');
    } catch (error) {
      this.logger.error(error);

      throw error;
    }
  }

  @Process({ concurrency: 1, name: PORTFOLIO_REPORT_PROCESS_JOB_NAME })
  public async sendPortfolioReport() {
    try {
      this.logger.log('Portfolio report has been started');

      await this.signalsService.sendReportToAllUsers();

      this.logger.log('Portfolio report has been completed');
    } catch (error) {
      this.logger.error(error);

      throw error;
    }
  }

  @Process({ concurrency: 1, name: FUND_SIGNALS_PROCESS_JOB_NAME })
  public async sendFundSignals() {
    try {
      this.logger.log('Weekly fund recommendation has been started');

      await this.signalsService.sendFundRecommendationsToAllUsers();

      this.logger.log('Weekly fund recommendation has been completed');
    } catch (error) {
      this.logger.error(error);

      throw error;
    }
  }
}
