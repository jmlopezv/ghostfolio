import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  public constructor(
    private readonly configurationService: ConfigurationService
  ) {}

  public isConfigured() {
    return (
      !!this.configurationService.get('TELEGRAM_BOT_TOKEN') &&
      !!this.configurationService.get('TELEGRAM_CHAT_ID')
    );
  }

  public getToken(): string {
    return this.configurationService.get('TELEGRAM_BOT_TOKEN');
  }

  public getChatId(): string {
    return this.configurationService.get('TELEGRAM_CHAT_ID');
  }

  /**
   * Sends a message with an inline keyboard. `buttons` is a single row of
   * { text, callbackData } pairs. Never throws.
   */
  public async sendMessageWithButtons(
    text: string,
    buttons: { callbackData: string; text: string }[]
  ): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Telegram is not configured - skipping message with buttons'
      );

      return;
    }

    const token = this.configurationService.get('TELEGRAM_BOT_TOKEN');
    const chatId = this.configurationService.get('TELEGRAM_CHAT_ID');

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          body: JSON.stringify({
            chat_id: chatId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                buttons.map(({ callbackData, text: buttonText }) => {
                  return { callback_data: callbackData, text: buttonText };
                })
              ]
            },
            text
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );

      if (!response.ok) {
        const body = await response.text();

        this.logger.error(
          `Telegram sendMessageWithButtons failed with status ${response.status}: ${body}`
        );
      }
    } catch (error) {
      this.logger.error(error);
    }
  }

  /** Acknowledges a tapped inline button so Telegram stops the loading spinner. */
  public async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const token = this.configurationService.get('TELEGRAM_BOT_TOKEN');

    try {
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        body: JSON.stringify({ callback_query_id: callbackQueryId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
    } catch (error) {
      this.logger.error(error);
    }
  }

  /**
   * Sends a message to the configured Telegram chat. Never throws: a failure to
   * notify must not break the surrounding cron / queue processing.
   *
   * `parseMode` defaults to Telegram's legacy 'Markdown', which every existing
   * caller is written against. Pass 'HTML' for messages carrying links: legacy
   * Markdown mis-parses an underscore inside a URL, and TradingView writes
   * Nordic share classes with one (`ASSA-B.ST` -> `OMXSTO-ASSA_B`), so inline
   * links would break on exactly the Nordic names. HTML also needs only
   * `& < >` escaped rather than Markdown's much larger reserved set.
   */
  public async sendMessage(
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'Markdown'
  ): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing) - skipping notification'
      );

      return;
    }

    const token = this.configurationService.get('TELEGRAM_BOT_TOKEN');
    const chatId = this.configurationService.get('TELEGRAM_CHAT_ID');
    const payload = JSON.stringify({
      chat_id: chatId,
      disable_web_page_preview: true,
      parse_mode: parseMode,
      text
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            body: payload,
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );

        if (response.ok) {
          return;
        }

        // Telegram rate-limits at 1 msg/sec per chat (HTTP 429). Wait for the
        // retry_after hint (or 2 s default) then try again.
        if (response.status === 429 && attempt < 3) {
          const body = (await response.json().catch(() => ({}))) as {
            parameters?: { retry_after?: number };
          };
          const retryAfter = body?.parameters?.retry_after ?? 2;

          this.logger.warn(
            `Telegram rate-limited (attempt ${attempt}/3), retrying in ${retryAfter}s`
          );

          await new Promise((resolve) =>
            setTimeout(resolve, retryAfter * 1000)
          );

          continue;
        }

        const errorBody = await response.text();

        this.logger.error(
          `Telegram notification failed with status ${response.status}: ${errorBody}`
        );

        return;
      } catch (error) {
        // A network-level throw (ECONNRESET / ENOTFOUND / connect timeout) is
        // exactly the case worth retrying, and until now it was the one case
        // that was not: this caught and returned, so the loop only ever
        // retried HTTP 429. A two-second blip on a home connection therefore
        // cost the whole message, silently, with nothing but a log line.
        if (attempt < 3) {
          this.logger.warn(
            `Telegram send failed (attempt ${attempt}/3), retrying: ${
              error?.message ?? error
            }`
          );

          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));

          continue;
        }

        this.logger.error(
          `Telegram send failed after 3 attempts: ${error?.message ?? error}`
        );

        return;
      }
    }
  }
}
