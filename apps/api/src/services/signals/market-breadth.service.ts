import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import { Bar } from '@ghostfolio/api/services/signals/ohlc-bar.service';
import { SIGNAL_MARKET_BREADTH_HEALTHY_PCT } from '@ghostfolio/common/config';

import { Injectable, Logger } from '@nestjs/common';

const CACHE_KEY = 'market-breadth:v1';
const CACHE_TTL = 60 * 60 * 1000;

export interface MarketBreadth {
  asOf: string;
  /** Names above their own 200-day average. */
  above: number;
  /** Fraction 0-1 of ranked names above their own 200-day. */
  breadth: number;
  healthy: boolean;
  /** Names with enough history to be judged at all. */
  total: number;
}

/**
 * Market direction, measured as breadth over the tracked universe.
 *
 * Minervini's first rule is that most breakouts fail in a correcting market,
 * and this engine had no notion of market direction at all - `computeLeaderCandidates`
 * evaluates every name in isolation. That is the single biggest thing missing
 * from the Minervini funnel here (market -> group -> stock -> base -> pivot):
 * only the last three steps were ever implemented.
 *
 * Why breadth rather than "the S&P above its 200-day": there is no index data
 * stored locally. `^GSPC` and `^VIX` both have zero rows in `OhlcBar` and in
 * `MarketData` - `MarketRegimeService` fetches them live from Yahoo, which works
 * for a live message but cannot be evaluated point-in-time in a backtest.
 * Breadth over the universe we already store is computable for any historical
 * date with no lookahead and no extra feed, which is what makes the gate
 * testable rather than merely assertable.
 *
 * It is also arguably the better measure: an index can be dragged above its
 * average by a handful of mega-caps while most stocks are below theirs, and it
 * is the latter that determines whether a random breakout has support.
 *
 * Never throws - a failure returns null and callers treat the gate as open
 * rather than silently suppressing every alert.
 */
@Injectable()
export class MarketBreadthService {
  private readonly logger = new Logger(MarketBreadthService.name);

  public constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly redisCacheService: RedisCacheService
  ) {}

  /**
   * Breadth from an already-loaded set of bars.
   *
   * Pure and synchronous so the backtest harness can call it per historical
   * date with a truncated series - the same code path the live gate uses, which
   * is the point.
   */
  public compute(barsBySymbol: { [symbol: string]: Bar[] }): MarketBreadth {
    let above = 0;
    let total = 0;
    let asOf = '';

    for (const bars of Object.values(barsBySymbol)) {
      if (bars.length < 200) {
        continue;
      }

      const closes = bars.map(({ close }) => close);
      const sma200 = this.indicatorsService.sma(closes, 200);

      if (sma200 == null) {
        continue;
      }

      total++;

      if (closes[closes.length - 1] > sma200) {
        above++;
      }

      const last = bars[bars.length - 1].date;

      if (last > asOf) {
        asOf = last;
      }
    }

    const breadth = total > 0 ? above / total : 0;

    return {
      above,
      asOf,
      breadth,
      healthy: total > 0 && breadth >= SIGNAL_MARKET_BREADTH_HEALTHY_PCT,
      total
    };
  }

  /** Cached wrapper for the live path. */
  public async get(barsBySymbol: {
    [symbol: string]: Bar[];
  }): Promise<MarketBreadth | null> {
    try {
      const cached = await this.redisCacheService.get(CACHE_KEY);

      if (cached) {
        return JSON.parse(cached) as MarketBreadth;
      }
    } catch {
      // ignore cache read errors
    }

    try {
      const breadth = this.compute(barsBySymbol);

      if (breadth.total === 0) {
        return null;
      }

      try {
        await this.redisCacheService.set(
          CACHE_KEY,
          JSON.stringify(breadth),
          CACHE_TTL
        );
      } catch {
        // best-effort cache
      }

      return breadth;
    } catch (error) {
      this.logger.warn(`Market breadth unavailable: ${error}`);

      return null;
    }
  }

  /** One line for a Telegram message, or null when unavailable. */
  public toLine(breadth: MarketBreadth | null): string | null {
    if (!breadth) {
      return null;
    }

    return `${breadth.healthy ? '🟢' : '⚠️'} Market breadth: ${(
      breadth.breadth * 100
    ).toFixed(0)}% of ${breadth.total} tracked names above their 200-day — ${
      breadth.healthy ? 'healthy' : 'weak, most breakouts fail here'
    }.`;
  }
}
