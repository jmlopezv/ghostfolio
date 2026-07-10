import { FundamentalsService } from './fundamentals.service';

describe('FundamentalsService', () => {
  let service: FundamentalsService;

  beforeEach(() => {
    // computeScore is pure (no I/O) — a stub is enough for the Redis dependency.
    service = new FundamentalsService({} as any);
  });

  describe('computeScore', () => {
    it('rewards a cheap, profitable, growing, well-rated stock', () => {
      const score = service.computeScore({
        analystNetBuyRatio: 1.5,
        debtToEquity: 40,
        earningsGrowth: 0.2,
        forwardPE: 12,
        returnOnEquity: 0.25
      });

      expect(score).toBeGreaterThan(75);
    });

    it('penalizes an expensive, unprofitable, shrinking, poorly-rated stock', () => {
      const score = service.computeScore({
        analystNetBuyRatio: -1.5,
        debtToEquity: 300,
        earningsGrowth: -0.3,
        forwardPE: 60,
        returnOnEquity: -0.1
      });

      expect(score).toBeLessThan(25);
    });

    it('flat-penalizes an unprofitable-on-a-forward-basis stock (P/E <= 0)', () => {
      const score = service.computeScore({
        analystNetBuyRatio: null,
        debtToEquity: null,
        earningsGrowth: null,
        forwardPE: -5,
        returnOnEquity: null
      });

      expect(score).toBe(20);
    });

    it('re-normalizes over whichever inputs are available', () => {
      // Only ROE available (50%) -> quality-only score, not diluted toward 0.
      const score = service.computeScore({
        analystNetBuyRatio: null,
        debtToEquity: null,
        earningsGrowth: null,
        forwardPE: null,
        returnOnEquity: 0.3
      });

      expect(score).toBe(80); // 50 + 0.3*100 = 80, full weight since it's the only input
    });

    it('returns null when every input is missing', () => {
      const score = service.computeScore({
        analystNetBuyRatio: null,
        debtToEquity: null,
        earningsGrowth: null,
        forwardPE: null,
        returnOnEquity: null
      });

      expect(score).toBeNull();
    });

    it('clamps extreme inputs within [0, 100]', () => {
      const score = service.computeScore({
        analystNetBuyRatio: 10,
        debtToEquity: 0,
        earningsGrowth: 5,
        forwardPE: 1,
        returnOnEquity: 5
      });

      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });
});
