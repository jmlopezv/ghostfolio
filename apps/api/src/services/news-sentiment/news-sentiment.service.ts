import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { Injectable, Logger } from '@nestjs/common';

export interface NewsSentiment {
  // Number of articles that contributed to the score (after age weighting).
  articles: number;
  // Age-decayed average sentiment in [-1, +1] (negative = bearish).
  score: number;
}

export interface MarketHeadline {
  title: string;
  summary?: string;
  source?: string;
  url?: string;
  publishedAt?: string;
}

// Cache a resolved score for 6 hours; a transient (rate-limited) miss for 1 hour
// so we retry sooner without burning the free-tier daily quota.
const NEWS_CACHE_TTL = 6 * 60 * 60 * 1000;
const NEWS_RETRY_TTL = 60 * 60 * 1000;
// General market headlines move faster than per-ticker sentiment but still
// don't need a fresh fetch every minute — 30 min is a reasonable middle ground.
const HEADLINES_CACHE_TTL = 30 * 60 * 1000;
const HEADLINES_CACHE_KEY = 'news:market-headlines';
// 3-day half-life: weight = exp(-ln2/3 × ageDays).
const DECAY_PER_DAY = Math.LN2 / 3;
// Sentinel cached when a symbol has no usable news (covered vs rate-limited).
const NONE = 'NONE';
const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetches pre-computed per-ticker news sentiment from a free provider (Alpha
 * Vantage by default) and reduces it to a single age-decayed score in [-1, +1].
 *
 * The score is a RISK GATE / volatility modifier — research shows news sentiment
 * predicts volatility far more reliably than direction, so the signal engine
 * uses it to suppress dip-buys on bad news, never as a standalone buy signal.
 *
 * Self-disables when no API key is configured (getScore returns null and the
 * engine simply skips the news gate). Never throws.
 */
@Injectable()
export class NewsSentimentService {
  private readonly logger = new Logger(NewsSentimentService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly redisCacheService: RedisCacheService
  ) {}

  public isConfigured(): boolean {
    return this.resolveApiKey().length > 0;
  }

  /**
   * Returns the cached/fresh sentiment for a symbol, or null when there is no
   * key, no coverage, or a transient error. Cache-first to respect free-tier
   * rate limits (one network call per symbol per ~6 hours).
   */
  public async getScore(symbol: string): Promise<NewsSentiment | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const cacheKey = `news:sentiment:${symbol}`;

    const cached = await this.safeGet(cacheKey);

    if (cached === NONE) {
      return null;
    }

    if (cached) {
      try {
        return JSON.parse(cached) as NewsSentiment;
      } catch {
        // fall through and refetch
      }
    }

    const { retryable, sentiment } = await this.fetch(symbol);

    if (sentiment) {
      await this.safeSet(cacheKey, JSON.stringify(sentiment), NEWS_CACHE_TTL);

      return sentiment;
    }

    // Cache the absence so we do not re-hit the provider every run.
    await this.safeSet(
      cacheKey,
      NONE,
      retryable ? NEWS_RETRY_TTL : NEWS_CACHE_TTL
    );

    return null;
  }

  /**
   * General market headlines (not tied to a single ticker) — the "market
   * summary" feed shown on the Academy page's Market Pulse section. Same
   * self-disabling/never-throws contract as `getScore`: returns null when no
   * key is configured or the provider yields nothing usable.
   */
  public async getMarketHeadlines(): Promise<MarketHeadline[] | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const cached = await this.safeGet(HEADLINES_CACHE_KEY);

    if (cached === NONE) {
      return null;
    }

    if (cached) {
      try {
        return JSON.parse(cached) as MarketHeadline[];
      } catch {
        // fall through and refetch
      }
    }

    const headlines =
      this.provider() === 'FINNHUB'
        ? await this.fetchFinnhubMarketNews()
        : await this.fetchAlphaVantageMarketNews();

    if (headlines?.length) {
      await this.safeSet(
        HEADLINES_CACHE_KEY,
        JSON.stringify(headlines),
        HEADLINES_CACHE_TTL
      );

      return headlines;
    }

    await this.safeSet(HEADLINES_CACHE_KEY, NONE, NEWS_RETRY_TTL);

    return null;
  }

  /** Alpha Vantage NEWS_SENTIMENT with a broad topic instead of a ticker. */
  private async fetchAlphaVantageMarketNews(): Promise<MarketHeadline[] | null> {
    const apiKey = this.resolveApiKey();
    const url =
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT` +
      `&topics=financial_markets&sort=LATEST&limit=10&apikey=${apiKey}`;

    const payload = await this.getJson(url);

    if (!payload || payload.Note || payload.Information) {
      return null;
    }

    const feed: any[] = Array.isArray(payload.feed) ? payload.feed : [];

    return feed.slice(0, 10).map((article) => ({
      publishedAt: this.parseAlphaVantageTime(
        article.time_published
      )
        ? new Date(
            this.parseAlphaVantageTime(article.time_published)
          ).toISOString()
        : undefined,
      source: article.source,
      summary: article.summary,
      title: article.title,
      url: article.url
    }));
  }

  /** Finnhub /news?category=general — Finnhub's general market news feed. */
  private async fetchFinnhubMarketNews(): Promise<MarketHeadline[] | null> {
    const apiKey = this.resolveApiKey();
    const url = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;

    const payload = await this.getJson(url);

    if (!Array.isArray(payload)) {
      return null;
    }

    return payload.slice(0, 10).map((article) => ({
      publishedAt: article.datetime
        ? new Date(article.datetime * 1000).toISOString()
        : undefined,
      source: article.source,
      summary: article.summary,
      title: article.headline,
      url: article.url
    }));
  }

  private resolveApiKey(): string {
    const explicit = this.configurationService.get('NEWS_SENTIMENT_API_KEY');

    if (explicit) {
      return explicit;
    }

    // Reuse the Alpha Vantage data-provider key when the provider matches, so
    // an existing Alpha Vantage setup needs no extra configuration.
    if (this.provider() === 'ALPHA_VANTAGE') {
      return this.configurationService.get('API_KEY_ALPHA_VANTAGE');
    }

    return '';
  }

  private provider(): string {
    return (
      this.configurationService.get('NEWS_SENTIMENT_PROVIDER') ||
      'ALPHA_VANTAGE'
    ).toUpperCase();
  }

  private async fetch(
    symbol: string
  ): Promise<{ retryable: boolean; sentiment: NewsSentiment | null }> {
    try {
      if (this.provider() === 'FINNHUB') {
        return await this.fetchFinnhub(symbol);
      }

      return await this.fetchAlphaVantage(symbol);
    } catch (error) {
      this.logger.warn(`News sentiment fetch failed for ${symbol}: ${error}`);

      return { retryable: true, sentiment: null };
    }
  }

  /**
   * Alpha Vantage NEWS_SENTIMENT: returns a `feed` of articles, each carrying a
   * `ticker_sentiment` array with a `ticker_sentiment_score` per ticker. We take
   * the matching ticker's score from each article and average with age decay.
   */
  private async fetchAlphaVantage(
    symbol: string
  ): Promise<{ retryable: boolean; sentiment: NewsSentiment | null }> {
    const apiKey = this.resolveApiKey();
    const url =
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT` +
      `&tickers=${encodeURIComponent(symbol)}&sort=LATEST&limit=50&apikey=${apiKey}`;

    const payload = await this.getJson(url);

    if (!payload) {
      return { retryable: true, sentiment: null };
    }

    // Free-tier throttle / informational responses carry no feed.
    if (payload.Note || payload.Information) {
      this.logger.warn(
        `Alpha Vantage throttled for ${symbol}: ${payload.Note ?? payload.Information}`
      );

      return { retryable: true, sentiment: null };
    }

    const feed: any[] = Array.isArray(payload.feed) ? payload.feed : [];

    if (feed.length === 0) {
      return { retryable: false, sentiment: null };
    }

    const now = Date.now();
    let weightedSum = 0;
    let weightTotal = 0;
    let articles = 0;

    for (const article of feed) {
      const match = (article.ticker_sentiment ?? []).find(
        (t: any) => t.ticker === symbol
      );

      if (!match) {
        continue;
      }

      const score = Number(match.ticker_sentiment_score);

      if (!isFinite(score)) {
        continue;
      }

      const weight = this.ageWeight(article.time_published, now);

      weightedSum += score * weight;
      weightTotal += weight;
      articles += 1;
    }

    if (weightTotal === 0) {
      return { retryable: false, sentiment: null };
    }

    return {
      retryable: false,
      sentiment: {
        articles,
        score: this.clamp(weightedSum / weightTotal)
      }
    };
  }

  /**
   * Finnhub /company-news (last 7 days). Finnhub does not return a per-article
   * sentiment on the free tier, so we approximate from the article count only
   * when an explicit per-article sentiment is present; otherwise no score.
   */
  private async fetchFinnhub(
    symbol: string
  ): Promise<{ retryable: boolean; sentiment: NewsSentiment | null }> {
    const apiKey = this.resolveApiKey();
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const url =
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}` +
      `&from=${fmt(from)}&to=${fmt(to)}&token=${apiKey}`;

    const payload = await this.getJson(url);

    if (!Array.isArray(payload)) {
      return { retryable: true, sentiment: null };
    }

    const now = Date.now();
    let weightedSum = 0;
    let weightTotal = 0;
    let articles = 0;

    for (const article of payload) {
      const score = Number(article.sentiment);

      if (!isFinite(score)) {
        continue;
      }

      const publishedMs = article.datetime ? article.datetime * 1000 : now;
      const ageDays = Math.max(0, (now - publishedMs) / (24 * 60 * 60 * 1000));
      const weight = Math.exp(-DECAY_PER_DAY * ageDays);

      weightedSum += score * weight;
      weightTotal += weight;
      articles += 1;
    }

    if (weightTotal === 0) {
      return { retryable: false, sentiment: null };
    }

    return {
      retryable: false,
      sentiment: { articles, score: this.clamp(weightedSum / weightTotal) }
    };
  }

  /** Age decay weight from an Alpha Vantage `time_published` (yyyymmddThhmmss). */
  private ageWeight(timePublished: string, nowMs: number): number {
    const parsed = this.parseAlphaVantageTime(timePublished);
    const ageDays =
      parsed === null ? 0 : Math.max(0, (nowMs - parsed) / (24 * 60 * 60 * 1000));

    return Math.exp(-DECAY_PER_DAY * ageDays);
  }

  private parseAlphaVantageTime(value: string): number | null {
    // Format: 20240131T153000
    if (!value || value.length < 15) {
      return null;
    }

    const iso =
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` +
      `T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
    const ms = Date.parse(iso);

    return isFinite(ms) ? ms : null;
  }

  private clamp(value: number): number {
    return Math.max(-1, Math.min(1, value));
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
      this.logger.warn(`News request error: ${error}`);

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
