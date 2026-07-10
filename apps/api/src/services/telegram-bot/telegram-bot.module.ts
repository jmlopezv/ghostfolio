import { AccountBalanceModule } from '@ghostfolio/api/app/account-balance/account-balance.module';
import { AccountModule } from '@ghostfolio/api/app/account/account.module';
import { ActivitiesModule } from '@ghostfolio/api/app/activities/activities.module';
import { WatchlistModule } from '@ghostfolio/api/app/endpoints/watchlist/watchlist.module';
import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { OllamaModule } from '@ghostfolio/api/services/ollama/ollama.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { TelegramAssistantService } from '@ghostfolio/api/services/telegram-bot/telegram-assistant.service';
import { TelegramBotService } from '@ghostfolio/api/services/telegram-bot/telegram-bot.service';
import { TelegramListenerService } from '@ghostfolio/api/services/telegram-bot/telegram-listener.service';

import { Module } from '@nestjs/common';

@Module({
  exports: [TelegramBotService],
  imports: [
    AccountBalanceModule,
    AccountModule,
    ActivitiesModule,
    ConfigurationModule,
    OllamaModule,
    PrismaModule,
    RedisCacheModule,
    WatchlistModule
  ],
  providers: [
    TelegramAssistantService,
    TelegramBotService,
    TelegramListenerService
  ]
})
export class TelegramBotModule {}
