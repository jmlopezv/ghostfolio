import { Injectable } from '@nestjs/common';

/**
 * Tier 2 of the trading-signals engine: probabilistic context and risk-based
 * position sizing. These are NOT point price predictions - they express a
 * calibrated band and a probability, used to inform (never replace) the rule.
 */
@Injectable()
export class ForecastService {
  /**
   * EWMA (RiskMetrics) daily volatility from a series of log returns. Reacts
   * faster to recent moves than a simple standard deviation.
   */
  public ewmaVolatility(returns: number[], lambda = 0.94): number {
    if (returns.length === 0) {
      return 0;
    }

    // Seed with the sample variance of the first chunk.
    let variance = returns[0] ** 2;

    for (let i = 1; i < returns.length; i++) {
      variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
    }

    return Math.sqrt(variance);
  }

  /** Mean daily log return, clamped to avoid extrapolating wild drift. */
  public drift(returns: number[]): number {
    if (returns.length === 0) {
      return 0;
    }

    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;

    // Clamp daily drift to +/- 0.2% to keep forecasts conservative.
    return Math.max(-0.002, Math.min(0.002, mean));
  }

  /**
   * Expected-move band over `horizonDays` trading days: the central expectation
   * plus/minus `k` standard deviations. Returned as absolute prices.
   */
  public expectedMoveBand({
    dailyDrift,
    dailyVolatility,
    horizonDays,
    k = 1,
    price
  }: {
    dailyDrift: number;
    dailyVolatility: number;
    horizonDays: number;
    k?: number;
    price: number;
  }): { expected: number; lower: number; upper: number } {
    const expected = price * Math.exp(dailyDrift * horizonDays);
    const sigma = dailyVolatility * Math.sqrt(horizonDays);

    return {
      expected,
      lower: price * Math.exp(dailyDrift * horizonDays - k * sigma),
      upper: price * Math.exp(dailyDrift * horizonDays + k * sigma)
    };
  }

  /**
   * Monte Carlo estimate of the probability that the price *touches* `target`
   * at any point within `horizonDays`, simulating geometric Brownian motion.
   * Direction (up/down) is inferred from target vs current price.
   */
  public hitTargetProbability({
    dailyDrift,
    dailyVolatility,
    horizonDays,
    paths = 2000,
    price,
    target
  }: {
    dailyDrift: number;
    dailyVolatility: number;
    horizonDays: number;
    paths?: number;
    price: number;
    target: number;
  }): number {
    if (price <= 0 || target <= 0 || horizonDays <= 0) {
      return 0;
    }

    if (dailyVolatility === 0) {
      // Deterministic drift only.
      const finalPrice = price * Math.exp(dailyDrift * horizonDays);

      return (target >= price ? finalPrice >= target : finalPrice <= target)
        ? 1
        : 0;
    }

    const up = target >= price;
    let hits = 0;

    for (let p = 0; p < paths; p++) {
      let currentPrice = price;
      let touched = false;

      for (let day = 0; day < horizonDays; day++) {
        const z = this.sampleStandardNormal();
        currentPrice *= Math.exp(
          (dailyDrift - 0.5 * dailyVolatility ** 2) + dailyVolatility * z
        );

        if (up ? currentPrice >= target : currentPrice <= target) {
          touched = true;
          break;
        }
      }

      if (touched) {
        hits++;
      }
    }

    return hits / paths;
  }

  /**
   * Volatility-targeted position size with a capped fractional-Kelly tilt.
   * Scales the suggested amount inversely with the name's annualised volatility,
   * so more volatile holdings receive less capital. Returns an amount in the
   * same currency as `budget`, never exceeding `budget`.
   */
  public volatilityTargetedAmount({
    annualVolatility,
    budget,
    maxFraction = 0.25,
    targetVolatility = 0.2
  }: {
    annualVolatility: number;
    budget: number;
    maxFraction?: number;
    targetVolatility?: number;
  }): number {
    if (budget <= 0) {
      return 0;
    }

    if (annualVolatility <= 0) {
      return budget * maxFraction;
    }

    const fraction = Math.min(maxFraction, targetVolatility / annualVolatility);

    return Math.round(budget * fraction * 100) / 100;
  }

  /**
   * Cheap analytic probability that the price ends at/above `target` after
   * `horizonDays`, under a lognormal model (terminal-value normal approximation
   * of log-returns). Used to rank the whole universe without running Monte Carlo
   * on every symbol. Direction inferred from target vs price.
   */
  public reachProbability({
    dailyDrift,
    dailyVolatility,
    horizonDays,
    price,
    target
  }: {
    dailyDrift: number;
    dailyVolatility: number;
    horizonDays: number;
    price: number;
    target: number;
  }): number {
    if (price <= 0 || target <= 0 || horizonDays <= 0) {
      return 0;
    }

    const sigma = dailyVolatility * Math.sqrt(horizonDays);

    if (sigma <= 0) {
      const finalPrice = price * Math.exp(dailyDrift * horizonDays);

      return (target >= price ? finalPrice >= target : finalPrice <= target)
        ? 1
        : 0;
    }

    // z = (ln(target/price) − drift·h) / (vol·√h); P(end ≥ target) = 1 − Φ(z).
    const z =
      (Math.log(target / price) - dailyDrift * horizonDays) / sigma;
    const probAtOrAbove = 1 - this.standardNormalCdf(z);

    return target >= price ? probAtOrAbove : 1 - probAtOrAbove;
  }

  /** Convert daily volatility to annualised (252 trading days). */
  public annualise(dailyVolatility: number): number {
    return dailyVolatility * Math.sqrt(252);
  }

  /** Standard normal CDF: Φ(x) = ½(1 + erf(x/√2)). */
  private standardNormalCdf(x: number): number {
    return 0.5 * (1 + this.erf(x / Math.SQRT2));
  }

  /** Abramowitz & Stegun 7.1.26 erf approximation (max error ~1.5e-7). */
  private erf(x: number): number {
    const sign = x >= 0 ? 1 : -1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-ax * ax);

    return sign * y;
  }

  /** Box-Muller transform for a standard normal sample. */
  private sampleStandardNormal(): number {
    let u = 0;
    let v = 0;

    while (u === 0) {
      u = Math.random();
    }
    while (v === 0) {
      v = Math.random();
    }

    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
