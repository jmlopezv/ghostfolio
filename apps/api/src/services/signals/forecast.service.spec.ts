import { ForecastService } from './forecast.service';

describe('ForecastService', () => {
  let service: ForecastService;

  beforeEach(() => {
    service = new ForecastService();
  });

  describe('ewmaVolatility', () => {
    it('returns 0 for a series of zero returns', () => {
      expect(service.ewmaVolatility([0, 0, 0, 0])).toBe(0);
    });

    it('returns a positive number for varying returns', () => {
      expect(
        service.ewmaVolatility([0.01, -0.02, 0.015, -0.01])
      ).toBeGreaterThan(0);
    });
  });

  describe('expectedMoveBand', () => {
    it('collapses to the price when drift and volatility are zero', () => {
      const band = service.expectedMoveBand({
        dailyDrift: 0,
        dailyVolatility: 0,
        horizonDays: 20,
        price: 100
      });

      expect(band.lower).toBeCloseTo(100);
      expect(band.upper).toBeCloseTo(100);
      expect(band.expected).toBeCloseTo(100);
    });

    it('widens the band with volatility', () => {
      const band = service.expectedMoveBand({
        dailyDrift: 0,
        dailyVolatility: 0.02,
        horizonDays: 20,
        price: 100
      });

      expect(band.lower).toBeLessThan(100);
      expect(band.upper).toBeGreaterThan(100);
    });
  });

  describe('hitTargetProbability', () => {
    it('returns 1 when the target equals the price (deterministic)', () => {
      expect(
        service.hitTargetProbability({
          dailyDrift: 0,
          dailyVolatility: 0,
          horizonDays: 20,
          price: 100,
          target: 100
        })
      ).toBe(1);
    });

    it('returns 0 for an unreachable target with no drift or volatility', () => {
      expect(
        service.hitTargetProbability({
          dailyDrift: 0,
          dailyVolatility: 0,
          horizonDays: 20,
          price: 100,
          target: 130
        })
      ).toBe(0);
    });

    it('returns a probability in [0, 1] under volatility', () => {
      const probability = service.hitTargetProbability({
        dailyDrift: 0,
        dailyVolatility: 0.02,
        horizonDays: 20,
        paths: 500,
        price: 100,
        target: 105
      });

      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(1);
    });
  });

  describe('volatilityTargetedAmount', () => {
    it('allocates less to more volatile names', () => {
      const calm = service.volatilityTargetedAmount({
        annualVolatility: 0.1,
        budget: 1000
      });
      const volatile = service.volatilityTargetedAmount({
        annualVolatility: 1.0,
        budget: 1000
      });

      expect(volatile).toBeLessThan(calm);
    });

    it('never exceeds the budget times the max fraction', () => {
      const amount = service.volatilityTargetedAmount({
        annualVolatility: 0,
        budget: 1000
      });

      expect(amount).toBeLessThanOrEqual(250);
    });
  });

  describe('reachProbability', () => {
    it('returns a probability in [0, 1]', () => {
      const p = service.reachProbability({
        dailyDrift: 0,
        dailyVolatility: 0.02,
        horizonDays: 15,
        price: 100,
        target: 108
      });

      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    });

    it('is lower for a more distant up-target', () => {
      const near = service.reachProbability({
        dailyDrift: 0,
        dailyVolatility: 0.02,
        horizonDays: 15,
        price: 100,
        target: 103
      });
      const far = service.reachProbability({
        dailyDrift: 0,
        dailyVolatility: 0.02,
        horizonDays: 15,
        price: 100,
        target: 120
      });

      expect(far).toBeLessThan(near);
    });

    it('is ~50% for the current price with no drift', () => {
      const p = service.reachProbability({
        dailyDrift: 0,
        dailyVolatility: 0.02,
        horizonDays: 15,
        price: 100,
        target: 100
      });

      expect(p).toBeCloseTo(0.5, 1);
    });
  });
});
