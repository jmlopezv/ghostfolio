import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import { OhlcService } from '@ghostfolio/api/services/signals/ohlc.service';
import { TelegramBotService } from '@ghostfolio/api/services/telegram-bot/telegram-bot.service';
import {
  SIGNAL_HORIZON_DAYS,
  SIGNAL_INTRADAY_HORIZON_BARS,
  SIGNAL_INTRADAY_MIN_BARS,
  SIGNAL_INTRADAY_TRAIL_VOL_MULT,
  SIGNAL_STOP_VOL_MULT,
  SIGNAL_TAG_PROVENANCE_BET,
  SIGNAL_TAG_PROVENANCE_DIP,
  SIGNAL_TAG_PROVENANCE_LEADER,
  SIGNAL_TAKE_PROFIT_FLOOR_PCT,
  SIGNAL_TAKE_PROFIT_VOL_MULT,
  SIGNAL_TRACKED_TRADE_LOOKBACK_DAYS,
  SIGNAL_TRACKED_TRADE_MAX_MATCH_GAP_DAYS,
  SIGNAL_TYPE_UNTAGGED
} from '@ghostfolio/common/config';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Prisma } from '@prisma/client';
import { differenceInCalendarDays, subDays } from 'date-fns';

export type TrackedStatus =
  | 'STOP_HIT'
  | 'TRACKING'
  | 'TRAILING'
  | 'TRAILING_EXIT';

export interface TrackedMetrics {
  realBuyDate: string;
  realBuyPrice: number;
  trackedAlertedAt?: string;
  /** Price the exit fired at. Absent on exits recorded before 2026-08-27. */
  trackedExitPrice?: number;
  trackedOrderId: string;
  trackedPeakPrice?: number;
  trackedStatus: TrackedStatus;
  trackedStopLoss: number | null;
  trackedTakeProfit: number | null;
  trackedTargetHitAt?: string;
}

/**
 * Type-guards a SignalLog.metrics JSON blob into TrackedMetrics, or returns
 * null when the row was never linked to a real buy (the common case for
 * purely hypothetical signals no Order was ever placed for).
 */
export function readTrackedMetrics(
  metrics: Prisma.JsonValue | null
): TrackedMetrics | null {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return null;
  }

  const candidate = metrics as Record<string, unknown>;

  if (
    typeof candidate.trackedOrderId !== 'string' ||
    typeof candidate.trackedStatus !== 'string' ||
    typeof candidate.realBuyPrice !== 'number' ||
    typeof candidate.realBuyDate !== 'string'
  ) {
    return null;
  }

  return {
    realBuyDate: candidate.realBuyDate,
    realBuyPrice: candidate.realBuyPrice,
    trackedAlertedAt:
      typeof candidate.trackedAlertedAt === 'string'
        ? candidate.trackedAlertedAt
        : undefined,
    trackedExitPrice:
      typeof candidate.trackedExitPrice === 'number'
        ? candidate.trackedExitPrice
        : undefined,
    trackedOrderId: candidate.trackedOrderId,
    trackedPeakPrice:
      typeof candidate.trackedPeakPrice === 'number'
        ? candidate.trackedPeakPrice
        : undefined,
    trackedStatus: candidate.trackedStatus as TrackedStatus,
    trackedStopLoss:
      typeof candidate.trackedStopLoss === 'number'
        ? candidate.trackedStopLoss
        : null,
    trackedTakeProfit:
      typeof candidate.trackedTakeProfit === 'number'
        ? candidate.trackedTakeProfit
        : null,
    trackedTargetHitAt:
      typeof candidate.trackedTargetHitAt === 'string'
        ? candidate.trackedTargetHitAt
        : undefined
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The provenance tag on an order, which is the type of the position it opened.
 *
 * `SignalLog.signalType` describes a SIGNAL. A tracked position's type is a
 * different question — where the decision to buy came from — and the answer
 * lives on the order as a tag the user maintains. Conflating the two is what
 * put BET positions inside the curve measuring the dip strategy.
 *
 * An order carrying several tags takes the first recognised provenance one, so
 * unrelated tags (ACTIVE_TRADE and anything added later) cannot hijack it.
 */
export function provenanceTagOf(tags?: { name: string }[]): string {
  const known: string[] = [
    SIGNAL_TAG_PROVENANCE_DIP,
    SIGNAL_TAG_PROVENANCE_LEADER,
    SIGNAL_TAG_PROVENANCE_BET
  ];

  return (
    tags?.map(({ name }) => name).find((name) => known.includes(name)) ??
    SIGNAL_TYPE_UNTAGGED
  );
}

/**
 * Builds the `dataSource:symbol` keys of every symbol the user has opted out
 * of real-buy tracking (see SignalConfig.excludeFromTracking) — checked
 * before detectAndTrackNewBuys matches or synthesizes a tracked entry for a
 * real Order.
 */
export function computeExcludedTrackingKeys(
  signalConfigs: { dataSource: string; symbol: string }[]
): Set<string> {
  return new Set(
    signalConfigs.map((config) => `${config.dataSource}:${config.symbol}`)
  );
}

/**
 * Builds the `dataSource:symbol` keys of every position a real, still-OPEN
 * tracked trade is watching.
 *
 * Used by SignalsService to suppress its own `evaluateExit` for those
 * symbols, so a holding is never watched by two exit systems at once (this
 * frozen-level tracker and the isActiveTrade state machine) each raising its
 * own SELL at a different price.
 *
 * Only TRACKING and TRAILING are open. STOP_HIT and TRAILING_EXIT are
 * finished trades and release the position back to the exit state machine.
 */
export function computeLiveTrackedKeys(
  buyLogs: {
    dataSource: string;
    metrics: Prisma.JsonValue | null;
    symbol: string;
  }[]
): Set<string> {
  const keys = new Set<string>();

  for (const log of buyLogs) {
    const status = readTrackedMetrics(log.metrics)?.trackedStatus;

    if (status === 'TRACKING' || status === 'TRAILING') {
      keys.add(`${log.dataSource}:${log.symbol}`);
    }
  }

  return keys;
}

/**
 * Tracks real BUY Orders the user placed after acting on an engine signal,
 * independent of the isActiveTrade-gated dynamic exit machine (evaluateExit).
 * Frozen at signal-time: the stop/target watched here are exactly what the
 * originating SignalLog row already stored at BUY time, never recomputed.
 *
 * Two-stage exit, mirroring the engine's own WATCHING/TRAILING shape but
 * scoped to a single real position instead of the whole active-trade state
 * machine: TRACKING (watching the frozen stop/target) -> STOP_HIT (frozen
 * stop hit first, terminal) or TRAILING (frozen target hit — ride the trend)
 * -> TRAILING_EXIT (intraday reversal detected, terminal).
 */
@Injectable()
export class SignalTradeTrackingService {
  private readonly logger = new Logger(SignalTradeTrackingService.name);

  public constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly ohlcService: OhlcService,
    private readonly prismaService: PrismaService,
    private readonly telegramBotService: TelegramBotService
  ) {}

  /**
   * Auto-links real BUY Orders placed within the lookback window to a prior,
   * not-yet-tracked engine BUY signal for the same symbol — no manual
   * toggle needed. Idempotent: never re-links an Order or a SignalLog row
   * twice.
   */
  public async detectAndTrackNewBuys(userId: string): Promise<void> {
    const since = subDays(new Date(), SIGNAL_TRACKED_TRADE_LOOKBACK_DAYS);

    const [orders, buyLogs, signalConfigs] = await Promise.all([
      this.prismaService.order.findMany({
        include: {
          SymbolProfile: {
            select: { dataSource: true, name: true, symbol: true }
          },
          // The provenance tag is the only authority on what kind of decision a
          // purchase was. Without it the synthesised row below has to choose a
          // type for itself, and every choice it has made has been wrong for
          // some position — first DIP for everything, then MANUAL for
          // everything. Being tracked and being a dip are unrelated facts.
          tags: { select: { name: true } }
        },
        orderBy: { date: 'asc' },
        where: { date: { gte: since }, isDraft: false, type: 'BUY', userId }
      }),
      this.prismaService.signalLog.findMany({
        orderBy: { createdAt: 'asc' },
        where: { category: 'BUY', createdAt: { gte: since }, userId }
      }),
      this.prismaService.signalConfig.findMany({
        select: { dataSource: true, excludeFromTracking: true, symbol: true },
        where: { excludeFromTracking: true, userId }
      })
    ]);

    const excludedKeys = computeExcludedTrackingKeys(signalConfigs);

    const linkedOrderIds = new Set<string>();
    const linkedSignalIds = new Set<string>();

    for (const log of buyLogs) {
      const tracked = readTrackedMetrics(log.metrics);

      if (tracked) {
        linkedOrderIds.add(tracked.trackedOrderId);
        linkedSignalIds.add(log.id);
      }
    }

    for (const order of orders) {
      if (linkedOrderIds.has(order.id) || !order.SymbolProfile) {
        continue;
      }

      const { dataSource, name, symbol } = order.SymbolProfile;

      // The user has explicitly opted this position out of tracking (e.g. a
      // long-term core holding never meant to be sold on a signal) — never
      // match or synthesize a tracked entry for it.
      if (excludedKeys.has(`${dataSource}:${symbol}`)) {
        continue;
      }

      // Same symbol, not already linked to another Order, fired on/before the
      // purchase and within SIGNAL_TRACKED_TRADE_MAX_MATCH_GAP_DAYS of it.
      // Calendar-day (not raw timestamp) comparison because Order.date is a
      // plain date while SignalLog.createdAt carries a real time-of-day — a
      // same-day signal fired later that day would otherwise be wrongly
      // excluded. The tight gap matters: a ticker can re-fire a BUY signal
      // repeatedly over weeks as conditions recur, and matching to an old
      // fire whose entry price has nothing to do with the real purchase
      // would freeze a nonsensical target (see computeFreshLevels below for
      // what happens instead when nothing recent enough exists).
      const candidates = buyLogs.filter((log) => {
        const gapDays = differenceInCalendarDays(order.date, log.createdAt);

        return (
          log.dataSource === dataSource &&
          log.symbol === symbol &&
          !linkedSignalIds.has(log.id) &&
          gapDays >= 0 &&
          gapDays <= SIGNAL_TRACKED_TRADE_MAX_MATCH_GAP_DAYS
        );
      });

      let match: (typeof buyLogs)[number] | undefined;

      if (candidates.length > 0) {
        // Closest-preceding signal wins when more than one recent, untracked
        // BUY signal fired for this symbol — that's the one the user acted
        // on.
        candidates.sort(
          (a, b) =>
            Math.abs(differenceInCalendarDays(order.date, a.createdAt)) -
            Math.abs(differenceInCalendarDays(order.date, b.createdAt))
        );
        match = candidates[0];
      } else {
        // No signal fired close enough to this purchase to trust its entry
        // price — create a fresh tracked entry dated at the REAL buy date,
        // with a target/stop computed straight from the real fill price.
        match = await this.createSyntheticBuyLog({
          dataSource,
          name,
          order,
          symbol,
          userId
        });

        if (!match) {
          // Volatility unavailable this cycle — try again on the next pass.
          continue;
        }
      }

      const rawMetrics =
        match.metrics &&
        typeof match.metrics === 'object' &&
        !Array.isArray(match.metrics)
          ? (match.metrics as Record<string, unknown>)
          : {};

      const tracked: TrackedMetrics = {
        realBuyDate: order.date.toISOString(),
        realBuyPrice: order.unitPrice,
        trackedOrderId: order.id,
        trackedStatus: 'TRACKING',
        trackedStopLoss: match.stopLoss,
        trackedTakeProfit: match.takeProfit
      };

      await this.prismaService.signalLog.update({
        data: {
          metrics: JSON.parse(JSON.stringify({ ...rawMetrics, ...tracked }))
        },
        where: { id: match.id }
      });

      linkedSignalIds.add(match.id);
      linkedOrderIds.add(order.id);

      this.logger.log(
        `Tracking real buy: ${symbol} order ${order.id} -> signal ${match.id} ` +
          `(target ${match.takeProfit}, stop ${match.stopLoss})`
      );
    }
  }

  /**
   * Creates a new BUY SignalLog row dated at the real purchase, with a
   * target/stop computed fresh from the real fill price using the same
   * volatility-scaled formula the engine's own BUY signals use (Yang-Zhang
   * daily volatility via OhlcService, SIGNAL_HORIZON_DAYS horizon,
   * SIGNAL_TAKE_PROFIT_FLOOR_PCT/_VOL_MULT/SIGNAL_STOP_VOL_MULT constants) —
   * used only when no engine signal fired close enough to this purchase to
   * trust its entry price. Returns null (never throws) when volatility isn't
   * available this cycle, so the caller can retry on the next pass.
   */
  private async createSyntheticBuyLog({
    dataSource,
    name,
    order,
    symbol,
    userId
  }: {
    dataSource: DataSource;
    name: string | null;
    order: {
      currency: string | null;
      date: Date;
      tags?: { name: string }[];
      unitPrice: number;
    };
    symbol: string;
    userId: string;
  }) {
    const volatility = await this.ohlcService.getDailyVolatility(symbol);

    if (!volatility) {
      return null;
    }

    const band = this.indicatorsService.horizonBand(
      volatility,
      SIGNAL_HORIZON_DAYS
    );
    const targetGainPct = Math.max(
      SIGNAL_TAKE_PROFIT_FLOOR_PCT,
      SIGNAL_TAKE_PROFIT_VOL_MULT * band
    );
    const stopLossPct = SIGNAL_STOP_VOL_MULT * band;
    const stopLoss = order.unitPrice * (1 - stopLossPct);
    const takeProfit = order.unitPrice * (1 + targetGainPct);

    return this.prismaService.signalLog.create({
      data: {
        category: 'BUY',
        createdAt: order.date,
        currency: order.currency,
        dataSource,
        livePrice: order.unitPrice,
        name,
        reason:
          'No engine signal fired close enough to this real purchase — target/stop computed fresh from your actual entry price.',
        // Read from the order's provenance tag, never chosen here. This row
        // exists so the exit machinery has something to watch; it is not
        // evidence that any strategy produced anything, and it is not this
        // service's place to decide what kind of decision the purchase was.
        // UNTAGGED marks a genuine gap in the record rather than inventing a
        // strategy to fill it.
        signalType: provenanceTagOf(order.tags),
        stopLoss,
        symbol,
        takeProfit,
        userId
      }
    });
  }

  /**
   * Checks every TRACKING position against its frozen stop/target. Runs on
   * the main 30-min notify cycle, reusing that cycle's already-fetched live
   * quotes. TRAILING positions are handed off entirely to
   * checkTrailingPositionsIntraday — never processed here.
   */
  public async checkTrackedTradesAndAlert(
    userId: string,
    livePriceBySymbol: Map<string, number>
  ): Promise<void> {
    const buyLogs = await this.prismaService.signalLog.findMany({
      where: { category: 'BUY', userId }
    });

    for (const log of buyLogs) {
      const tracked = readTrackedMetrics(log.metrics);

      if (!tracked || tracked.trackedStatus !== 'TRACKING') {
        continue;
      }

      const livePrice = livePriceBySymbol.get(log.symbol);

      if (livePrice == null) {
        continue;
      }

      const hitStop =
        tracked.trackedStopLoss != null && livePrice <= tracked.trackedStopLoss;
      const hitTarget =
        tracked.trackedTakeProfit != null &&
        livePrice >= tracked.trackedTakeProfit;

      if (!hitStop && !hitTarget) {
        continue;
      }

      const now = new Date().toISOString();
      const pct = round1(
        ((livePrice - tracked.realBuyPrice) / tracked.realBuyPrice) * 100
      );

      if (hitStop) {
        await this.telegramBotService.sendMessage(
          `🛑 *Stop-loss reached — consider selling*\n` +
            `*${log.name ?? log.symbol}* (${log.symbol})\n` +
            `Bought: ${tracked.realBuyPrice} ${log.currency ?? ''} · Now: ${livePrice} ${log.currency ?? ''} (${pct >= 0 ? '+' : ''}${pct}%)`
        );

        await this.updateMetrics(log.id, log.metrics, {
          ...tracked,
          trackedAlertedAt: now,
          // The price the exit actually fired at. Without it the Simulation
          // has to reconstruct the exit from that day's close, which is close
          // but not the same number — and there is no reason to guess at
          // something we are holding in a variable right here.
          trackedExitPrice: livePrice,
          trackedStatus: 'STOP_HIT'
        });
      } else {
        await this.telegramBotService.sendMessage(
          `🎯 *Target reached — ${log.name ?? log.symbol} (${log.symbol})*\n` +
            `Bought: ${tracked.realBuyPrice} ${log.currency ?? ''} · Now: ${livePrice} ${log.currency ?? ''} (+${pct}%)\n` +
            `Holding — will alert again only if the uptrend reverses.`
        );

        await this.updateMetrics(log.id, log.metrics, {
          ...tracked,
          trackedAlertedAt: now,
          trackedPeakPrice: livePrice,
          trackedStatus: 'TRAILING',
          trackedTargetHitAt: now
        });
      }
    }
  }

  /**
   * The 5-minute intraday check: for every TRAILING position (across every
   * user), reads today's 5-min bars, ratchets the peak, and compares the
   * live price against a volatility-scaled trailing-stop level (reusing
   * IndicatorsService.trailingStopLevel verbatim, with intraday inputs
   * instead of daily ones) — firing the "sell now" alert on a reversal.
   */
  public async checkTrailingPositionsIntraday(): Promise<void> {
    const buyLogs = await this.prismaService.signalLog.findMany({
      where: { category: 'BUY' }
    });

    for (const log of buyLogs) {
      const tracked = readTrackedMetrics(log.metrics);

      if (!tracked || tracked.trackedStatus !== 'TRAILING') {
        continue;
      }

      try {
        await this.checkOneTrailingPosition(log, tracked);
      } catch (error) {
        this.logger.warn(
          `Intraday trailing check failed for ${log.symbol}: ${error?.message ?? error}`
        );
      }
    }
  }

  private async checkOneTrailingPosition(
    log: {
      currency: string | null;
      id: string;
      metrics: Prisma.JsonValue | null;
      name: string | null;
      symbol: string;
    },
    tracked: TrackedMetrics
  ): Promise<void> {
    const bars = await this.ohlcService.getIntradayBars(log.symbol);

    if (!bars || bars.length === 0) {
      return;
    }

    const livePrice = bars[bars.length - 1].close;
    const peak = Math.max(tracked.trackedPeakPrice ?? livePrice, livePrice);

    if (bars.length < SIGNAL_INTRADAY_MIN_BARS) {
      // Not enough intraday history yet to trust a vol estimate — just
      // ratchet the peak and keep waiting.
      await this.updateMetrics(log.id, log.metrics, {
        ...tracked,
        trackedPeakPrice: peak
      });

      return;
    }

    const intradayVol = this.indicatorsService.yangZhang(bars);

    const trail =
      intradayVol > 0
        ? this.indicatorsService.trailingStopLevel({
            horizonDays: SIGNAL_INTRADAY_HORIZON_BARS,
            peak,
            volatility: intradayVol,
            volMult: SIGNAL_INTRADAY_TRAIL_VOL_MULT
          })
        : null;

    // The original frozen stop is kept as a hard backstop in case price
    // craters straight through before the intraday trail catches it.
    const hitTrail = trail != null && livePrice <= trail;
    const hitStop =
      tracked.trackedStopLoss != null && livePrice <= tracked.trackedStopLoss;

    if (!hitTrail && !hitStop) {
      await this.updateMetrics(log.id, log.metrics, {
        ...tracked,
        trackedPeakPrice: peak
      });

      return;
    }

    const pctOffPeak = round1(((livePrice - peak) / peak) * 100);

    await this.telegramBotService.sendMessage(
      `📉 *Uptrend reversing — sell ${log.name ?? log.symbol} (${log.symbol}) now*\n` +
        `Peak: ${peak} ${log.currency ?? ''} · Now: ${livePrice} ${log.currency ?? ''} (${pctOffPeak}% off peak)\n` +
        `Locking in gains before giving more back.`
    );

    await this.updateMetrics(log.id, log.metrics, {
      ...tracked,
      trackedAlertedAt: new Date().toISOString(),
      // See the STOP_HIT branch: record what the exit actually fired at rather
      // than leaving the Simulation to infer it from a daily close.
      trackedExitPrice: livePrice,
      trackedPeakPrice: peak,
      trackedStatus: 'TRAILING_EXIT'
    });
  }

  private async updateMetrics(
    signalLogId: string,
    rawMetrics: Prisma.JsonValue | null,
    tracked: TrackedMetrics
  ): Promise<void> {
    const existing =
      rawMetrics && typeof rawMetrics === 'object' && !Array.isArray(rawMetrics)
        ? (rawMetrics as Record<string, unknown>)
        : {};

    await this.prismaService.signalLog.update({
      data: {
        metrics: JSON.parse(JSON.stringify({ ...existing, ...tracked }))
      },
      where: { id: signalLogId }
    });
  }
}
