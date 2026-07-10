import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { TelegramAssistantService } from '@ghostfolio/api/services/telegram-bot/telegram-assistant.service';
import { TelegramBotService } from '@ghostfolio/api/services/telegram-bot/telegram-bot.service';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

/**
 * Receives Telegram updates via long-polling (getUpdates) and dispatches them to
 * the assistant. Opt-in via TELEGRAM_POLLING_ENABLED so it never runs
 * unintentionally (e.g. in a webhook-based production deployment). Only messages
 * from the configured chat id are processed.
 */
@Injectable()
export class TelegramListenerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramListenerService.name);
  private offset = 0;
  private running = false;

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly telegramAssistantService: TelegramAssistantService,
    private readonly telegramBotService: TelegramBotService
  ) {}

  public onApplicationBootstrap() {
    const pollingEnabled = this.configurationService.get(
      'TELEGRAM_POLLING_ENABLED'
    );

    if (!pollingEnabled || !this.telegramBotService.isConfigured()) {
      return;
    }

    this.running = true;
    this.logger.log('Telegram long-polling listener started');

    // Fire-and-forget; the loop owns its own error handling.
    void this.poll();
  }

  private async poll(): Promise<void> {
    const token = this.telegramBotService.getToken();
    const allowedChatId = this.telegramBotService.getChatId();

    while (this.running) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?timeout=30&offset=${this.offset}`,
          { method: 'GET' }
        );

        if (!response.ok) {
          await this.backOff();

          continue;
        }

        const payload = await response.json();

        for (const update of payload?.result ?? []) {
          this.offset = update.update_id + 1;

          try {
            await this.dispatch(update, allowedChatId);
          } catch (error) {
            this.logger.error(error);
          }
        }
      } catch (error) {
        this.logger.error(error);

        await this.backOff();
      }
    }
  }

  private async dispatch(update: any, allowedChatId: string): Promise<void> {
    if (update.callback_query) {
      const chatId = update.callback_query.message?.chat?.id;

      if (!this.isAuthorized(chatId, allowedChatId)) {
        return;
      }

      await this.telegramAssistantService.handleCallback(
        update.callback_query.id,
        update.callback_query.data ?? ''
      );

      return;
    }

    if (update.message?.text) {
      const chatId = update.message.chat?.id;

      if (!this.isAuthorized(chatId, allowedChatId)) {
        return;
      }

      await this.telegramAssistantService.handleMessage(update.message.text);
    }
  }

  private isAuthorized(
    chatId: number | string | undefined,
    allowedChatId: string
  ): boolean {
    return chatId !== undefined && `${chatId}` === `${allowedChatId}`;
  }

  private backOff(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
