import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import {
  SIGNAL_REGIME_VIX_RISK_OFF,
  SIGNAL_REGIME_VIX_RISK_ON
} from '@ghostfolio/common/config';

import { Injectable, Logger } from '@nestjs/common';

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const CACHE_KEY = 'signals:market-regime';
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export type MarketRegimeLabel = 'RISK_OFF' | 'NEUTRAL' | 'RISK_ON';

export interface MarketRegime {
  asOf: string;
  indexAboveSma200: boolean;
  indexPrice: number;
  indexSma200: number;
  regime: MarketRegimeLabel;
  vix: number;
}

/**
 * Pure regime classification from the VIX level and the S&P 500 versus its
 * 200-day average. ADVISORY ONLY by design: this modulates deployment advice
 * text in the monthly plan, never the EV math — market-timing rules are
 * unvalidated by our backtest layer and hard-coding them would be exactly the
 * built-in optimism the engine refuses (docs §0.2).
 */
export function classifyRegime({
  indexPrice,
  indexSma200,
  vix
}: {
  indexPrice: number;
  indexSma200: number;
  vix: number;
}): MarketRegimeLabel {
  if (vix >= SIGNAL_REGIME_VIX_RISK_OFF || indexPrice < indexSma200) {
    return 'RISK_OFF';
  }

  if (vix < SIGNAL_REGIME_VIX_RISK_ON && indexPrice > indexSma200) {
    return 'RISK_ON';
  }

  return 'NEUTRAL';
}

/** One-line human advice per regime, used in Telegram plans. */
export function regimeAdvice(regime: MarketRegimeLabel): string {
  switch (regime) {
    case 'RISK_OFF':
      return 'split the stock sleeve into 2 tranches over 2-3 weeks and prefer ⚠️ REVERSAL-confirmed entries';
    case 'RISK_ON':
      return 'deploy normally';
    default:
      return 'deploy normally, but keep entries signal-confirmed';
  }
}

/**
 * Whether the monthly (25th) investment plan should fire: on/after the 25th
 * and not yet sent this month. Also drives the boot catch-up, so a machine
 * that was off on the 25th sends the plan on its next start.
 */
export function isMonthlyPlanDue({
  currentMonth,
  dayOfMonth,
  lastSentMonth
}: {
  /** 'YYYY-MM' of now. */
  currentMonth: string;
  dayOfMonth: number;
  /** 'YYYY-MM' of the last sent plan, or undefined when never sent. */
  lastSentMonth?: string;
}): boolean {
  return dayOfMonth >= 25 && lastSentMonth !== currentMonth;
}

/**
 * The most recent leader-screen slot that has already passed: the latest
 * weekday at `hour:minute` local time at or before `now`.
 *
 * The screen runs after the US close so the day's bar — and the breakout
 * volume that confirms it — is final. Weekends are skipped, so a Sunday boot
 * resolves back to Friday evening's slot.
 */
export function lastLeaderScreenSlot({
  hour,
  minute,
  now
}: {
  hour: number;
  minute: number;
  now: Date;
}): Date {
  const slot = new Date(now);
  slot.setHours(hour, minute, 0, 0);

  if (slot > now) {
    slot.setDate(slot.getDate() - 1);
  }

  // 0 = Sunday, 6 = Saturday.
  while (slot.getDay() === 0 || slot.getDay() === 6) {
    slot.setDate(slot.getDate() - 1);
  }

  return slot;
}

/**
 * Whether the leader screen still owes a run, i.e. the most recent slot has
 * passed and nothing has run since.
 *
 * This is what makes the screen survive a machine that is not awake at 22:40.
 * A `@nestjs/schedule` cron does not catch up — a firing missed because the
 * laptop was asleep or the dev server was stopped is simply lost, which is
 * why the evening alert had never once fired. Running it late costs nothing:
 * the previous US close is final, and final is all the screen wants.
 */
export function isLeaderScreenDue({
  hour,
  lastRunAt,
  minute,
  now
}: {
  hour: number;
  /** ISO timestamp of the last completed run, or undefined when never run. */
  lastRunAt?: string;
  minute: number;
  now: Date;
}): boolean {
  if (!lastRunAt) {
    return true;
  }

  const lastRun = new Date(lastRunAt);

  if (Number.isNaN(lastRun.getTime())) {
    return true;
  }

  return lastRun < lastLeaderScreenSlot({ hour, minute, now });
}

@Injectable()
export class MarketRegimeService {
  private readonly logger = new Logger(MarketRegimeService.name);

  public constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly redisCacheService: RedisCacheService
  ) {}

  /**
   * Current market regime from live ^VIX + ^GSPC (1y closes for the SMA200),
   * Redis-cached for 1h. Never throws — returns null when either feed is
   * unavailable, and callers simply omit the regime line.
   */
  public async getRegime(): Promise<MarketRegime | null> {
    try {
      const cached = await this.redisCacheService.get(CACHE_KEY);

      if (cached) {
        return JSON.parse(cached) as MarketRegime;
      }
    } catch {
      // ignore cache read errors
    }

    const [vixCloses, spxCloses] = await Promise.all([
      this.fetchCloses('^VIX', '5d'),
      this.fetchCloses('^GSPC', '1y')
    ]);

    const vix = vixCloses?.[vixCloses.length - 1];
    const indexPrice = spxCloses?.[spxCloses.length - 1];
    const indexSma200 = spxCloses
      ? this.indicatorsService.sma(spxCloses, 200)
      : null;

    if (!vix || !indexPrice || !indexSma200) {
      this.logger.warn('Market regime unavailable (VIX/S&P feed failed)');

      return null;
    }

    const regime: MarketRegime = {
      asOf: new Date().toISOString(),
      indexAboveSma200: indexPrice > indexSma200,
      indexPrice: Math.round(indexPrice * 100) / 100,
      indexSma200: Math.round(indexSma200 * 100) / 100,
      regime: classifyRegime({ indexPrice, indexSma200, vix }),
      vix: Math.round(vix * 100) / 100
    };

    try {
      await this.redisCacheService.set(
        CACHE_KEY,
        JSON.stringify(regime),
        CACHE_TTL_MS
      );
    } catch {
      // best-effort cache
    }

    return regime;
  }

  /** One-line summary for Telegram messages, or null when unavailable. */
  public async getRegimeLine(): Promise<string | null> {
    const regime = await this.getRegime();

    if (!regime) {
      return null;
    }

    const emoji =
      regime.regime === 'RISK_OFF'
        ? '⚠️'
        : regime.regime === 'RISK_ON'
          ? '🟢'
          : '🟡';
    const trend = regime.indexAboveSma200 ? 'above' : 'below';

    return `${emoji} Market regime: ${regime.regime.replace('_', '-')} (VIX ${regime.vix}, S&P 500 ${trend} its 200-day) — ${regimeAdvice(regime.regime)}.`;
  }

  private async fetchCloses(
    symbol: string,
    range: '5d' | '1y'
  ): Promise<number[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${CHART_URL}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
        { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal }
      );

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const closes: (number | null)[] =
        payload?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      const cleaned = closes.filter(
        (value): value is number => typeof value === 'number' && value > 0
      );

      return cleaned.length > 0 ? cleaned : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
