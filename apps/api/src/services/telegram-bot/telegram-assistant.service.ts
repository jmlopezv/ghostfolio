import { AccountBalanceService } from '@ghostfolio/api/app/account-balance/account-balance.service';
import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { ActivitiesService } from '@ghostfolio/api/app/activities/activities.service';
import { WatchlistService } from '@ghostfolio/api/app/endpoints/watchlist/watchlist.service';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { OllamaService } from '@ghostfolio/api/services/ollama/ollama.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { TelegramBotService } from '@ghostfolio/api/services/telegram-bot/telegram-bot.service';
import { DEFAULT_CURRENCY } from '@ghostfolio/common/config';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import { UserSettings } from '@ghostfolio/common/interfaces';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Type as ActivityType } from '@prisma/client';
import { format } from 'date-fns';
import { randomUUID } from 'node:crypto';

interface PendingAction {
  accountId: string;
  baseCurrency: string;
  currency: string;
  date: string;
  kind: 'add_trade' | 'add_watchlist' | 'set_cash';
  newCashAmount?: number;
  price?: number;
  quantity?: number;
  symbol?: string;
  type?: 'BUY' | 'SELL';
  userId: string;
}

const PENDING_TTL = 600_000; // 10 minutes

/**
 * Bridges incoming Telegram messages to portfolio actions. Parses intent with a
 * local LLM, then requires an explicit inline-button confirmation before any
 * change is written. Single-user: resolves the one non-DEMO user + account.
 */
@Injectable()
export class TelegramAssistantService {
  private readonly logger = new Logger(TelegramAssistantService.name);

  public constructor(
    private readonly accountBalanceService: AccountBalanceService,
    private readonly accountService: AccountService,
    private readonly activitiesService: ActivitiesService,
    private readonly ollamaService: OllamaService,
    private readonly prismaService: PrismaService,
    private readonly redisCacheService: RedisCacheService,
    private readonly telegramBotService: TelegramBotService,
    private readonly watchlistService: WatchlistService
  ) {}

  public async handleMessage(text: string): Promise<void> {
    try {
      const context = await this.resolveUserAndAccount();

      if (!context) {
        await this.telegramBotService.sendMessage(
          'No account is set up yet. Add an account in Ghostfolio first.'
        );

        return;
      }

      const { accountId, baseCurrency, userId } = context;
      const knownSymbols = await this.getKnownSymbols(userId);
      const intent = await this.ollamaService.extractIntent(text, knownSymbols);

      if (intent.action === 'get_balance') {
        await this.replyBalance(userId, baseCurrency);

        return;
      }

      if (intent.action === 'add_trade') {
        const currency = intent.currency ?? DEFAULT_CURRENCY;
        const date = intent.date ?? format(new Date(), DATE_FORMAT);
        const token = randomUUID();
        const notional = intent.quantity * intent.price;

        await this.storePending(token, {
          accountId,
          baseCurrency,
          currency,
          date,
          kind: 'add_trade',
          price: intent.price,
          quantity: intent.quantity,
          symbol: intent.symbol,
          type: intent.type,
          userId
        });

        await this.telegramBotService.sendMessageWithButtons(
          [
            `*Confirm trade*`,
            `${intent.type} ${intent.quantity} ${intent.symbol} @ ${intent.price} ${currency}`,
            `Total: ${notional.toFixed(2)} ${currency} (date ${date})`,
            ``,
            `Tap to confirm or cancel.`
          ].join('\n'),
          [
            { callbackData: `confirm:${token}`, text: '✅ Confirm' },
            { callbackData: `cancel:${token}`, text: '❌ Cancel' }
          ]
        );

        return;
      }

      if (intent.action === 'set_cash') {
        const currency = intent.currency ?? baseCurrency;
        const token = randomUUID();

        await this.storePending(token, {
          accountId,
          baseCurrency,
          currency,
          date: format(new Date(), DATE_FORMAT),
          kind: 'set_cash',
          newCashAmount: intent.amount,
          userId
        });

        await this.telegramBotService.sendMessageWithButtons(
          [
            `*Confirm cash update*`,
            `Set available cash to ${intent.amount.toFixed(2)} ${currency}`,
            ``,
            `Tap to confirm or cancel.`
          ].join('\n'),
          [
            { callbackData: `confirm:${token}`, text: '✅ Confirm' },
            { callbackData: `cancel:${token}`, text: '❌ Cancel' }
          ]
        );

        return;
      }

      if (intent.action === 'holding_duration') {
        await this.replyHoldingDuration(userId, baseCurrency, intent.symbol);

        return;
      }

      if (intent.action === 'set_fund_nav') {
        await this.setFundNav(intent.symbol, intent.price);

        return;
      }

      if (intent.action === 'add_watchlist') {
        const token = randomUUID();

        await this.storePending(token, {
          accountId,
          baseCurrency,
          currency: baseCurrency,
          date: format(new Date(), DATE_FORMAT),
          kind: 'add_watchlist',
          symbol: intent.symbol,
          userId
        });

        await this.telegramBotService.sendMessageWithButtons(
          [
            `*Add to watchlist*`,
            `${intent.symbol}`,
            ``,
            `Tap to confirm or cancel.`
          ].join('\n'),
          [
            { callbackData: `confirm:${token}`, text: '✅ Confirm' },
            { callbackData: `cancel:${token}`, text: '❌ Cancel' }
          ]
        );

        return;
      }

      // unknown
      const missing = intent.clarify ? ` (${intent.clarify})` : '';
      await this.telegramBotService.sendMessage(
        `I couldn't understand that${missing}. Try e.g. "I sold 2 AAPL at 300", "how long have I held NVDA", "add Tesla to my watchlist", or "set Nordnet Global NAV to 241.10".`
      );
    } catch (error) {
      this.logger.error(error);
    }
  }

  public async handleCallback(
    callbackQueryId: string,
    data: string
  ): Promise<void> {
    try {
      await this.telegramBotService.answerCallbackQuery(callbackQueryId);

      const [decision, token] = data.split(':');

      if (!token) {
        return;
      }

      const key = this.pendingKey(token);
      const raw = await this.redisCacheService.get(key);

      if (!raw) {
        await this.telegramBotService.sendMessage(
          'That confirmation expired. Please send the command again.'
        );

        return;
      }

      // One-time token: remove regardless of decision.
      await this.redisCacheService.remove(key);

      if (decision === 'cancel') {
        await this.telegramBotService.sendMessage(
          'Cancelled. Nothing changed.'
        );

        return;
      }

      if (decision !== 'confirm') {
        return;
      }

      const pending: PendingAction =
        typeof raw === 'string' ? JSON.parse(raw) : raw;

      if (pending.kind === 'add_trade') {
        await this.executeTrade(pending);
      } else if (pending.kind === 'set_cash') {
        await this.executeSetCash(pending);
      } else if (pending.kind === 'add_watchlist') {
        await this.executeAddWatchlist(pending);
      }
    } catch (error) {
      this.logger.error(error);

      await this.telegramBotService.sendMessage(
        'Something went wrong applying that action. Nothing partial was saved if you see no confirmation.'
      );
    }
  }

  private async executeTrade(pending: PendingAction): Promise<void> {
    await this.activitiesService.createActivity({
      accountId: pending.accountId,
      date: new Date(pending.date),
      fee: 0,
      quantity: pending.quantity,
      SymbolProfile: {
        connectOrCreate: {
          create: {
            currency: pending.currency,
            dataSource: DataSource.YAHOO,
            symbol: pending.symbol
          },
          where: {
            dataSource_symbol: {
              dataSource: DataSource.YAHOO,
              symbol: pending.symbol
            }
          }
        }
      },
      type: pending.type as ActivityType,
      unitPrice: pending.price,
      updateAccountBalance: true,
      user: { connect: { id: pending.userId } },
      userId: pending.userId
    });

    const cash = await this.accountService.getCashDetails({
      currency: pending.baseCurrency,
      userId: pending.userId
    });

    await this.telegramBotService.sendMessage(
      [
        `✅ Logged ${pending.type} ${pending.quantity} ${pending.symbol} @ ${pending.price} ${pending.currency}.`,
        `Available cash: ${cash.balanceInBaseCurrency.toFixed(2)} ${pending.baseCurrency}`
      ].join('\n')
    );
  }

  private async executeSetCash(pending: PendingAction): Promise<void> {
    await this.accountBalanceService.createOrUpdateAccountBalance({
      accountId: pending.accountId,
      balance: pending.newCashAmount,
      date: pending.date,
      userId: pending.userId
    });

    const cash = await this.accountService.getCashDetails({
      currency: pending.baseCurrency,
      userId: pending.userId
    });

    await this.telegramBotService.sendMessage(
      `✅ Available cash set to ${cash.balanceInBaseCurrency.toFixed(2)} ${pending.baseCurrency}.`
    );
  }

  private async executeAddWatchlist(pending: PendingAction): Promise<void> {
    try {
      await this.watchlistService.createWatchlistItem({
        dataSource: DataSource.YAHOO,
        symbol: pending.symbol,
        userId: pending.userId
      });

      await this.telegramBotService.sendMessage(
        `✅ Added ${pending.symbol} to your watchlist.`
      );
    } catch {
      await this.telegramBotService.sendMessage(
        `Couldn't add ${pending.symbol} — it may not be a valid Yahoo ticker.`
      );
    }
  }

  /**
   * Updates a MANUAL fund's NAV (for funds with no public feed, e.g. Nordnet's
   * own). Resolves the fund by fuzzy name/symbol match, writes today's price,
   * and clears the cached quote so it reflects immediately. The number comes
   * from the user — Gemma extracts it, code stores it (no arithmetic).
   */
  private async setFundNav(fundRef: string, nav: number): Promise<void> {
    const profiles = await this.prismaService.symbolProfile.findMany({
      select: { currency: true, name: true, symbol: true },
      where: { dataSource: DataSource.MANUAL }
    });

    const q = fundRef.trim().toLowerCase();
    const slug = q.replace(/\s+/g, '_');
    const match =
      profiles.find(
        (p) =>
          p.symbol.toLowerCase() === q ||
          p.symbol.toLowerCase() === slug ||
          p.name?.toLowerCase() === q
      ) ??
      profiles.find(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.symbol.toLowerCase().includes(slug)
      );

    if (!match) {
      const names = profiles
        .map((p) => p.name ?? p.symbol)
        .slice(0, 12)
        .join(', ');

      await this.telegramBotService.sendMessage(
        `Couldn't find a fund matching "${fundRef}". Your funds: ${names || 'none yet'}.`
      );

      return;
    }

    const date = new Date(`${format(new Date(), DATE_FORMAT)}T00:00:00.000Z`);

    await this.prismaService.marketData.upsert({
      create: {
        dataSource: DataSource.MANUAL,
        date,
        marketPrice: nav,
        symbol: match.symbol
      },
      update: { marketPrice: nav },
      where: {
        dataSource_date_symbol: {
          dataSource: DataSource.MANUAL,
          date,
          symbol: match.symbol
        }
      }
    });

    try {
      await this.redisCacheService.remove(
        this.redisCacheService.getQuoteKey({
          dataSource: DataSource.MANUAL,
          symbol: match.symbol
        })
      );
    } catch {
      // best-effort cache invalidation
    }

    await this.telegramBotService.sendMessage(
      `✅ Set ${match.name ?? match.symbol} NAV to ${nav} ${match.currency}.`
    );
  }

  private async replyHoldingDuration(
    userId: string,
    baseCurrency: string,
    symbol: string
  ): Promise<void> {
    const held = await this.computeHoldingSince(userId, baseCurrency, symbol);

    if (!held) {
      await this.telegramBotService.sendMessage(
        `You don't currently hold ${symbol}.`
      );

      return;
    }

    await this.telegramBotService.sendMessage(
      `📅 You've held ${symbol} since ${format(held.since, DATE_FORMAT)} — ${held.days} day${held.days === 1 ? '' : 's'}.`
    );
  }

  /**
   * Entry date of the current open lot for a symbol: walk activities oldest-first,
   * marking a new lot when net goes positive and clearing it when net returns to
   * zero. Pure code arithmetic — Gemma is not involved in the calculation.
   */
  private async computeHoldingSince(
    userId: string,
    baseCurrency: string,
    symbol: string
  ): Promise<{ days: number; since: Date } | null> {
    const { activities } = await this.activitiesService.getActivities({
      types: [ActivityType.BUY, ActivityType.SELL],
      userCurrency: baseCurrency,
      userId
    });

    const relevant = activities
      .filter((activity) => activity.SymbolProfile?.symbol === symbol)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let net = 0;
    let since: Date | null = null;

    for (const activity of relevant) {
      if (activity.type === ActivityType.BUY) {
        if (net <= 0) {
          since = new Date(activity.date);
        }
        net += activity.quantity;
      } else {
        net -= activity.quantity;
        if (net <= 0) {
          since = null;
        }
      }
    }

    if (net <= 0 || !since) {
      return null;
    }

    return {
      days: Math.floor((Date.now() - since.getTime()) / 86_400_000),
      since
    };
  }

  private async replyBalance(
    userId: string,
    baseCurrency: string
  ): Promise<void> {
    const cash = await this.accountService.getCashDetails({
      currency: baseCurrency,
      userId
    });

    await this.telegramBotService.sendMessage(
      `💰 Available cash: ${cash.balanceInBaseCurrency.toFixed(2)} ${baseCurrency}`
    );
  }

  private async storePending(
    token: string,
    action: PendingAction
  ): Promise<void> {
    await this.redisCacheService.set(
      this.pendingKey(token),
      JSON.stringify(action),
      PENDING_TTL
    );
  }

  private pendingKey(token: string): string {
    return `telegram:pending:${token}`;
  }

  private async resolveUserAndAccount(): Promise<{
    accountId: string;
    baseCurrency: string;
    userId: string;
  } | null> {
    const user = await this.prismaService.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, settings: { select: { settings: true } } },
      where: { role: { not: 'DEMO' } }
    });

    if (!user) {
      return null;
    }

    const account = await this.prismaService.account.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      where: { userId: user.id }
    });

    if (!account) {
      return null;
    }

    const settings = user.settings?.settings as UserSettings;

    return {
      accountId: account.id,
      baseCurrency: settings?.baseCurrency ?? DEFAULT_CURRENCY,
      userId: user.id
    };
  }

  private async getKnownSymbols(userId: string): Promise<string[]> {
    const [orders, user] = await Promise.all([
      this.prismaService.order.findMany({
        distinct: ['symbolProfileId'],
        select: { SymbolProfile: { select: { symbol: true } } },
        where: { userId }
      }),
      this.prismaService.user.findUnique({
        select: { watchlist: { select: { symbol: true } } },
        where: { id: userId }
      })
    ]);

    const symbols = new Set<string>();

    for (const order of orders) {
      if (order.SymbolProfile?.symbol) {
        symbols.add(order.SymbolProfile.symbol);
      }
    }

    for (const item of user?.watchlist ?? []) {
      symbols.add(item.symbol);
    }

    return [...symbols];
  }
}
