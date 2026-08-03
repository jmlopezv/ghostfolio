import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import {
  SIGNAL_SCREEN_ANALYST_TREND_DELTA,
  SIGNAL_SCREEN_EPS_REVISION_PCT,
  SIGNAL_SCREEN_SECTOR_TAILWIND_PCT
} from '@ghostfolio/common/config';

import { Injectable, Logger } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';

export type AnalystTrend = 'IMPROVING' | 'DETERIORATING' | 'FLAT';
export type EpsRevisionTrend = 'UP' | 'DOWN' | 'FLAT';
export type SectorTailwind = 'RISING' | 'FALLING' | 'MIXED';

export interface ScreenHeadline {
  publishedAt?: string;
  source?: string;
  title: string;
}

/**
 * The fetched (per-symbol, cacheable) part of the pre-buy screen. The two
 * context-dependent fields — 200-day trend and sector tailwind — are computed
 * by the caller from data it already has (the indicator snapshot and the
 * watchlist's per-category returns) and are NOT part of this cached shape.
 */
export interface PreBuyScreen {
  analystTrend: AnalystTrend | null;
  daysToEarnings: number | null;
  epsRevisionTrend: EpsRevisionTrend | null;
  headlines: ScreenHeadline[];
  nextEarningsDate: string | null;
}

interface RecommendationCounts {
  buy: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  hold?: number;
}

/**
 * Weighted net-buy ratio in [-2, +2] from analyst recommendation counts —
 * strong opinions count double, holds dilute. Same formula the fundamentals
 * score has always used for its analyst term.
 */
export function netBuyRatio(counts: RecommendationCounts): number | null {
  const total =
    counts.strongBuy +
    counts.buy +
    (counts.hold ?? 0) +
    counts.sell +
    counts.strongSell;

  if (total <= 0) {
    return null;
  }

  return (
    (counts.strongBuy * 2 + counts.buy - counts.sell - counts.strongSell * 2) /
    total
  );
}

/** Direction of the analyst net-buy ratio, latest month vs the month before. */
export function classifyAnalystTrend(
  latestRatio: number | null,
  priorRatio: number | null
): AnalystTrend | null {
  if (latestRatio === null || priorRatio === null) {
    return null;
  }

  const delta = latestRatio - priorRatio;

  if (delta >= SIGNAL_SCREEN_ANALYST_TREND_DELTA) {
    return 'IMPROVING';
  }

  if (delta <= -SIGNAL_SCREEN_ANALYST_TREND_DELTA) {
    return 'DETERIORATING';
  }

  return 'FLAT';
}

/** Direction of the current-year consensus EPS estimate vs 30 days ago. */
export function classifyEpsRevision(
  currentEstimate: number | null,
  estimate30dAgo: number | null
): EpsRevisionTrend | null {
  if (
    currentEstimate === null ||
    estimate30dAgo === null ||
    estimate30dAgo === 0
  ) {
    return null;
  }

  const changePct =
    ((currentEstimate - estimate30dAgo) / Math.abs(estimate30dAgo)) * 100;

  if (changePct >= SIGNAL_SCREEN_EPS_REVISION_PCT) {
    return 'UP';
  }

  if (changePct <= -SIGNAL_SCREEN_EPS_REVISION_PCT) {
    return 'DOWN';
  }

  return 'FLAT';
}

/**
 * In-house sector tailwind: the average 3-month return across watchlist
 * symbols sharing the candidate's catalog category. No API call — the caller
 * already has every symbol's return3mPct from the metrics snapshot.
 */
export function classifySectorTailwind(
  peerReturns3mPct: number[]
): SectorTailwind | null {
  const valid = peerReturns3mPct.filter((value) => isFinite(value));

  if (valid.length === 0) {
    return null;
  }

  const average = valid.reduce((sum, value) => sum + value, 0) / valid.length;

  if (average > SIGNAL_SCREEN_SECTOR_TAILWIND_PCT) {
    return 'RISING';
  }

  if (average < -SIGNAL_SCREEN_SECTOR_TAILWIND_PCT) {
    return 'FALLING';
  }

  return 'MIXED';
}

/** Whole days from `now` until an ISO date (negative when already past). */
export function daysUntil(dateIso: string, now: Date = new Date()): number {
  const target = Date.parse(dateIso);

  return Math.round((target - now.getTime()) / (24 * 60 * 60 * 1000));
}

// A screen is point-in-time context for a fired signal — 6h keeps repeat
// signals for the same symbol cheap; a transient miss retries after 1h.
const SCREEN_CACHE_TTL = 6 * 60 * 60 * 1000;
const SCREEN_RETRY_TTL = 60 * 60 * 1000;
const NONE = 'NONE';
const FETCH_TIMEOUT_MS = 8000;
const HEADLINE_COUNT = 3;
const HEADLINE_LOOKBACK_DAYS = 7;
const EARNINGS_LOOKAHEAD_DAYS = 90;

/**
 * Systematic pre-buy screen for a signal candidate: analyst rating direction,
 * EPS estimate revisions, next earnings date, and recent headlines. Yahoo
 * (already integrated, best European coverage) is the primary source; Finnhub
 * complements it where the free tier genuinely adds something — recommendation
 * history, the earnings calendar, and US company headlines. `/company-news`
 * covers US-listed companies ONLY on the free tier, so non-US symbols simply
 * omit headlines (documented, not hidden).
 *
 * ADVISORY ONLY by design: the screen is shown alongside a fired signal and
 * never blocks one — these filters look good on one month of simulation data
 * but are unvalidated as hard rules. Never throws; every field degrades to
 * null independently. Fetched lazily, only when a BUY actually fires — never
 * for the whole watchlist (Finnhub free tier = 60 calls/min).
 */
@Injectable()
export class ScreeningService {
  private readonly logger = new Logger(ScreeningService.name);

  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
  });

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly redisCacheService: RedisCacheService
  ) {}

  public hasFinnhub(): boolean {
    return this.finnhubApiKey().length > 0;
  }

  /**
   * Cached/fresh pre-buy screen for a symbol, or null when nothing at all
   * could be resolved (no coverage anywhere).
   */
  public async getScreen(symbol: string): Promise<PreBuyScreen | null> {
    const cacheKey = `prebuy-screen:v1:${symbol}`;

    const cached = await this.safeGet(cacheKey);

    if (cached === NONE) {
      return null;
    }

    if (cached) {
      try {
        return JSON.parse(cached) as PreBuyScreen;
      } catch {
        // fall through and refetch
      }
    }

    const screen = await this.fetch(symbol);

    if (screen) {
      await this.safeSet(cacheKey, JSON.stringify(screen), SCREEN_CACHE_TTL);

      return screen;
    }

    await this.safeSet(cacheKey, NONE, SCREEN_RETRY_TTL);

    return null;
  }

  private async fetch(symbol: string): Promise<PreBuyScreen | null> {
    const yahoo = await this.fetchYahoo(symbol);

    let analystTrend = yahoo.analystTrend;
    let nextEarningsDate = yahoo.nextEarningsDate;
    let headlines: ScreenHeadline[] = [];

    if (this.hasFinnhub()) {
      if (analystTrend === null) {
        analystTrend = await this.fetchFinnhubAnalystTrend(symbol);
      }

      if (nextEarningsDate === null) {
        nextEarningsDate = await this.fetchFinnhubNextEarnings(symbol);
      }

      headlines = (await this.fetchFinnhubHeadlines(symbol)) ?? [];
    }

    const daysToEarnings =
      nextEarningsDate === null ? null : daysUntil(nextEarningsDate);

    if (
      analystTrend === null &&
      yahoo.epsRevisionTrend === null &&
      nextEarningsDate === null &&
      headlines.length === 0
    ) {
      return null;
    }

    return {
      analystTrend,
      daysToEarnings,
      headlines,
      nextEarningsDate,
      epsRevisionTrend: yahoo.epsRevisionTrend
    };
  }

  private async fetchYahoo(symbol: string): Promise<{
    analystTrend: AnalystTrend | null;
    epsRevisionTrend: EpsRevisionTrend | null;
    nextEarningsDate: string | null;
  }> {
    try {
      const result = await this.yahooFinance.quoteSummary(symbol, {
        modules: ['calendarEvents', 'earningsTrend', 'recommendationTrend']
      });

      // Analyst direction: latest month's net-buy ratio vs the month before.
      // The fundamentals score already reads trend[0]'s LEVEL — the DIRECTION
      // was previously discarded, and it is exactly what the screen wants.
      const trend = result?.recommendationTrend?.trend ?? [];
      const analystTrend = classifyAnalystTrend(
        trend[0] ? netBuyRatio(trend[0]) : null,
        trend[1] ? netBuyRatio(trend[1]) : null
      );

      // EPS revisions: current-year consensus estimate now vs 30 days ago.
      const currentYear = (result?.earningsTrend?.trend ?? []).find(
        (entry) => entry.period === '0y'
      );
      const epsRevisionTrend = classifyEpsRevision(
        currentYear?.epsTrend?.current ?? null,
        currentYear?.epsTrend?.['30daysAgo'] ?? null
      );

      const earningsDates = result?.calendarEvents?.earnings?.earningsDate;
      const nextEarningsDate = earningsDates?.[0]
        ? new Date(earningsDates[0]).toISOString().slice(0, 10)
        : null;

      return { analystTrend, epsRevisionTrend, nextEarningsDate };
    } catch (error) {
      this.logger.warn(`Yahoo screen fetch failed for ${symbol}: ${error}`);

      return {
        analystTrend: null,
        epsRevisionTrend: null,
        nextEarningsDate: null
      };
    }
  }

  /** Finnhub /stock/recommendation: monthly count history, newest first. */
  private async fetchFinnhubAnalystTrend(
    symbol: string
  ): Promise<AnalystTrend | null> {
    const payload = await this.getJson(
      `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${this.finnhubApiKey()}`
    );

    if (!Array.isArray(payload) || payload.length < 2) {
      return null;
    }

    return classifyAnalystTrend(
      netBuyRatio(payload[0]),
      netBuyRatio(payload[1])
    );
  }

  /** Finnhub /calendar/earnings: next report inside the lookahead window. */
  private async fetchFinnhubNextEarnings(
    symbol: string
  ): Promise<string | null> {
    const from = new Date();
    const to = new Date(
      from.getTime() + EARNINGS_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000
    );
    const fmt = (date: Date) => date.toISOString().slice(0, 10);

    const payload = await this.getJson(
      `https://finnhub.io/api/v1/calendar/earnings?from=${fmt(from)}&to=${fmt(to)}` +
        `&symbol=${encodeURIComponent(symbol)}&token=${this.finnhubApiKey()}`
    );

    const entries: any[] = Array.isArray(payload?.earningsCalendar)
      ? payload.earningsCalendar
      : [];

    const dates = entries
      .map((entry) => entry.date)
      .filter((date): date is string => typeof date === 'string')
      .sort();

    return dates[0] ?? null;
  }

  /** Finnhub /company-news (last 7 days, US companies only on the free tier). */
  private async fetchFinnhubHeadlines(
    symbol: string
  ): Promise<ScreenHeadline[] | null> {
    const to = new Date();
    const from = new Date(
      to.getTime() - HEADLINE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    );
    const fmt = (date: Date) => date.toISOString().slice(0, 10);

    const payload = await this.getJson(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}` +
        `&from=${fmt(from)}&to=${fmt(to)}&token=${this.finnhubApiKey()}`
    );

    if (!Array.isArray(payload) || payload.length === 0) {
      return null;
    }

    return payload
      .filter((article) => article.headline)
      .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
      .slice(0, HEADLINE_COUNT)
      .map((article) => ({
        publishedAt: article.datetime
          ? new Date(article.datetime * 1000).toISOString()
          : undefined,
        source: article.source,
        title: article.headline
      }));
  }

  private finnhubApiKey(): string {
    return this.configurationService.get('FINNHUB_API_KEY');
  }

  private async getJson(url: string): Promise<any | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.warn(`Screen request error: ${error}`);

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async safeGet(key: string): Promise<string | null> {
    try {
      return (await this.redisCacheService.get(key)) ?? null;
    } catch {
      return null;
    }
  }

  private async safeSet(
    key: string,
    value: string,
    ttl: number
  ): Promise<void> {
    try {
      await this.redisCacheService.set(key, value, ttl);
    } catch {
      // best-effort cache; ignore
    }
  }
}
