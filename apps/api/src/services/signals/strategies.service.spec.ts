import { StrategiesService, StrategyCandidate } from './strategies.service';

describe('StrategiesService', () => {
  let service: StrategiesService;

  beforeEach(() => {
    service = new StrategiesService();
  });

  const candidate = (
    symbol: string,
    category: string,
    priceInBase: number,
    score: number,
    overrides: Partial<StrategyCandidate> = {}
  ): StrategyCandidate => ({
    aboveSma200: true,
    annualVol: 0.3,
    category,
    dropPct: 5,
    isBuyZone: false,
    isDowntrend: false,
    isReversal: false,
    name: symbol,
    newsScore: null,
    pctB: 0.3,
    priceInBase,
    reachProbability: 0.5,
    rsi: 40,
    score,
    stopLossPct: 0.06,
    symbol,
    targetGainPct: 0.1,
    ...overrides
  });

  describe('buildStrategies', () => {
    it('fits whole shares within budget and deducts the fee', () => {
      const strategies = service.buildStrategies({
        candidates: [candidate('NVDA', 'tech', 212, 80)],
        cash: 250
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');
      const leg = aggressive.legs[0];

      expect(leg.shares).toBe(1); // floor(250 / 212)
      expect(leg.fee).toBe(5);
      expect(leg.cost).toBeCloseTo(217); // 212 + 5 fee
      expect(aggressive.cashLeft).toBeCloseTo(33);
    });

    it('skips an unaffordable whole share (zero shares, no fee)', () => {
      const strategies = service.buildStrategies({
        candidates: [candidate('GOOGL', 'tech', 370, 90)],
        cash: 250
      });

      const leg = strategies.find((s) => s.name === 'Aggressive').legs[0];

      expect(leg.shares).toBe(0);
      expect(leg.fee).toBe(0);
      expect(leg.cost).toBe(0);
    });

    it('always includes a Safe 80/20 with an 80% index leg', () => {
      const strategies = service.buildStrategies({
        candidates: [candidate('NVDA', 'tech', 100, 80)],
        cash: 1000
      });

      const safe = strategies.find((s) => s.name === 'Safe 80/20');
      const indexLeg = safe.legs[0];

      expect(indexLeg.symbol).toBe('NORDNET_GLOBAL_INDEX');
      expect(indexLeg.cost).toBeCloseTo(800); // 80% of 1000
    });

    it('diversifies Spread across distinct categories', () => {
      const strategies = service.buildStrategies({
        candidates: [
          candidate('NVDA', 'tech', 100, 90),
          candidate('AMD', 'tech', 100, 85), // same category — should be skipped
          candidate('JPM', 'bank', 100, 80),
          candidate('XOM', 'energy-petrol', 100, 75)
        ],
        cash: 900
      });

      const spread = strategies.find((s) => s.name === 'Spread');
      const categories = spread.legs.map((leg) => leg.category);

      expect(new Set(categories).size).toBe(categories.length); // all distinct
      expect(categories).toContain('tech');
      expect(categories).toContain('bank');
      expect(categories).toContain('energy-petrol');
    });

    it('produces only Safe 80/20 when there are no candidates', () => {
      const strategies = service.buildStrategies({ candidates: [], cash: 500 });

      expect(strategies).toHaveLength(1);
      expect(strategies[0].name).toBe('Safe 80/20');
    });
  });

  describe('splitRebalanceCash', () => {
    it('directs cash to the under-weight funds sleeve', () => {
      // funds far below the 67% target → all new cash should go to funds.
      const { fundsCash, stocksCash } = service.splitRebalanceCash({
        cash: 250,
        fundsRatio: 0.67,
        fundsValue: 0,
        stocksValue: 1000
      });

      expect(fundsCash).toBe(250);
      expect(stocksCash).toBe(0);
    });

    it('directs cash to stocks when funds are already over target', () => {
      const { fundsCash, stocksCash } = service.splitRebalanceCash({
        cash: 250,
        fundsRatio: 0.67,
        fundsValue: 2000,
        stocksValue: 0
      });

      expect(fundsCash).toBe(0);
      expect(stocksCash).toBe(250);
    });

    it('splits partially toward the target', () => {
      // total after = 600; target funds = 402; gap = 402 - 300 = 102.
      const { fundsCash, stocksCash } = service.splitRebalanceCash({
        cash: 200,
        fundsRatio: 0.67,
        fundsValue: 300,
        stocksValue: 100
      });

      expect(fundsCash).toBeCloseTo(102);
      expect(stocksCash).toBeCloseTo(98);
    });
  });

  describe('recommendFunds', () => {
    const f = (symbol: string, category: string, feePct: number) => ({
      category,
      currency: 'SEK',
      feePct,
      name: symbol,
      symbol
    });

    it('picks one fund per category, under-weight first then lower fee', () => {
      const picks = service.recommendFunds({
        candidates: [
          f('A', 'global', 0.2),
          f('B', 'global', 0.1), // cheaper global → preferred over A
          f('C', 'em', 0.4),
          f('D', 'usa', 0.2)
        ],
        count: 3,
        valueByCategory: { global: 1000, usa: 0, em: 0 }
      });

      expect(picks.map((p) => p.symbol)).not.toContain('A'); // B beats A on fee
      expect(picks).toHaveLength(3);
      // global is over-owned → should come last among the three.
      expect(picks[picks.length - 1].category).toBe('global');
    });

    it('prefers better risk-adjusted momentum over lower fee within a category', () => {
      const picks = service.recommendFunds({
        candidates: [
          { ...f('CHEAP', 'global', 0.1), riskAdjustedMomentum: 0.5 },
          { ...f('STRONG', 'global', 0.3), riskAdjustedMomentum: 1.8 }
        ],
        count: 1,
        valueByCategory: {}
      });

      expect(picks[0].symbol).toBe('STRONG');
    });

    it('a candidate with metrics beats one without; fee breaks metric-less ties', () => {
      const withVsWithout = service.recommendFunds({
        candidates: [
          f('NOMETRICS', 'em', 0.1),
          { ...f('MEASURED', 'em', 0.4), riskAdjustedMomentum: 0.2 }
        ],
        count: 1,
        valueByCategory: {}
      });

      expect(withVsWithout[0].symbol).toBe('MEASURED');

      const feeTiebreak = service.recommendFunds({
        candidates: [f('EXPENSIVE', 'usa', 0.5), f('CHEAP', 'usa', 0.15)],
        count: 1,
        valueByCategory: {}
      });

      expect(feeTiebreak[0].symbol).toBe('CHEAP');
    });

    describe('graduated overlap penalty (balances "best buy" vs. real fund overlap)', () => {
      const holding = (name: string, weight: number) => ({ name, weight });

      it('a candidate with no owned overlap anywhere is unaffected (no penalty)', () => {
        const picks = service.recommendFunds({
          candidates: [
            { ...f('NEW', 'global', 0.2), riskAdjustedMomentum: 1.5 }
          ],
          count: 1,
          holdingsBySymbol: { NEW: [holding('Nvidia', 0.5)] },
          valueByCategory: {},
          valueBySymbol: { OTHER: 1000 } // owned, but OTHER has no holdings entry
        });

        expect(picks[0].effectiveMomentum).toBe(1.5);
        expect(picks[0].overlapExposurePct ?? 0).toBe(0);
      });

      it('100% overlap with a SMALL existing position is barely penalized (reinvestment stays cheap)', () => {
        const picks = service.recommendFunds({
          candidates: [
            { ...f('SAME', 'global', 0.2), riskAdjustedMomentum: 1.0 }
          ],
          count: 1,
          // SAME already owned, but only $10 of a $1000 sleeve (1%).
          holdingsBySymbol: { SAME: [holding('Nvidia', 1)] },
          valueByCategory: {},
          valueBySymbol: { SAME: 10, OTHER: 990 }
        });

        expect(picks[0].overlapExposurePct).toBeCloseTo(1, 0); // ~1% exposure
        expect(picks[0].effectiveMomentum).toBeGreaterThan(0.98); // barely nudged
      });

      it('100% overlap with a LARGE existing position is floored, never zeroed', () => {
        const picks = service.recommendFunds({
          candidates: [
            { ...f('SAME', 'global', 0.2), riskAdjustedMomentum: 1.0 }
          ],
          count: 1,
          // SAME already owned at $700 of a $1000 sleeve (70%) — well past the
          // point where the floor multiplier (0.4) applies.
          holdingsBySymbol: { SAME: [holding('Nvidia', 1)] },
          valueByCategory: {},
          valueBySymbol: { SAME: 700, OTHER: 300 }
        });

        expect(picks[0].overlapExposurePct).toBeCloseTo(70, 0);
        expect(picks[0].effectiveMomentum).toBeCloseTo(0.4, 5); // floored, not 0
      });

      it('still buys the best: a much stronger momentum edge survives the floor and wins its category', () => {
        const picks = service.recommendFunds({
          candidates: [
            // Heavily overlapping an existing large position → floored at 0.4x,
            // but its raw momentum is so much higher it still wins.
            {
              ...f('STRONG-OVERLAP', 'global', 0.2),
              riskAdjustedMomentum: 3.0
            },
            { ...f('WEAK-FRESH', 'global', 0.2), riskAdjustedMomentum: 0.5 }
          ],
          count: 1,
          holdingsBySymbol: { 'STRONG-OVERLAP': [holding('Nvidia', 1)] },
          valueByCategory: {},
          valueBySymbol: { 'STRONG-OVERLAP': 700, OTHER: 300 }
        });

        // effectiveMomentum: 3.0 * 0.4 = 1.2, still > 0.5 (no overlap data for WEAK-FRESH).
        expect(picks[0].symbol).toBe('STRONG-OVERLAP');
      });

      it('a close call flips toward the less-concentrated pick', () => {
        const picks = service.recommendFunds({
          candidates: [
            { ...f('OVERLAP', 'global', 0.2), riskAdjustedMomentum: 1.0 },
            { ...f('FRESH', 'global', 0.2), riskAdjustedMomentum: 0.9 }
          ],
          count: 1,
          holdingsBySymbol: { OVERLAP: [holding('Nvidia', 1)] },
          valueByCategory: {},
          // 70% exposure -> OVERLAP floored to 1.0 * 0.4 = 0.4, below FRESH's 0.9.
          valueBySymbol: { OVERLAP: 700, OTHER: 300 }
        });

        expect(picks[0].symbol).toBe('FRESH');
      });

      it('omitting holdingsBySymbol/valueBySymbol is a no-op (existing recommendFunds tests stay unchanged)', () => {
        const picks = service.recommendFunds({
          candidates: [
            { ...f('CHEAP', 'global', 0.1), riskAdjustedMomentum: 0.5 },
            { ...f('STRONG', 'global', 0.3), riskAdjustedMomentum: 1.8 }
          ],
          count: 1,
          valueByCategory: {}
        });

        expect(picks[0].symbol).toBe('STRONG');
        expect(picks[0].effectiveMomentum).toBe(1.8);
      });
    });
  });

  describe('sizeFundPicks', () => {
    it('splits cash evenly across funds', () => {
      const picks = service.sizeFundPicks(
        [
          {
            category: 'global',
            currency: 'SEK',
            feePct: 0.2,
            name: 'G',
            symbol: 'G'
          },
          {
            category: 'usa',
            currency: 'SEK',
            feePct: 0.2,
            name: 'U',
            symbol: 'U'
          }
        ],
        300
      );

      expect(picks).toHaveLength(2);
      expect(picks[0].amount).toBe(150);
      expect(picks[1].amount).toBe(150);
    });
  });

  describe('expectedValue + conviction', () => {
    it('EV and conviction rise with the probability of a gain', () => {
      const low = candidate('A', 'tech', 100, 70, { reachProbability: 0.1 });
      const high = candidate('A', 'tech', 100, 70, { reachProbability: 0.9 });

      expect(service.expectedValue(high)).toBeGreaterThan(
        service.expectedValue(low)
      );
      expect(service.computeConviction(high)).toBeGreaterThan(
        service.computeConviction(low)
      );
    });

    it('EV = p·gain − (1−p)·loss', () => {
      const c = candidate('A', 'tech', 100, 70, {
        reachProbability: 0.6,
        stopLossPct: 0.05,
        targetGainPct: 0.1
      });

      // 0.6·0.10 − 0.4·0.05 = 0.06 − 0.02 = 0.04
      expect(service.expectedValue(c)).toBeCloseTo(0.04);
    });

    it('rewards a buy-zone setup', () => {
      const base = service.computeConviction(candidate('A', 'tech', 100, 70));
      const zone = service.computeConviction(
        candidate('A', 'tech', 100, 70, { isBuyZone: true })
      );

      expect(zone).toBeGreaterThan(base);
    });
  });

  describe('buildStrategies — conviction ranking + recent-signal control', () => {
    it('ranks the highest-conviction name into Aggressive, not just first', () => {
      const strategies = service.buildStrategies({
        candidates: [
          candidate('LOW', 'tech', 100, 60, { reachProbability: 0.2 }),
          candidate('HIGH', 'bank', 100, 60, {
            isBuyZone: true,
            reachProbability: 0.9
          })
        ],
        cash: 1000
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');
      expect(aggressive.legs[0].symbol).toBe('HIGH');
      expect(aggressive.legs[0].conviction).toBeGreaterThan(0);
      expect(aggressive.legs[0].rationale).toContain('conviction');
    });

    it('excludes downtrends and recently-exited names from the picks', () => {
      const strategies = service.buildStrategies({
        candidates: [
          candidate('DOWN', 'tech', 100, 95, { isDowntrend: true }),
          candidate('SOLD', 'bank', 100, 95, { recentlyExited: true }),
          candidate('OK', 'energy-petrol', 100, 70)
        ],
        cash: 1000
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');
      expect(aggressive.legs[0].symbol).toBe('OK');
    });

    it('allows a confirmed reversal despite the downtrend, flagged in rationale', () => {
      const strategies = service.buildStrategies({
        candidates: [
          candidate('REV', 'tech', 100, 70, {
            isDowntrend: true,
            isReversal: true,
            reachProbability: 0.6
          })
        ],
        cash: 1000
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');
      expect(aggressive.legs[0].symbol).toBe('REV');
      expect(aggressive.legs[0].rationale).toContain('REVERSAL');
    });

    it('excludes wildly volatile names above the liquidity cap', () => {
      const strategies = service.buildStrategies({
        candidates: [
          candidate('WILD', 'tech', 100, 95, {
            annualVol: 1.5,
            reachProbability: 0.9
          }),
          candidate('CALM', 'bank', 100, 70, { annualVol: 0.25 })
        ],
        cash: 1000
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');
      expect(aggressive.legs[0].symbol).toBe('CALM');
    });

    it('tags a re-confirmed recent BUY in the rationale', () => {
      const strategies = service.buildStrategies({
        candidates: [candidate('RC', 'tech', 100, 70, { recentBuyDays: 3 })],
        cash: 1000
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');
      expect(aggressive.legs[0].rationale).toContain('re-confirmed');
    });
  });

  describe('buildStrategies — fee-aware sizing, remainder minimization, redundancy', () => {
    it('reduces the ticker count on Spread when fees would exceed the max ratio', () => {
      // 5 legs x $5 fee = $25; $25/200 = 12.5% > 10% -> drop to 4: 4x5/200 = 10%, passes.
      const strategies = service.buildStrategies({
        candidates: [
          candidate('A', 'tech', 40, 90),
          candidate('B', 'bank', 40, 89),
          candidate('C', 'health', 40, 88),
          candidate('D', 'energy-petrol', 40, 87),
          candidate('E', 'defense', 40, 86)
        ],
        cash: 200
      });

      const spread = strategies.find((s) => s.name === 'Spread');

      expect(spread.legs).toHaveLength(4);
      expect(spread.description).toContain('Reduced from 5 to 4 picks');
    });

    it('exempts Aggressive from fee-ratio reduction (still attempts its single leg)', () => {
      // Fee alone ($5) is far above 10% of a $6 budget, but Aggressive is a
      // single ticker by design — sizeForFees must not run on this path.
      const strategies = service.buildStrategies({
        candidates: [candidate('ONLY', 'tech', 5, 70)],
        cash: 6
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');

      expect(aggressive.legs).toHaveLength(1);
      expect(aggressive.legs[0].symbol).toBe('ONLY');
    });

    it('minimizes aggregate leftover cash vs. a naive even split, without double-charging the fee', () => {
      // netCapital = 465 - 3x$5 fee = 450. evenBudget = 150/leg.
      // CHEAP(40): floor(150/40)=3 shares, cost=125, wastes 25 of its slice.
      // MID/MID2(76): floor(150/76)=1 share, cost=81 each, wastes ~69 each.
      // Naive (no 2nd pass) leftover = 450 - (125+81+81) = 163.
      // Greedy 2nd pass repeatedly hands the pooled leftover to CHEAP (the
      // cheapest, highest-ranked leg) until nothing more fits: ends at 7
      // shares / cost 285, leftover down to 3 — far below the naive 163 —
      // and CHEAP's fee is still exactly $5, never doubled.
      const candidates = [
        candidate('CHEAP', 'tech', 40, 90),
        candidate('MID', 'bank', 76, 89),
        candidate('MID2', 'health', 76, 88)
      ];
      const strategies = service.buildStrategies({
        candidates,
        cash: 465
      });

      const spread = strategies.find((s) => s.name === 'Spread');
      const cheapLeg = spread.legs.find((leg) => leg.symbol === 'CHEAP');

      expect(spread.cashLeft).toBeLessThan(163);
      expect(cheapLeg.shares).toBe(7);
      expect(cheapLeg.fee).toBe(5); // fee never doubled despite receiving extra shares
    });

    it('de-prioritizes a candidate whose category dominates the fund sleeve', () => {
      const strategies = service.buildStrategies({
        candidates: [
          candidate('OVERLAP', 'global', 100, 70, { reachProbability: 0.55 }),
          candidate('FRESH', 'bank', 100, 70, { reachProbability: 0.5 })
        ],
        cash: 1000,
        fundValueByCategory: { global: 450, other: 550 } // global = 45% > 40% threshold
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');

      expect(aggressive.legs[0].symbol).toBe('FRESH');
      expect(aggressive.legs[0].rationale).not.toContain('redundant');

      // Only 2 distinct categories present -> Balanced builds, Spread (needs >=3) doesn't.
      const balanced = strategies.find((s) => s.name === 'Balanced');
      const overlapLeg = balanced.legs.find((leg) => leg.symbol === 'OVERLAP');
      expect(overlapLeg.rationale).toContain('redundant');
    });

    it('de-prioritizes redundancy without excluding a very high-EV candidate', () => {
      const strategies = service.buildStrategies({
        candidates: [
          candidate('STRONG-OVERLAP', 'global', 100, 90, {
            reachProbability: 0.95
          }),
          candidate('WEAK', 'bank', 100, 60, { reachProbability: 0.3 })
        ],
        cash: 1000,
        fundValueByCategory: { global: 450, other: 550 }
      });

      const balanced = strategies.find((s) => s.name === 'Balanced');
      const symbols = balanced.legs.map((leg) => leg.symbol);

      expect(symbols).toContain('STRONG-OVERLAP'); // never excluded
    });

    it('omitting fundValueByCategory is a no-op (existing tests stay unchanged)', () => {
      const strategies = service.buildStrategies({
        candidates: [candidate('A', 'tech', 100, 80)],
        cash: 250
      });

      const aggressive = strategies.find((s) => s.name === 'Aggressive');
      expect(aggressive.legs[0].rationale).not.toContain('redundant');
    });
  });
});
