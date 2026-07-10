import { RedisCacheModule } from '@ghostfolio/api/app/redis-cache/redis-cache.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { NewsSentimentService } from '@ghostfolio/api/services/news-sentiment/news-sentiment.service';

import { Module } from '@nestjs/common';

@Module({
  exports: [NewsSentimentService],
  imports: [ConfigurationModule, RedisCacheModule],
  providers: [NewsSentimentService]
})
export class NewsSentimentModule {}
