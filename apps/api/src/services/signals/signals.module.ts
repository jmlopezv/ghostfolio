import { AccountModule } from '@ghostfolio/api/app/account/account.module';
import { ActivitiesModule } from '@ghostfolio/api/app/activities/activities.module';
import { WatchlistModule } from '@ghostfolio/api/app/endpoints/watchlist/watchlist.module';
import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { ExchangeRateDataModule } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.module';
import { BacktestService } from '@ghostfolio/api/services/signals/backtest.service';
import { ForecastService } from '@ghostfolio/api/services/signals/forecast.service';
import { FundamentalsService } from '@ghostfolio/api/services/signals/fundamentals.service';
import { FundDataService } from '@ghostfolio/api/services/signals/fund-data.service';
import { FundHistoryService } from '@ghostfolio/api/services/signals/fund-history.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import { MarketRegimeService } from '@ghostfolio/api/services/signals/market-regime.service';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';
import { MarketDataModule } from '@ghostfolio/api/services/market-data/market-data.module';
import { NewsSentimentModule } from '@ghostfolio/api/services/news-sentiment/news-sentiment.module';
import { OhlcService } from '@ghostfolio/api/services/signals/ohlc.service';
import { OllamaModule } from '@ghostfolio/api/services/ollama/ollama.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { SignalsService } from '@ghostfolio/api/services/signals/signals.service';
import { StrategiesService } from '@ghostfolio/api/services/signals/strategies.service';
import { TelegramBotModule } from '@ghostfolio/api/services/telegram-bot/telegram-bot.module';

import { Module } from '@nestjs/common';

@Module({
  exports: [
    BacktestService,
    ForecastService,
    FundHistoryService,
    IndicatorsService,
    SignalsService
  ],
  imports: [
    AccountModule,
    ActivitiesModule,
    DataProviderModule,
    ExchangeRateDataModule,
    MarketDataModule,
    NewsSentimentModule,
    OllamaModule,
    PrismaModule,
    PropertyModule,
    RedisCacheModule,
    TelegramBotModule,
    WatchlistModule
  ],
  providers: [
    BacktestService,
    ForecastService,
    FundamentalsService,
    FundDataService,
    FundHistoryService,
    IndicatorsService,
    MarketRegimeService,
    OhlcService,
    SignalsService,
    StrategiesService
  ]
})
export class SignalsModule {}
