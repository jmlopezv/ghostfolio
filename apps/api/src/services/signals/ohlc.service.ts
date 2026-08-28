import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import { Bar } from '@ghostfolio/api/services/signals/ohlc-bar.service';

import { Injectable, Logger } from '@nestjs/common';

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 8000;

/**
 * Chart ranges `getDatedBars` accepts. The short end exists for the nightly
 * gather, which usually needs a single missing session and has no reason to ask
 * for a year of bars to get it; the long end backs the historical backfill.
 */
export type BarRange = '1mo' | '3mo' | '1y' | '2y' | '5y' | '10y' | 'max';

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const INTRADAY_CACHE_TTL = 4 * 60 * 1000; // 4 min — short enough to stay fresh for the 5-min trailing check

/**
 * Fetches daily OHLC from Yahoo's public chart endpoint and returns a Yang-Zhang
 * daily-volatility estimate — far more stable than close-to-close because it uses
 * the intraday range. Used only for the handful of owned active trades, where the
 * volatility drives the real stop/target/trailing bands. Cached, never throws;
 * returns null on any failure so the caller falls back to close-to-close.
 */
@Injectable()
export class OhlcService {
  private readonly logger = new Logger(OhlcService.name);

  public constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly redisCacheService: RedisCacheService
  ) {}

  /** Yang-Zhang daily volatility (for owned exit bands). */
  public async getDailyVolatility(symbol: string): Promise<number | null> {
    const chart = await this.fetchChart(symbol);

    if (!chart || chart.bars.length < 5) {
      return null;
    }

    const vol = this.indicatorsService.yangZhang(chart.bars);

    return vol > 0 ? vol : null;
  }

  /**
   * Today's 5-minute OHLC bars, for intraday trend-reversal detection on real
   * tracked positions once their frozen take-profit has been reached (see
   * SignalTradeTrackingService). Cached briefly (not the full 1h daily TTL)
   * so the 5-min cron always sees fresh-enough data. Never throws; null on
   * any failure or lack of data (e.g. outside market hours).
   */
  public async getIntradayBars(
    symbol: string
  ): Promise<
    { close: number; high: number; low: number; open: number }[] | null
  > {
    const chart = await this.fetchChart(symbol, {
      cacheKey: `ohlc:intraday:${symbol}`,
      cacheTtl: INTRADAY_CACHE_TTL,
      query: 'range=1d&interval=5m'
    });

    return chart?.bars ?? null;
  }

  /**
   * Daily closes WITH dates (unlike fetchChart's bars, which discard the
   * timestamp array) — used to build a %-change-since-a-given-date overlay,
   * e.g. the S&P 500 comparison line on the Simulation chart. Cached under
   * its own key, 1h TTL. Never throws; null on any failure or lack of data.
   */
  public async getDailyClosesWithDates(
    symbol: string,
    range: '1y' | '2y' | '5y'
  ): Promise<{ close: number; date: string }[] | null> {
    const cacheKey = `ohlc:dated-closes:${symbol}:${range}`;

    try {
      const cached = await this.redisCacheService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // ignore cache read errors
    }

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
      const result = payload?.chart?.result?.[0];
      const timestamps: (number | null)[] = result?.timestamp ?? [];
      const closes: (number | null)[] =
        result?.indicators?.quote?.[0]?.close ?? [];

      const closesWithDates: { close: number; date: string }[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const epochSeconds = timestamps[i];
        const close = closes[i];

        if (
          typeof epochSeconds === 'number' &&
          typeof close === 'number' &&
          close > 0
        ) {
          closesWithDates.push({
            close,
            date: new Date(epochSeconds * 1000).toISOString().slice(0, 10)
          });
        }
      }

      if (closesWithDates.length === 0) {
        return null;
      }

      try {
        await this.redisCacheService.set(
          cacheKey,
          JSON.stringify(closesWithDates),
          CACHE_TTL
        );
      } catch {
        // best-effort cache
      }

      return closesWithDates;
    } catch (error) {
      this.logger.warn(`Dated closes fetch failed for ${symbol}: ${error}`);

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Recent volume as a multiple of the 20-day average (capitulation /
   * participation confirmation for the reversal buy path). null when no data.
   */
  public async getVolumeRatio(symbol: string): Promise<number | null> {
    const chart = await this.fetchChart(symbol);

    if (!chart || chart.volumes.length < 20) {
      return null;
    }

    const volumes = chart.volumes;
    const recent = volumes[volumes.length - 1];
    const window = volumes.slice(-20);
    const avg = window.reduce((s, v) => s + v, 0) / window.length;

    return avg > 0 ? recent / avg : null;
  }

  /**
   * Full daily OHLCV **with dates**, for persistence rather than live scoring.
   *
   * Deliberately uncached: this backs the historical backfill and the daily
   * gather, where a 1h Redis TTL would be both useless (each symbol is asked
   * for once) and wasteful (five years of bars per key). `fetchChart` stays the
   * cached path for the live, per-evaluation reads.
   *
   * Rows with a null/zero OHLC are dropped — Yahoo emits those for halted or
   * pre-listing sessions, and a zero would poison every downstream average.
   * Never throws; returns null so a single bad symbol cannot abort a backfill.
   */
  public async getDatedBars(
    symbol: string,
    range: BarRange = '5y'
  ): Promise<Bar[] | null> {
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
      const result = payload?.chart?.result?.[0];
      const timestamps: (number | null)[] = result?.timestamp ?? [];
      const quote = result?.indicators?.quote?.[0];

      if (!quote?.close || timestamps.length === 0) {
        return null;
      }

      const bars: Bar[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const epochSeconds = timestamps[i];
        const open = quote.open?.[i];
        const high = quote.high?.[i];
        const low = quote.low?.[i];
        const close = quote.close?.[i];
        const volume = quote.volume?.[i];

        if (
          typeof epochSeconds !== 'number' ||
          ![open, high, low, close].every(
            (value) => typeof value === 'number' && value > 0
          )
        ) {
          continue;
        }

        // Clamp to the bar's own extremes: Yahoo returns inconsistent OHLC for
        // some thinly-traded listings (a high below the close), which is
        // impossible and would yield a negative true range. Only ever repairs.
        bars.push({
          close,
          date: new Date(epochSeconds * 1000).toISOString().slice(0, 10),
          high: Math.max(high, open, close),
          low: Math.min(low, open, close),
          open,
          volume: typeof volume === 'number' ? volume : 0
        });
      }

      return bars.length > 0 ? bars : null;
    } catch (error) {
      this.logger.warn(`Dated OHLCV fetch failed for ${symbol}: ${error}`);

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetches OHLCV from Yahoo's chart endpoint, cached. Defaults to the daily
   * 3mo/1d window; pass `options` to fetch a different range/interval (e.g.
   * intraday 5-min bars) under its own cache key/TTL. Never throws.
   */
  private async fetchChart(
    symbol: string,
    options?: { cacheKey?: string; cacheTtl?: number; query?: string }
  ): Promise<{
    bars: { close: number; high: number; low: number; open: number }[];
    volumes: number[];
  } | null> {
    const cacheKey = options?.cacheKey ?? `ohlc:chart:${symbol}`;
    const cacheTtl = options?.cacheTtl ?? CACHE_TTL;
    const query = options?.query ?? 'range=3mo&interval=1d';

    try {
      const cached = await this.redisCacheService.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // ignore cache read errors
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(
        `${CHART_URL}/${encodeURIComponent(symbol)}?${query}`,
        { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal }
      );

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      const quote = payload?.chart?.result?.[0]?.indicators?.quote?.[0];

      if (!quote?.close) {
        return null;
      }

      const bars: {
        close: number;
        high: number;
        low: number;
        open: number;
      }[] = [];
      const volumes: number[] = [];

      for (let i = 0; i < quote.close.length; i++) {
        const open = quote.open?.[i];
        const high = quote.high?.[i];
        const low = quote.low?.[i];
        const close = quote.close?.[i];
        const volume = quote.volume?.[i];

        if (
          [open, high, low, close].every((v) => typeof v === 'number' && v > 0)
        ) {
          bars.push({ close, high, low, open });
          volumes.push(typeof volume === 'number' ? volume : 0);
        }
      }

      const result = { bars, volumes };

      try {
        await this.redisCacheService.set(
          cacheKey,
          JSON.stringify(result),
          cacheTtl
        );
      } catch {
        // best-effort cache
      }

      return result;
    } catch (error) {
      this.logger.warn(`OHLC fetch failed for ${symbol}: ${error}`);

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
