import { AccountModule } from '@ghostfolio/api/app/account/account.module';
import { ActivitiesModule } from '@ghostfolio/api/app/activities/activities.module';
import { WatchlistModule } from '@ghostfolio/api/app/endpoints/watchlist/watchlist.module';
import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { ExchangeRateDataModule } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.module';
import { MarketDataModule } from '@ghostfolio/api/services/market-data/market-data.module';
import { NewsSentimentModule } from '@ghostfolio/api/services/news-sentiment/news-sentiment.module';
import { OllamaModule } from '@ghostfolio/api/services/ollama/ollama.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { PropertyModule } from '@ghostfolio/api/services/property/property.module';
import { AssetDetailService } from '@ghostfolio/api/services/signals/asset-detail.service';
import { BacktestService } from '@ghostfolio/api/services/signals/backtest.service';
import { CrossSectionalService } from '@ghostfolio/api/services/signals/cross-sectional.service';
import { ForecastService } from '@ghostfolio/api/services/signals/forecast.service';
import { FundDataService } from '@ghostfolio/api/services/signals/fund-data.service';
import { FundHistoryService } from '@ghostfolio/api/services/signals/fund-history.service';
import { FundamentalsService } from '@ghostfolio/api/services/signals/fundamentals.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import { LeaderScreenService } from '@ghostfolio/api/services/signals/leader-screen.service';
import { MarketBreadthService } from '@ghostfolio/api/services/signals/market-breadth.service';
import { MarketRegimeService } from '@ghostfolio/api/services/signals/market-regime.service';
import { OhlcBarService } from '@ghostfolio/api/services/signals/ohlc-bar.service';
import { OhlcService } from '@ghostfolio/api/services/signals/ohlc.service';
import { ScreeningService } from '@ghostfolio/api/services/signals/screening.service';
import { SignalTradeTrackingService } from '@ghostfolio/api/services/signals/signal-trade-tracking.service';
import { SignalsService } from '@ghostfolio/api/services/signals/signals.service';
import { StrategiesService } from '@ghostfolio/api/services/signals/strategies.service';
import { SymbolProfileModule } from '@ghostfolio/api/services/symbol-profile/symbol-profile.module';
import { TelegramBotModule } from '@ghostfolio/api/services/telegram-bot/telegram-bot.module';

import { Module } from '@nestjs/common';

@Module({
  exports: [
    AssetDetailService,
    BacktestService,
    ForecastService,
    FundHistoryService,
    CrossSectionalService,
    IndicatorsService,
    LeaderScreenService,
    OhlcBarService,
    SignalsService
  ],
  imports: [
    AccountModule,
    ActivitiesModule,
    ConfigurationModule,
    DataProviderModule,
    ExchangeRateDataModule,
    MarketDataModule,
    NewsSentimentModule,
    OllamaModule,
    PrismaModule,
    PropertyModule,
    RedisCacheModule,
    SymbolProfileModule,
    TelegramBotModule,
    WatchlistModule
  ],
  providers: [
    AssetDetailService,
    BacktestService,
    ForecastService,
    FundamentalsService,
    FundDataService,
    FundHistoryService,
    IndicatorsService,
    CrossSectionalService,
    LeaderScreenService,
    MarketBreadthService,
    MarketRegimeService,
    OhlcBarService,
    OhlcService,
    ScreeningService,
    SignalTradeTrackingService,
    SignalsService,
    StrategiesService
  ]
})
export class SignalsModule {}
