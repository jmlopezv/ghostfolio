import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';

import { Injectable, Logger } from '@nestjs/common';

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

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

  /** Fetches daily OHLCV from Yahoo's chart endpoint, cached 1h. Never throws. */
  private async fetchChart(symbol: string): Promise<{
    bars: { close: number; high: number; low: number; open: number }[];
    volumes: number[];
  } | null> {
    const cacheKey = `ohlc:chart:${symbol}`;

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
        `${CHART_URL}/${encodeURIComponent(symbol)}?range=3mo&interval=1d`,
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
          [open, high, low, close].every(
            (v) => typeof v === 'number' && v > 0
          )
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
          CACHE_TTL
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
