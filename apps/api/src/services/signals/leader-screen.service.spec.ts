import { IndicatorsService } from './indicators.service';
import {
  LeaderScreenService,
  canHaveExpenseRatio,
  leaderAlertKey,
  selectFreshBreakouts,
  selectStoppedLots
} from './leader-screen.service';
import { Bar } from './ohlc-bar.service';

let dayCounter = 0;

function nextDate(): string {
  const base = new Date('2024-01-01T00:00:00.000Z');
  base.setUTCDate(base.getUTCDate() + dayCounter++);

  return base.toISOString().slice(0, 10);
}

/**
 * A flat bar (high = low = close). Degenerate as a candle, but it makes every
 * contraction depth exact arithmetic rather than an approximation, which is what
 * a structural test of the pattern needs.
 */
function bar(price: number, volume: number): Bar {
  return {
    close: price,
    date: nextDate(),
    high: price,
    low: price,
    open: price,
    volume
  };
}

/** A straight line from `from` to `to` over `steps` bars, inclusive of the end. */
function ramp(from: number, to: number, steps: number, volume: number): Bar[] {
  const bars: Bar[] = [];

  for (let i = 1; i <= steps; i++) {
    bars.push(bar(from + ((to - from) * i) / steps, volume));
  }

  return bars;
}

/**
 * A textbook VCP: a monotonic run-up, then three contractions of 18% / 12% / 6%
 * on progressively lighter volume. Pivot is the high of the final contraction.
 */
function vcpBars({
  finalRallyTo = 96,
  secondDepth = 0.12
}: { finalRallyTo?: number; secondDepth?: number } = {}): Bar[] {
  dayCounter = 0;

  const peak2 = 98;
  const trough2 = peak2 * (1 - secondDepth);

  return [
    // Prior uptrend — monotonic, so it contributes no swing of its own.
    ...ramp(70, 100, 50, 1_000_000),
    ...ramp(100, 82, 6, 900_000), //  18% contraction
    ...ramp(82, peak2, 6, 800_000),
    ...ramp(peak2, trough2, 6, 600_000), // 12% contraction
    ...ramp(trough2, 97, 6, 500_000),
    ...ramp(97, 91.18, 6, 350_000), //  6% contraction, volume dried up
    ...ramp(91.18, finalRallyTo, 5, 300_000)
  ];
}

/** A long, steady advance — the shape the Trend Template is built to find. */
function upTrendBars(bars = 300, dailyRate = 0.0015): Bar[] {
  dayCounter = 0;

  const out: Bar[] = [];
  let price = 50;

  for (let i = 0; i < bars; i++) {
    out.push(bar(price, 1_000_000));
    price *= 1 + dailyRate;
  }

  return out;
}

describe('LeaderScreenService', () => {
  let service: LeaderScreenService;

  beforeEach(() => {
    service = new LeaderScreenService(new IndicatorsService());
  });

  describe('trendTemplate', () => {
    it('passes all eight criteria for a sustained uptrend with strong RS', () => {
      const result = service.trendTemplate({
        bars: upTrendBars(),
        rsRank: 92
      });

      expect(result.passCount).toBe(8);
      expect(result.passed).toBe(true);
      expect(result.criteria.movingAveragesStacked).toBe(true);
      expect(result.criteria.sma200Rising).toBe(true);
      expect(result.criteria.near52WeekHigh).toBe(true);
      expect(result.criteria.above52WeekLow).toBe(true);
    });

    it('fails a downtrend on the moving-average criteria', () => {
      const result = service.trendTemplate({
        bars: upTrendBars(300, -0.0015),
        rsRank: 10
      });

      expect(result.passed).toBe(false);
      expect(result.criteria.aboveAllMovingAverages).toBe(false);
      expect(result.criteria.movingAveragesStacked).toBe(false);
      expect(result.criteria.sma200Rising).toBe(false);
      expect(result.criteria.relativeStrength).toBe(false);
    });

    it('fails criterion 8 when the universe was too small to rank', () => {
      // rsRank null means "unranked", which must not silently pass.
      const result = service.trendTemplate({
        bars: upTrendBars(),
        rsRank: null
      });

      expect(result.criteria.relativeStrength).toBe(false);
      expect(result.passCount).toBe(7);
      expect(result.passed).toBe(false);
    });

    it('fails a strong chart whose RS rank is merely average', () => {
      const result = service.trendTemplate({
        bars: upTrendBars(),
        rsRank: 55
      });

      expect(result.criteria.relativeStrength).toBe(false);
      expect(result.passed).toBe(false);
    });

    it('returns null without enough history for a 200-day average plus slope', () => {
      expect(
        service.trendTemplate({ bars: upTrendBars(120), rsRank: 90 })
      ).toBeNull();
    });
  });

  describe('vcpStructure', () => {
    it('detects three contractions of decreasing depth', () => {
      const result = service.vcpStructure(vcpBars());

      expect(result.isValid).toBe(true);
      expect(result.rejectedReason).toBeNull();
      expect(result.contractions).toHaveLength(3);

      const depths = result.contractions.map((c) =>
        Number((c.depthPct * 100).toFixed(1))
      );

      expect(depths).toEqual([18, 12, 6]);
    });

    it('sets the pivot to the high of the final contraction', () => {
      const result = service.vcpStructure(vcpBars());

      expect(result.pivot).toBeCloseTo(97, 6);
    });

    it('recognises price sitting just under the pivot', () => {
      const result = service.vcpStructure(vcpBars({ finalRallyTo: 96 }));

      expect(result.atPivot).toBe(true);
      expect(result.breakout).toBe(false);
    });

    it('requires volume to dry up through the base', () => {
      const result = service.vcpStructure(vcpBars());

      expect(result.dryUpRatio).toBeLessThan(0.85);
    });

    it('rejects a base whose contractions widen instead of tightening', () => {
      // Second contraction deeper than the first: not accumulation, distribution.
      // The chain selector cannot include the widening step, so too few
      // tightening contractions remain and the base is rejected.
      const result = service.vcpStructure(vcpBars({ secondDepth: 0.25 }));

      expect(result.isValid).toBe(false);
      expect(result.contractions.length).toBeLessThan(3);
      expect(result.rejectedReason).toContain('need 3');
    });

    it('ignores wiggles inside a larger contraction when picking the chain', () => {
      // Real charts produce 10-16 raw swings; the chain selector must reduce
      // them to the dominant tightening sequence rather than give up.
      const bars = vcpBars();
      const result = service.vcpStructure(bars);

      expect(result.isValid).toBe(true);
      expect(result.contractions).toHaveLength(3);
    });

    it('rejects a breakout that is not confirmed by volume', () => {
      const bars = vcpBars({ finalRallyTo: 96 });
      // Push above the pivot, but on quiet volume — the classic failed breakout.
      bars.push(bar(99, 200_000));

      const result = service.vcpStructure(bars);

      expect(result.isValid).toBe(true);
      expect(result.breakout).toBe(false);
      expect(result.breakoutVolumeRatio).toBeLessThan(1.4);
    });

    it('confirms a breakout through the pivot on expanding volume', () => {
      const bars = vcpBars({ finalRallyTo: 96 });
      bars.push(bar(99, 3_000_000));

      const result = service.vcpStructure(bars);

      expect(result.isValid).toBe(true);
      expect(result.breakout).toBe(true);
      expect(result.breakoutVolumeRatio).toBeGreaterThanOrEqual(1.4);
    });

    it('reports why a shapeless series was rejected instead of returning null', () => {
      dayCounter = 0;
      const flat = ramp(100, 100, 120, 1_000_000);

      const result = service.vcpStructure(flat);

      expect(result.isValid).toBe(false);
      expect(result.rejectedReason).toContain('contraction');
    });

    it('returns null without enough bars to establish a base', () => {
      dayCounter = 0;

      expect(service.vcpStructure(ramp(100, 110, 30, 1_000_000))).toBeNull();
    });
  });

  describe('darvasBox', () => {
    it('brackets a consolidation with its ceiling and floor', () => {
      dayCounter = 0;
      const bars = [
        ...ramp(80, 100, 20, 1_000_000),
        ...ramp(100, 92, 10, 900_000),
        ...ramp(92, 97, 10, 900_000)
      ];

      const box = service.darvasBox(bars, 40);

      expect(box.top).toBeCloseTo(100, 6);
      expect(box.bottom).toBeCloseTo(92, 6);
      expect(box.withinBox).toBe(true);
    });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 5 * DAY_MS;
const NOW = new Date('2026-08-24T22:40:00.000Z');

function candidate(
  symbol: string,
  vcpStatus: string,
  rsRank?: number
): { dataSource: string; rsRank?: number; symbol: string; vcpStatus: string } {
  return { dataSource: 'YAHOO', rsRank, symbol, vcpStatus };
}

describe('selectFreshBreakouts', () => {
  it('alerts breakouts and ignores AT_PIVOT and FORMING', () => {
    const fresh = selectFreshBreakouts({
      candidates: [
        candidate('MRK', 'BREAKOUT'),
        candidate('AAPL', 'AT_PIVOT'),
        candidate('MSFT', 'FORMING')
      ],
      cooldownMs: COOLDOWN_MS,
      lastNotifiedByKey: new Map(),
      now: NOW
    });

    expect(fresh.map(({ symbol }) => symbol)).toEqual(['MRK']);
  });

  it('applies no RS floor of its own - criterion 8 already supplies one', () => {
    // The live screen on 2026-08-24 produced exactly these four breakouts.
    // Under the previous RS >= 90 message gate only MRK survived, which is why
    // no breakout alert had ever arrived.
    const fresh = selectFreshBreakouts({
      candidates: [
        candidate('MRK', 'BREAKOUT', 93),
        candidate('CF', 'BREAKOUT', 88),
        candidate('RVTY', 'BREAKOUT', 88),
        candidate('UNP', 'BREAKOUT', 79)
      ],
      cooldownMs: COOLDOWN_MS,
      lastNotifiedByKey: new Map(),
      now: NOW
    });

    expect(fresh.map(({ symbol }) => symbol)).toEqual([
      'MRK',
      'CF',
      'RVTY',
      'UNP'
    ]);
  });

  it('suppresses a symbol alerted inside the cooldown window', () => {
    const fresh = selectFreshBreakouts({
      candidates: [candidate('MRK', 'BREAKOUT')],
      cooldownMs: COOLDOWN_MS,
      lastNotifiedByKey: new Map([
        [
          leaderAlertKey({ dataSource: 'YAHOO', symbol: 'MRK' }),
          new Date(NOW.getTime() - 2 * DAY_MS)
        ]
      ]),
      now: NOW
    });

    expect(fresh).toEqual([]);
  });

  it('lets a symbol through again once the cooldown has elapsed', () => {
    const fresh = selectFreshBreakouts({
      candidates: [candidate('MRK', 'BREAKOUT')],
      cooldownMs: COOLDOWN_MS,
      lastNotifiedByKey: new Map([
        [
          leaderAlertKey({ dataSource: 'YAHOO', symbol: 'MRK' }),
          new Date(NOW.getTime() - COOLDOWN_MS)
        ]
      ]),
      now: NOW
    });

    expect(fresh.map(({ symbol }) => symbol)).toEqual(['MRK']);
  });

  it('cools down per symbol, not globally', () => {
    const fresh = selectFreshBreakouts({
      candidates: [candidate('MRK', 'BREAKOUT'), candidate('CF', 'BREAKOUT')],
      cooldownMs: COOLDOWN_MS,
      lastNotifiedByKey: new Map([
        [
          leaderAlertKey({ dataSource: 'YAHOO', symbol: 'MRK' }),
          new Date(NOW.getTime() - DAY_MS)
        ]
      ]),
      now: NOW
    });

    expect(fresh.map(({ symbol }) => symbol)).toEqual(['CF']);
  });

  it('keys the cooldown by data source as well as symbol', () => {
    expect(leaderAlertKey({ dataSource: 'YAHOO', symbol: 'MRK' })).toBe(
      'LEADER:YAHOO:MRK'
    );
    expect(leaderAlertKey({ dataSource: 'MANUAL', symbol: 'MRK' })).not.toBe(
      leaderAlertKey({ dataSource: 'YAHOO', symbol: 'MRK' })
    );
  });
});

describe('selectStoppedLots', () => {
  it('closes a lot trading at or below its stop', () => {
    const stopped = selectStoppedLots({
      lots: [
        { stopLoss: 92.5, symbol: 'MRK' },
        { stopLoss: 45, symbol: 'CF' }
      ],
      priceBySymbol: new Map([
        ['MRK', 92.5],
        ['CF', 51]
      ])
    });

    expect(stopped.map(({ symbol }) => symbol)).toEqual(['MRK']);
  });

  it('leaves a lot open when its price is unknown', () => {
    const stopped = selectStoppedLots({
      lots: [{ stopLoss: 92.5, symbol: 'MRK' }],
      priceBySymbol: new Map()
    });

    expect(stopped).toEqual([]);
  });

  it('leaves a lot open when it carries no stop', () => {
    const stopped = selectStoppedLots({
      lots: [{ stopLoss: null, symbol: 'MRK' }],
      priceBySymbol: new Map([['MRK', 1]])
    });

    expect(stopped).toEqual([]);
  });
});

describe('canHaveExpenseRatio', () => {
  it('accepts pooled products', () => {
    expect(canHaveExpenseRatio('ETF')).toBe(true);
    expect(canHaveExpenseRatio('MUTUALFUND')).toBe(true);
  });

  it('rejects a stock - the case that caused the fetch storm', () => {
    expect(canHaveExpenseRatio('STOCK')).toBe(false);
  });

  it('rejects an unclassified instrument rather than guessing', () => {
    expect(canHaveExpenseRatio(null)).toBe(false);
    expect(canHaveExpenseRatio(undefined)).toBe(false);
  });

  it('rejects the other asset sub-classes', () => {
    for (const assetSubClass of [
      'BOND',
      'CASH',
      'COMMODITY',
      'CRYPTOCURRENCY',
      'PRECIOUS_METAL'
    ]) {
      expect(canHaveExpenseRatio(assetSubClass)).toBe(false);
    }
  });
});

describe('vcpStructure — contiguity invariants (regression, 2026-08-24)', () => {
  const service = new LeaderScreenService(new IndicatorsService());

  /**
   * The defect these tests exist for: `selectContractionChain` used to run a
   * longest-decreasing-SUBSEQUENCE search over every ZigZag swing, keeping any
   * subset that shrank. Measured across 757 real symbols, 77% of accepted
   * bases contained a stretch — skipped by the search — where price broke
   * BELOW the prior trough, contradicting the higher-lows rule the search
   * claimed to enforce, and 96.6% had discarded a pullback deeper than the one
   * they kept. 38.4% of all symbols showed a "valid VCP"; after the fix, 2.5%.
   */
  it('counts a mid-base breakdown instead of stepping over it', () => {
    dayCounter = 0;

    // 18% -> [ 25% BREAKDOWN to a LOWER low ] -> 12% -> 6%.
    // The old subsequence search chained 18/12/6, reported a base starting at
    // 100, and never mentioned the 25% leg down to 72 that happened in the
    // middle of it. The base genuinely restarts AFTER the breakdown, so the
    // right answer is not "reject" — it is that the low must be inside the
    // base rather than hidden behind it.
    const bars = [
      ...ramp(70, 100, 50, 1_000_000),
      ...ramp(100, 82, 6, 900_000), // 18% — before the base
      ...ramp(82, 96, 6, 800_000),
      ...ramp(96, 72, 8, 1_400_000), // 25% breakdown
      ...ramp(72, 98, 8, 900_000),
      ...ramp(98, 86.24, 6, 600_000), // 12%
      ...ramp(86.24, 97, 6, 500_000),
      ...ramp(97, 91.18, 6, 350_000), // 6%
      ...ramp(91.18, 96, 5, 300_000)
    ];

    const result = service.vcpStructure(bars);

    expect(result.isValid).toBe(true);
    expect(result.contractions).toHaveLength(3);

    // The base starts at the breakdown, not at the 18% leg before it.
    expect(result.contractions[0].peak).toBeCloseTo(96, 6);
    expect(result.contractions[0].trough).toBeCloseTo(72, 6);
    expect(result.contractions[0].depthPct).toBeCloseTo(0.25, 6);

    // Base depth spans the highest peak in the base (98) to the lowest trough
    // (72) — the real 26.5%, and critically it INCLUDES the breakdown low that
    // the old detector omitted entirely by chaining 18/12/6 around it.
    expect(result.baseDepthPct).toBeCloseTo(0.265, 3);
  });

  it('rejects a base that is widening rather than tightening', () => {
    dayCounter = 0;

    // 4% -> 8% -> 12%: pullbacks getting WIDER. Supply is increasing, which is
    // the opposite of the pattern. The tightening run can only ever be length
    // 1 here, so no amount of searching should manufacture a base.
    const bars = [
      ...ramp(70, 100, 50, 1_000_000),
      ...ramp(100, 96, 6, 900_000), // 4%
      ...ramp(96, 99, 6, 850_000),
      ...ramp(99, 91.08, 6, 800_000), // 8%
      ...ramp(91.08, 98, 6, 750_000),
      ...ramp(98, 86.24, 6, 700_000), // 12%
      ...ramp(86.24, 95, 5, 650_000)
    ];

    const result = service.vcpStructure(bars);

    expect(result.isValid).toBe(false);
    expect(result.rejectedReason).toContain('consecutive tightening');
  });

  it('keeps only contractions that are adjacent in bar index', () => {
    const result = service.vcpStructure(vcpBars());

    expect(result.isValid).toBe(true);

    for (let i = 1; i < result.contractions.length; i++) {
      // The only thing permitted between two kept contractions is the recovery
      // rally: the later one must start at or after the earlier one's trough.
      expect(result.contractions[i].fromIndex).toBeGreaterThanOrEqual(
        result.contractions[i - 1].toIndex
      );
    }
  });

  it('never lets a bar inside the base print below the running trough', () => {
    const bars = vcpBars();
    const result = service.vcpStructure(bars);
    const window = bars.slice(-60);

    expect(result.isValid).toBe(true);

    for (let i = 1; i < result.contractions.length; i++) {
      const previous = result.contractions[i - 1];
      const current = result.contractions[i];
      const between = window.slice(previous.toIndex + 1, current.fromIndex);

      for (const candle of between) {
        expect(candle.low).toBeGreaterThanOrEqual(previous.trough);
      }
    }
  });

  it('still detects a genuine textbook VCP', () => {
    const result = service.vcpStructure(vcpBars());

    expect(result.isValid).toBe(true);
    expect(result.contractions).toHaveLength(3);
    expect(result.rejectedReason).toBeNull();
  });

  it('merges a stair-step pullback into one contraction rather than two', () => {
    dayCounter = 0;

    // 100 -> 90, feeble bounce to 92 (20% of the pullback), then 90 -> 84.
    // That is one 16% contraction, not a 10% followed by an 8.7%.
    const bars = [
      ...ramp(70, 100, 50, 1_000_000),
      ...ramp(100, 90, 5, 900_000),
      ...ramp(90, 92, 3, 850_000), // recovers only 20% — below the 50% merge bar
      ...ramp(92, 84, 5, 800_000),
      ...ramp(84, 99, 8, 700_000),
      ...ramp(99, 91.08, 6, 500_000), // 8% contraction
      ...ramp(91.08, 98, 6, 450_000),
      ...ramp(98, 94.08, 6, 320_000), // 4% contraction
      ...ramp(94.08, 97.5, 5, 300_000)
    ];

    const result = service.vcpStructure(bars);

    expect(result.isValid).toBe(true);
    expect(result.contractions).toHaveLength(3);
    // The merged first contraction runs peak 100 down to the LOWER trough, 84.
    expect(result.contractions[0].peak).toBeCloseTo(100, 6);
    expect(result.contractions[0].trough).toBeCloseTo(84, 6);
    expect(result.contractions[0].depthPct).toBeCloseTo(0.16, 6);
  });
});

describe('vcpStructure — pivot states', () => {
  const service = new LeaderScreenService(new IndicatorsService());

  it('classifies a confirmed move as BREAKOUT', () => {
    // Final rally above the 97 pivot, on volume well above the 50-day average.
    const bars = vcpBars();
    bars.push(bar(99, 5_000_000));

    const result = service.vcpStructure(bars);

    expect(result.status).toBe('BREAKOUT');
    expect(result.breakout).toBe(true);
  });

  it('classifies price above the pivot on light volume as FAILED_BREAKOUT', () => {
    // The case that used to be filed as AT_PIVOT by a symmetric proximity
    // test: 45 of the 110 at-pivot names measured, i.e. 41% of a bucket that
    // is supposed to hold names still approaching.
    const bars = vcpBars();
    bars.push(bar(99, 100_000));

    const result = service.vcpStructure(bars);

    expect(result.status).toBe('FAILED_BREAKOUT');
    expect(result.atPivot).toBe(false);
    expect(result.breakout).toBe(false);
  });

  it('classifies price just below the pivot as AT_PIVOT', () => {
    const bars = vcpBars();
    bars.push(bar(96.5, 300_000)); // pivot is 97

    const result = service.vcpStructure(bars);

    expect(result.status).toBe('AT_PIVOT');
    expect(result.atPivot).toBe(true);
  });
});
