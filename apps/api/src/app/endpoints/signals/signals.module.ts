import { SignalsModule } from '@ghostfolio/api/services/signals/signals.module';

import { Module } from '@nestjs/common';

import { SignalsController } from './signals.controller';

@Module({
  controllers: [SignalsController],
  imports: [SignalsModule]
})
export class SignalsEndpointModule {}
