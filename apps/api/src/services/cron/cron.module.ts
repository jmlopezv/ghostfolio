import { UserModule } from '@ghostfolio/api/app/user/user.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { ExchangeRateDataModule } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';
import { DataGatheringQueueModule } from '@ghostfolio/api/services/queues/data-gathering/data-gathering.module';
import { StatisticsGatheringQueueModule } from '@ghostfolio/api/services/queues/statistics-gathering/statistics-gathering.module';
import { TradingSignalsQueueModule } from '@ghostfolio/api/services/queues/trading-signals/trading-signals.module';
import { TwitterBotModule } from '@ghostfolio/api/services/twitter-bot/twitter-bot.module';

import { Module } from '@nestjs/common';

import { CronService } from './cron.service';

@Module({
  imports: [
    ConfigurationModule,
    DataGatheringQueueModule,
    ExchangeRateDataModule,
    PropertyModule,
    StatisticsGatheringQueueModule,
    TradingSignalsQueueModule,
    TwitterBotModule,
    UserModule
  ],
  providers: [CronService]
})
export class CronModule {}
