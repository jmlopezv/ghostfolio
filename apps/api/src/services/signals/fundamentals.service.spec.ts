import {
  FundamentalsService,
  normalizeForwardPE
} from './fundamentals.service';

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

  describe('normalizeForwardPE', () => {
    it('rescales a pence-denominated LSE multiple', () => {
      // AZN.L reports 1065.22 for a real 10.7.
      expect(normalizeForwardPE(1065.2203, 'GBp')).toBeCloseTo(10.65, 2);
    });

    it('leaves an LSE multiple that already arrived in pounds alone', () => {
      // UKW.L and BBOX.L come through un-inflated despite the GBp label.
      expect(normalizeForwardPE(9.48638, 'GBp')).toBeCloseTo(9.486, 3);
      expect(normalizeForwardPE(16.7563, 'GBp')).toBeCloseTo(16.756, 3);
    });

    it('leaves a EUR-quoted LSE line alone', () => {
      // MTLN.L lists in London but quotes in euros.
      expect(normalizeForwardPE(9.321411, 'EUR')).toBeCloseTo(9.321, 3);
    });

    it('never rescales a non-GBp currency, however large the multiple', () => {
      expect(normalizeForwardPE(180, 'USD')).toBe(180);
      expect(normalizeForwardPE(180, 'SEK')).toBe(180);
    });

    it('discards rather than inventing a bargain out of a genuine 100x name', () => {
      // 120x / 100 = 1.2x, which is not a cheap stock, it is a bad divide.
      expect(normalizeForwardPE(120, 'GBp')).toBeNull();
    });

    it('passes through missing values', () => {
      expect(normalizeForwardPE(null, 'GBp')).toBeNull();
      expect(normalizeForwardPE(undefined, 'GBp')).toBeNull();
      expect(normalizeForwardPE(12, null)).toBe(12);
    });

    it('leaves a negative multiple negative so the flat penalty still applies', () => {
      expect(normalizeForwardPE(-5, 'GBp')).toBe(-5);
    });
  });
});
