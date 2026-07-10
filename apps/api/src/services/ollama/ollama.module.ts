import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { OllamaService } from '@ghostfolio/api/services/ollama/ollama.service';

import { Module } from '@nestjs/common';

@Module({
  exports: [OllamaService],
  imports: [ConfigurationModule],
  providers: [OllamaService]
})
export class OllamaModule {}
