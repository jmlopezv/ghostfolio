import {
  SIGNAL_REGIME_VIX_RISK_OFF,
  SIGNAL_REGIME_VIX_RISK_ON
} from '@ghostfolio/common/config';

import {
  classifyRegime,
  isLeaderScreenDue,
  isMonthlyPlanDue,
  lastLeaderScreenSlot,
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

describe('lastLeaderScreenSlot', () => {
  // Local time throughout: the cron that this mirrors is local-time too.
  const slot = (now: Date) =>
    lastLeaderScreenSlot({ hour: 22, minute: 40, now });

  it('returns today when the slot has already passed', () => {
    // Monday 2026-08-24, 23:30 local -> that evening's 22:40.
    const result = slot(new Date(2026, 7, 24, 23, 30));

    expect(result.getDate()).toBe(24);
    expect(result.getHours()).toBe(22);
    expect(result.getMinutes()).toBe(40);
  });

  it('steps back a day when the slot has not arrived yet', () => {
    // Monday 10:49 local - the exact time the API was found running with no
    // screen ever having fired.
    const result = slot(new Date(2026, 7, 24, 10, 49));

    expect(result.getDate()).toBe(21);
  });

  it('skips the weekend back to Friday', () => {
    // Sunday 2026-08-23, 12:00 local.
    const result = slot(new Date(2026, 7, 23, 12, 0));

    expect(result.getDate()).toBe(21);
    expect(result.getDay()).toBe(5);
  });

  it('treats Saturday morning as Friday evening, not Saturday', () => {
    const result = slot(new Date(2026, 7, 22, 9, 0));

    expect(result.getDate()).toBe(21);
  });
});

describe('isLeaderScreenDue', () => {
  const due = (now: Date, lastRunAt?: string) =>
    isLeaderScreenDue({ hour: 22, lastRunAt, minute: 40, now });

  it('is due when the screen has never run', () => {
    expect(due(new Date(2026, 7, 24, 10, 49))).toBe(true);
  });

  it('is due when the last run predates the most recent slot', () => {
    // Booting Monday morning after Friday evening's slot was missed - the
    // laptop-asleep case that made the alert silently never fire.
    expect(
      due(
        new Date(2026, 7, 24, 10, 49),
        new Date(2026, 7, 20, 22, 41).toISOString()
      )
    ).toBe(true);
  });

  it('is not due when the most recent slot has already been served', () => {
    expect(
      due(
        new Date(2026, 7, 24, 10, 49),
        new Date(2026, 7, 21, 22, 41).toISOString()
      )
    ).toBe(false);
  });

  it('does not re-run on a second restart minutes later', () => {
    const firstRun = new Date(2026, 7, 24, 10, 50);

    expect(due(new Date(2026, 7, 24, 10, 55), firstRun.toISOString())).toBe(
      false
    );
  });

  it('is due when the stored timestamp is unparseable', () => {
    expect(due(new Date(2026, 7, 24, 10, 49), 'not-a-date')).toBe(true);
  });
});
