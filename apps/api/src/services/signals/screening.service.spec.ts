import {
  SIGNAL_SCREEN_ANALYST_TREND_DELTA,
  SIGNAL_SCREEN_SECTOR_TAILWIND_PCT
} from '@ghostfolio/common/config';

import {
  classifyAnalystTrend,
  classifyEpsRevision,
  classifySectorTailwind,
  daysUntil,
  netBuyRatio
} from './screening.service';

describe('netBuyRatio', () => {
  it('weights strong opinions double and dilutes by holds', () => {
    // (2*2 + 3 - 1 - 2*1) / 10 = 4/10
    expect(
      netBuyRatio({ buy: 3, hold: 3, sell: 1, strongBuy: 2, strongSell: 1 })
    ).toBeCloseTo(0.4);
  });

  it('is null when no analyst covers the name', () => {
    expect(
      netBuyRatio({ buy: 0, hold: 0, sell: 0, strongBuy: 0, strongSell: 0 })
    ).toBeNull();
  });

  it('treats a missing hold count as zero (Finnhub rows always carry it, Yahoo rows too — defensive)', () => {
    expect(
      netBuyRatio({ buy: 1, sell: 0, strongBuy: 0, strongSell: 0 })
    ).toBeCloseTo(1);
  });
});

describe('classifyAnalystTrend', () => {
  it('is IMPROVING when the net-buy ratio rose by at least the delta', () => {
    expect(
      classifyAnalystTrend(0.5, 0.5 - SIGNAL_SCREEN_ANALYST_TREND_DELTA)
    ).toBe('IMPROVING');
  });

  it('is DETERIORATING when the ratio fell by at least the delta', () => {
    expect(
      classifyAnalystTrend(0.1, 0.1 + SIGNAL_SCREEN_ANALYST_TREND_DELTA)
    ).toBe('DETERIORATING');
  });

  it('is FLAT for a sub-threshold move', () => {
    expect(classifyAnalystTrend(0.52, 0.5)).toBe('FLAT');
  });

  it('is null when either month is missing (new coverage, no history)', () => {
    expect(classifyAnalystTrend(0.5, null)).toBeNull();
    expect(classifyAnalystTrend(null, 0.5)).toBeNull();
  });
});

describe('classifyEpsRevision', () => {
  it('is UP when the current-year estimate rose more than the threshold', () => {
    expect(classifyEpsRevision(1.05, 1.0)).toBe('UP');
  });

  it('is DOWN when the estimate was cut more than the threshold', () => {
    expect(classifyEpsRevision(0.9, 1.0)).toBe('DOWN');
  });

  it('is FLAT for a sub-threshold revision', () => {
    expect(classifyEpsRevision(1.01, 1.0)).toBe('FLAT');
  });

  it('handles negative estimates by scaling on the absolute base (a loss cut deeper = DOWN)', () => {
    expect(classifyEpsRevision(-1.1, -1.0)).toBe('DOWN');
  });

  it('is null when either estimate is missing or the base is zero', () => {
    expect(classifyEpsRevision(null, 1)).toBeNull();
    expect(classifyEpsRevision(1, null)).toBeNull();
    expect(classifyEpsRevision(1, 0)).toBeNull();
  });
});

describe('classifySectorTailwind', () => {
  it('is RISING when category peers average above the threshold', () => {
    expect(
      classifySectorTailwind([
        SIGNAL_SCREEN_SECTOR_TAILWIND_PCT + 5,
        SIGNAL_SCREEN_SECTOR_TAILWIND_PCT + 1
      ])
    ).toBe('RISING');
  });

  it('is FALLING when peers average below the negative threshold', () => {
    expect(classifySectorTailwind([-10, -4])).toBe('FALLING');
  });

  it('is MIXED inside the neutral band', () => {
    expect(classifySectorTailwind([2, -1])).toBe('MIXED');
  });

  it('ignores non-finite entries and is null when nothing usable remains', () => {
    expect(classifySectorTailwind([NaN, Infinity])).toBeNull();
    expect(classifySectorTailwind([])).toBeNull();
  });
});

describe('daysUntil', () => {
  it('counts whole days from now to the date', () => {
    expect(daysUntil('2026-07-24', new Date('2026-07-14T00:00:00Z'))).toBe(10);
  });

  it('is negative for a date already past', () => {
    expect(daysUntil('2026-07-10', new Date('2026-07-14T00:00:00Z'))).toBe(-4);
  });
});
