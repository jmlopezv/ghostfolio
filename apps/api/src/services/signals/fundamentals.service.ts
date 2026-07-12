import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';

import { Injectable, Logger } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';

export interface FundamentalsSnapshot {
  analystNetBuyRatio: number | null; // [-2, +2]: weighted strongBuy/buy vs sell/strongSell
  debtToEquity: number | null;
  earningsGrowth: number | null; // trailing, fraction e.g. 0.2 = 20%
  forwardPE: number | null;
  returnOnEquity: number | null; // fraction e.g. 0.15 = 15%
}

// Fundamentals move on an earnings/quarterly cadence, not daily — cache far
// longer than a technical quote. A transient (rate-limited/no-coverage) miss
// is cached for a shorter window so we retry sooner without hammering Yahoo.
const FUNDAMENTALS_CACHE_TTL = 24 * 60 * 60 * 1000;
const FUNDAMENTALS_RETRY_TTL = 2 * 60 * 60 * 1000;
const NONE = 'NONE';

/**
 * Fetches a lightweight valuation/quality/growth snapshot from Yahoo's free
 * `quoteSummary` fundamentals modules and reduces it to a single 0-100
 * fundamentals score — a complement to, not a replacement for, the purely
 * technical composite score in `indicators.service.ts`. They answer different
 * questions ("is this cheap and well-run" vs. "is this technically oversold
 * right now") and are deliberately kept separate rather than blended.
 *
 * Never throws — a fetch failure or missing coverage just yields nulls, and
 * `computeFundamentalsScore` re-normalizes over whichever inputs are present,
 * the same way `IndicatorsService.computeScore` handles missing terms.
 */
@Injectable()
export class FundamentalsService {
  private readonly logger = new Logger(FundamentalsService.name);

  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
  });

  public constructor(private readonly redisCacheService: RedisCacheService) {}

  public async getSnapshot(
    symbol: string
  ): Promise<FundamentalsSnapshot | null> {
    const cacheKey = `fundamentals:${symbol}`;

    const cached = await this.safeGet(cacheKey);

    if (cached === NONE) {
      return null;
    }

    if (cached) {
      try {
        return JSON.parse(cached) as FundamentalsSnapshot;
      } catch {
        // fall through and refetch
      }
    }

    const snapshot = await this.fetch(symbol);

    if (snapshot) {
      await this.safeSet(
        cacheKey,
        JSON.stringify(snapshot),
        FUNDAMENTALS_CACHE_TTL
      );

      return snapshot;
    }

    await this.safeSet(cacheKey, NONE, FUNDAMENTALS_RETRY_TTL);

    return null;
  }

  /**
   * Composite 0-100 fundamentals-attractiveness score. Higher means cheaper,
   * more profitable, growing faster, and more favorably rated by analysts.
   * Null-guarded and re-normalized over whichever inputs are available.
   */
  public computeScore(snapshot: FundamentalsSnapshot): number {
    const weights = {
      analyst: 0.2,
      growth: 0.25,
      quality: 0.25,
      valuation: 0.3
    };

    let score = 0;
    let weightUsed = 0;

    if (snapshot.forwardPE !== null) {
      const valuationScore =
        snapshot.forwardPE > 0
          ? Math.max(0, Math.min(100, 100 - snapshot.forwardPE * 2))
          : 20; // unprofitable on a forward basis — penalize, don't exclude
      score += weights.valuation * valuationScore;
      weightUsed += weights.valuation;
    }

    if (snapshot.returnOnEquity !== null) {
      const qualityScore = Math.max(
        0,
        Math.min(100, 50 + snapshot.returnOnEquity * 100)
      );
      score += weights.quality * qualityScore;
      weightUsed += weights.quality;
    }

    if (snapshot.earningsGrowth !== null) {
      const growthScore = Math.max(
        0,
        Math.min(100, 50 + snapshot.earningsGrowth * 100)
      );
      score += weights.growth * growthScore;
      weightUsed += weights.growth;
    }

    if (snapshot.analystNetBuyRatio !== null) {
      const analystScore = Math.max(
        0,
        Math.min(100, 50 + snapshot.analystNetBuyRatio * 25)
      );
      score += weights.analyst * analystScore;
      weightUsed += weights.analyst;
    }

    return weightUsed === 0 ? null : Math.round(score / weightUsed);
  }

  private async fetch(symbol: string): Promise<FundamentalsSnapshot | null> {
    try {
      const result = await this.yahooFinance.quoteSummary(symbol, {
        modules: [
          'defaultKeyStatistics',
          'financialData',
          'recommendationTrend'
        ]
      });

      const financialData = result?.financialData;
      const keyStatistics = result?.defaultKeyStatistics;
      const recommendation = result?.recommendationTrend?.trend?.[0];

      const forwardPE = keyStatistics?.forwardPE ?? null;
      const returnOnEquity = financialData?.returnOnEquity ?? null;
      const debtToEquity = financialData?.debtToEquity ?? null;
      const earningsGrowth = financialData?.earningsGrowth ?? null;

      let analystNetBuyRatio: number | null = null;

      if (recommendation) {
        const total =
          recommendation.strongBuy +
          recommendation.buy +
          recommendation.hold +
          recommendation.sell +
          recommendation.strongSell;

        if (total > 0) {
          analystNetBuyRatio =
            (recommendation.strongBuy * 2 +
              recommendation.buy -
              recommendation.sell -
              recommendation.strongSell * 2) /
            total;
        }
      }

      if (
        forwardPE === null &&
        returnOnEquity === null &&
        earningsGrowth === null &&
        analystNetBuyRatio === null
      ) {
        return null;
      }

      return {
        analystNetBuyRatio,
        debtToEquity,
        earningsGrowth,
        forwardPE,
        returnOnEquity
      };
    } catch (error) {
      this.logger.warn(`Fundamentals fetch failed for ${symbol}: ${error}`);

      return null;
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
