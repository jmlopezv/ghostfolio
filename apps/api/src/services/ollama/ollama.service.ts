import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';

import { Injectable, Logger } from '@nestjs/common';
import { format } from 'date-fns';

export type TelegramIntentAction =
  | 'add_trade'
  | 'add_watchlist'
  | 'get_balance'
  | 'holding_duration'
  | 'set_cash'
  | 'set_fund_nav'
  | 'unknown';

export interface TelegramIntent {
  action: TelegramIntentAction;
  amount?: number;
  clarify?: string;
  currency?: string;
  date?: string;
  price?: number;
  quantity?: number;
  symbol?: string;
  type?: 'BUY' | 'SELL';
}

/**
 * Local LLM (Gemma 4 via Ollama) intent extraction. Turns a single natural
 * language portfolio command into a strictly-typed JSON intent. Never throws and
 * never guesses: on any ambiguity or failure it returns action 'unknown' so the
 * caller can ask the user to rephrase.
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  // JSON schema passed to Ollama's structured-output `format` parameter.
  private static readonly INTENT_SCHEMA = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'add_trade',
          'add_watchlist',
          'get_balance',
          'holding_duration',
          'set_cash',
          'set_fund_nav',
          'unknown'
        ]
      },
      amount: { type: 'number' },
      clarify: { type: 'string' },
      currency: { type: 'string' },
      date: { type: 'string' },
      price: { type: 'number' },
      quantity: { type: 'number' },
      symbol: { type: 'string' },
      type: { type: 'string', enum: ['BUY', 'SELL'] }
    },
    required: ['action']
  };

  public constructor(
    private readonly configurationService: ConfigurationService
  ) {}

  public isConfigured(): boolean {
    return !!this.configurationService.get('OLLAMA_API_URL');
  }

  /**
   * Extracts a structured intent from a free-text message.
   *
   * @param knownSymbols The user's owned + watchlist tickers, used to bias the
   * model so e.g. "Apple" reliably maps to "AAPL".
   */
  public async extractIntent(
    text: string,
    knownSymbols: string[] = []
  ): Promise<TelegramIntent> {
    const apiUrl = this.configurationService.get('OLLAMA_API_URL');
    const model = this.configurationService.get('OLLAMA_MODEL');

    const today = format(new Date(), 'yyyy-MM-dd');
    const symbolHint =
      knownSymbols.length > 0
        ? `Known tickers (prefer these): ${knownSymbols.join(', ')}.`
        : '';

    const systemPrompt = [
      'You convert ONE portfolio command into JSON that matches the provided schema.',
      'Extract ONLY what is explicitly stated. NEVER invent or assume quantities, prices, dates, or ticker symbols.',
      'Map company names to their ticker (e.g. Apple -> AAPL, Nvidia -> NVDA).',
      'Actions:',
      '- add_trade: the user bought or sold a stock. Requires type (BUY/SELL), symbol, quantity, price.',
      '- add_watchlist: the user wants to add/watch/follow a stock. Requires symbol only.',
      '- get_balance: the user asks how much cash / balance is available.',
      '- holding_duration: the user asks how long they have held / owned a stock. Requires symbol only.',
      '- set_cash: the user wants to set/reset their available cash to an absolute amount (use field "amount").',
      '- set_fund_nav: the user wants to update a fund\'s NAV/price. Put the fund name in "symbol" and the new price in "price".',
      'You NEVER do arithmetic or compute durations, counts, or amounts — you only classify the action and extract the ticker.',
      'If anything required is missing or ambiguous, set action="unknown" and put what is missing in "clarify".',
      `If currency is not stated, omit it (it defaults to ${DEFAULT_CURRENCY}). If date is not stated, omit it (defaults to today, ${today}).`,
      symbolHint
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await fetch(`${apiUrl}/api/chat`, {
        body: JSON.stringify({
          format: OllamaService.INTENT_SCHEMA,
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: text, role: 'user' }
          ],
          model,
          // Do NOT set think:false — it can silently break `format` on Gemma 4.
          options: { temperature: 0 },
          stream: false
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });

      if (!response.ok) {
        this.logger.error(
          `Ollama request failed with status ${response.status}`
        );

        return { action: 'unknown', clarify: 'the assistant is unavailable' };
      }

      const payload = await response.json();
      const content: string = payload?.message?.content ?? '';

      return this.parseAndValidate(content);
    } catch (error) {
      this.logger.error(error);

      return { action: 'unknown', clarify: 'the assistant is unavailable' };
    }
  }

  private parseAndValidate(content: string): TelegramIntent {
    let parsed: TelegramIntent;

    try {
      parsed = JSON.parse(content);
    } catch {
      return { action: 'unknown', clarify: 'could not understand the message' };
    }

    const validActions: TelegramIntentAction[] = [
      'add_trade',
      'add_watchlist',
      'get_balance',
      'holding_duration',
      'set_cash',
      'set_fund_nav',
      'unknown'
    ];

    if (!parsed || !validActions.includes(parsed.action)) {
      return { action: 'unknown' };
    }

    if (parsed.action === 'set_fund_nav') {
      const hasPrice = typeof parsed.price === 'number' && parsed.price > 0;
      const hasSymbol = typeof parsed.symbol === 'string' && !!parsed.symbol;

      if (!hasPrice || !hasSymbol) {
        return {
          action: 'unknown',
          clarify: parsed.clarify ?? 'the fund name and the new NAV'
        };
      }
    }

    if (
      parsed.action === 'add_watchlist' ||
      parsed.action === 'holding_duration'
    ) {
      if (typeof parsed.symbol !== 'string' || !parsed.symbol) {
        return {
          action: 'unknown',
          clarify: parsed.clarify ?? 'which stock'
        };
      }

      parsed.symbol = parsed.symbol.toUpperCase();
    }

    if (parsed.action === 'add_trade') {
      const hasValidType = parsed.type === 'BUY' || parsed.type === 'SELL';
      const hasValidQuantity =
        typeof parsed.quantity === 'number' && parsed.quantity > 0;
      const hasValidPrice =
        typeof parsed.price === 'number' && parsed.price >= 0;
      const hasSymbol = typeof parsed.symbol === 'string' && !!parsed.symbol;

      if (!hasValidType || !hasValidQuantity || !hasValidPrice || !hasSymbol) {
        return {
          action: 'unknown',
          clarify:
            parsed.clarify ?? 'the trade type, symbol, quantity, or price'
        };
      }

      parsed.symbol = parsed.symbol.toUpperCase();
    }

    if (parsed.action === 'set_cash') {
      if (typeof parsed.amount !== 'number' || parsed.amount < 0) {
        return { action: 'unknown', clarify: parsed.clarify ?? 'the amount' };
      }
    }

    return parsed;
  }

  /**
   * Optional plain-language interpretation of an ALREADY-COMPUTED strategies
   * message. Gemma only paraphrases — it must not output any number or do any
   * math. Returns null on any failure so the caller can omit the note and still
   * deliver the deterministic strategies.
   */
  public async interpretStrategies(
    deterministicText: string
  ): Promise<string | null> {
    const apiUrl = this.configurationService.get('OLLAMA_API_URL');
    const model = this.configurationService.get('OLLAMA_MODEL');

    const systemPrompt = [
      'You are given investment strategies that were ALREADY computed by code.',
      'Do NOT perform any arithmetic and do NOT output, repeat, or invent any number, price, share count, or amount.',
      'In 2-3 short plain-language sentences, explain which option suits a cautious investor versus an aggressive one this month.',
      'Be concise and neutral. This is not financial advice.'
    ].join('\n');

    try {
      const response = await fetch(`${apiUrl}/api/chat`, {
        body: JSON.stringify({
          messages: [
            { content: systemPrompt, role: 'system' },
            { content: deterministicText, role: 'user' }
          ],
          model,
          options: { temperature: 0.3 },
          stream: false
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const content: string = (payload?.message?.content ?? '').trim();

      // Guardrail: drop empty or runaway responses.
      if (!content || content.length > 600) {
        return content ? content.slice(0, 600) : null;
      }

      return content;
    } catch (error) {
      this.logger.warn(`interpretStrategies failed: ${error}`);

      return null;
    }
  }
}
