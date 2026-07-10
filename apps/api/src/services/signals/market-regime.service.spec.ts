import {
  SIGNAL_REGIME_VIX_RISK_OFF,
  SIGNAL_REGIME_VIX_RISK_ON
} from '@ghostfolio/common/config';

import {
  classifyRegime,
  isMonthlyPlanDue,
  regimeAdvice
} from './market-regime.service';

describe('classifyRegime', () => {
  it('is RISK_OFF when the VIX is at/above the risk-off threshold', () => {
    expect(
      classifyRegime({
        indexPrice: 5000,
        indexSma200: 4800,
        vix: SIGNAL_REGIME_VIX_RISK_OFF
      })
    ).toBe('RISK_OFF');
  });

  it('is RISK_OFF when the index is below its 200-day average, even with a calm VIX', () => {
    expect(
      classifyRegime({ indexPrice: 4700, indexSma200: 4800, vix: 14 })
    ).toBe('RISK_OFF');
  });

  it('is RISK_ON only with a calm VIX AND the index above its 200-day', () => {
    expect(
      classifyRegime({
        indexPrice: 5000,
        indexSma200: 4800,
        vix: SIGNAL_REGIME_VIX_RISK_ON - 0.01
      })
    ).toBe('RISK_ON');
  });

  it('is NEUTRAL for an elevated-but-not-extreme VIX in an uptrend', () => {
    expect(
      classifyRegime({ indexPrice: 5000, indexSma200: 4800, vix: 25 })
    ).toBe('NEUTRAL');
    // Boundary: vix exactly at the risk-on threshold is no longer RISK_ON.
    expect(
      classifyRegime({
        indexPrice: 5000,
        indexSma200: 4800,
        vix: SIGNAL_REGIME_VIX_RISK_ON
      })
    ).toBe('NEUTRAL');
  });

  it('every regime has one-line advice', () => {
    for (const regime of ['RISK_OFF', 'NEUTRAL', 'RISK_ON'] as const) {
      expect(regimeAdvice(regime).length).toBeGreaterThan(10);
    }
  });
});

describe('isMonthlyPlanDue', () => {
  it('fires on/after the 25th when not yet sent this month', () => {
    expect(
      isMonthlyPlanDue({
        currentMonth: '2026-07',
        dayOfMonth: 25,
        lastSentMonth: '2026-06'
      })
    ).toBe(true);
    expect(
      isMonthlyPlanDue({
        currentMonth: '2026-07',
        dayOfMonth: 28,
        lastSentMonth: undefined
      })
    ).toBe(true);
  });

  it('does not fire before the 25th or twice in a month', () => {
    expect(
      isMonthlyPlanDue({
        currentMonth: '2026-07',
        dayOfMonth: 24,
        lastSentMonth: '2026-06'
      })
    ).toBe(false);
    expect(
      isMonthlyPlanDue({
        currentMonth: '2026-07',
        dayOfMonth: 26,
        lastSentMonth: '2026-07'
      })
    ).toBe(false);
  });
});
