import { TradingSignalsProcessor } from '@ghostfolio/api/services/queues/trading-signals/trading-signals.processor';
import { TradingSignalsService } from '@ghostfolio/api/services/queues/trading-signals/trading-signals.service';
import { SignalsModule } from '@ghostfolio/api/services/signals/signals.module';
import { TRADING_SIGNALS_QUEUE } from '@ghostfolio/common/config';

import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import ms from 'ms';

@Module({
  exports: [BullModule, TradingSignalsService],
  imports: [
    BullBoardModule.forFeature({
      adapter: BullAdapter,
      name: TRADING_SIGNALS_QUEUE,
      options: {
        displayName: 'Trading Signals',
        readOnlyMode: process.env.BULL_BOARD_IS_READ_ONLY !== 'false'
      }
    }),
    BullModule.registerQueue({
      limiter: {
        duration: ms('1 second'),
        max: 1
      },
      name: TRADING_SIGNALS_QUEUE
    }),
    SignalsModule
  ],
  providers: [TradingSignalsProcessor, TradingSignalsService]
})
export class TradingSignalsQueueModule {}
