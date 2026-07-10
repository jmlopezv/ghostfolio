import { MarketDataModule } from '@ghostfolio/api/services/market-data/market-data.module';
import { NewsSentimentModule } from '@ghostfolio/api/services/news-sentiment/news-sentiment.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { SignalsModule } from '@ghostfolio/api/services/signals/signals.module';
import { SymbolProfileModule } from '@ghostfolio/api/services/symbol-profile/symbol-profile.module';

import { Module } from '@nestjs/common';

import { AcademyController } from './academy.controller';
import { AcademyService } from './academy.service';

@Module({
  controllers: [AcademyController],
  imports: [
    MarketDataModule,
    NewsSentimentModule,
    PrismaModule,
    SignalsModule,
    SymbolProfileModule
  ],
  providers: [AcademyService]
})
export class AcademyModule {}
