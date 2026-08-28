import { CrossSectionalService, DatedClose } from './cross-sectional.service';

/**
 * Builds a daily series ending on `endDate` where each step compounds by
 * `dailyRate`, so a symbol's trailing returns are exactly predictable.
 */
function series({
  bars = 300,
  dailyRate,
  endDate = '2026-08-20',
  start = 100
}: {
  bars?: number;
  dailyRate: number;
  endDate?: string;
  start?: number;
}): DatedClose[] {
  const out: DatedClose[] = [];
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let close = start;

  for (let i = bars - 1; i >= 0; i--) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - i);

    out.push({ close, date: date.toISOString().slice(0, 10) });
    close *= 1 + dailyRate;
  }

  return out;
}

/** A universe large enough for percentiles, with a known strength ordering. */
function universe(count = 40): { [symbol: string]: DatedClose[] } {
  const bySymbol: { [symbol: string]: DatedClose[] } = {};

  for (let i = 0; i < count; i++) {
    // SYM00 is the weakest, SYM39 the strongest. 600 bars so that filtering to
    // an `asOf` part-way through still leaves a full year to rank on.
    bySymbol[`SYM${String(i).padStart(2, '0')}`] = series({
      bars: 600,
      dailyRate: -0.001 + i * 0.0001
    });
  }

  return bySymbol;
}

describe('CrossSectionalService', () => {
  let service: CrossSectionalService;

  beforeEach(() => {
    service = new CrossSectionalService();
  });

  describe('rank', () => {
    it('ranks the strongest performer at the top of the percentile range', () => {
      const ranked = service.rank({ seriesBySymbol: universe() });

      expect(ranked[0].symbol).toBe('SYM39');
      expect(ranked[0].rsRank).toBe(99);
      expect(ranked[ranked.length - 1].symbol).toBe('SYM00');
      expect(ranked[ranked.length - 1].rsRank).toBe(1);
    });

    it('orders every name monotonically by trailing strength', () => {
      const ranked = service.rank({ seriesBySymbol: universe() });

      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].rsScore).toBeGreaterThanOrEqual(ranked[i].rsScore);
        expect(ranked[i - 1].rsRank).toBeGreaterThanOrEqual(ranked[i].rsRank);
      }
    });

    it('excludes names without a full year of history rather than ranking them weak', () => {
      const bySymbol = universe();
      bySymbol['NEWIPO'] = series({ bars: 90, dailyRate: 0.01 });

      const ranked = service.rank({ seriesBySymbol: bySymbol });

      // A recent IPO is unranked, not bottom-ranked — conflating the two would
      // bias the screen against every new listing.
      expect(ranked.some(({ symbol }) => symbol === 'NEWIPO')).toBe(false);
    });

    it('withholds percentiles for a universe too small to rank', () => {
      const bySymbol: { [symbol: string]: DatedClose[] } = {};

      for (let i = 0; i < 5; i++) {
        bySymbol[`S${i}`] = series({ dailyRate: 0.001 * i });
      }

      const ranked = service.rank({ seriesBySymbol: bySymbol });

      expect(ranked).toHaveLength(5);
      expect(ranked.every(({ rsRank }) => rsRank === null)).toBe(true);
    });
  });

  describe('point-in-time discipline', () => {
    it('ignores bars dated after asOf', () => {
      const bySymbol = universe();

      // A name that is mediocre up to the cutoff and then explodes afterwards.
      const early = series({
        bars: 600,
        dailyRate: 0.0001,
        endDate: '2026-06-01'
      });
      const late = series({
        bars: 60,
        dailyRate: 0.05,
        endDate: '2026-08-20',
        start: early[early.length - 1].close
      });
      bySymbol['LATEPOP'] = [...early, ...late];

      const asOfCutoff = service.rank({
        asOf: new Date('2026-06-01T00:00:00.000Z'),
        seriesBySymbol: bySymbol
      });
      const withFuture = service.rank({ seriesBySymbol: bySymbol });

      const rankedAtCutoff = asOfCutoff.find(
        ({ symbol }) => symbol === 'LATEPOP'
      );
      const rankedToday = withFuture.find(({ symbol }) => symbol === 'LATEPOP');

      // If the future leaked in, the cutoff rank would already be elevated.
      expect(rankedAtCutoff.rsRank).toBeLessThan(rankedToday.rsRank);
    });

    it('produces an identical past ranking when future bars are appended', () => {
      // The look-ahead guard: this is the property that makes a screening
      // backtest trustworthy, so it is asserted directly rather than implied.
      const bySymbol = universe();
      const asOf = new Date('2026-06-01T00:00:00.000Z');

      const before = service.rank({ asOf, seriesBySymbol: bySymbol });

      const extended: { [symbol: string]: DatedClose[] } = {};

      for (const [symbol, points] of Object.entries(bySymbol)) {
        extended[symbol] = [
          ...points,
          ...series({
            bars: 40,
            dailyRate: 0.03,
            endDate: '2026-10-01',
            start: points[points.length - 1].close
          })
        ];
      }

      const after = service.rank({ asOf, seriesBySymbol: extended });

      expect(after.map(({ symbol }) => symbol)).toEqual(
        before.map(({ symbol }) => symbol)
      );
      expect(after.map(({ rsRank }) => rsRank)).toEqual(
        before.map(({ rsRank }) => rsRank)
      );
    });
  });

  describe('momentum12m2', () => {
    it('excludes the most recent month', () => {
      const closes = Array.from({ length: 300 }, (_, i) => 100 + i);

      // From index (len-1-252) to (len-1-21): 47 -> 278 on this ramp.
      const expected =
        closes[closes.length - 1 - 21] / closes[closes.length - 1 - 252] - 1;

      expect(service.momentum12m2(closes)).toBeCloseTo(expected, 10);
    });

    it('returns null without a full year of history', () => {
      expect(service.momentum12m2([1, 2, 3])).toBeNull();
    });
  });
});

describe('peerRankMap', () => {
  const service = new CrossSectionalService();

  /**
   * IBD's "L" in CAN SLIM: a stock ranked 3rd of 21 inside a leading group is
   * a different proposition from the same RS inside a group nobody wants, and
   * until this existed the screen could not tell them apart.
   */
  const groups = {
    ENE1: 'Energy',
    ENE2: 'Energy',
    ENE3: 'Energy',
    TEC1: 'Technology',
    TEC2: 'Technology',
    TEC3: 'Technology',
    TINY: 'Utilities'
  };

  it('ranks a symbol inside its own group, strongest first', () => {
    const result = service.peerRankMap({
      groupBySymbol: groups,
      rankBySymbol: {
        ENE1: 95,
        ENE2: 80,
        ENE3: 60,
        TEC1: 40,
        TEC2: 30,
        TEC3: 20
      }
    });

    expect(result.ENE1.rankInGroup).toBe(1);
    expect(result.ENE2.rankInGroup).toBe(2);
    expect(result.ENE3.rankInGroup).toBe(3);
    expect(result.ENE1.groupSize).toBe(3);
    expect(result.ENE1.group).toBe('Energy');
  });

  it('ranks the groups against each other on the MEDIAN member', () => {
    const result = service.peerRankMap({
      groupBySymbol: groups,
      rankBySymbol: {
        ENE1: 95,
        ENE2: 80,
        ENE3: 60,
        TEC1: 40,
        TEC2: 30,
        TEC3: 20
      }
    });

    // Energy median 80 vs Technology median 30.
    expect(result.ENE1.groupPercentile).toBeGreaterThan(
      result.TEC1.groupPercentile
    );
  });

  it('uses the median so one runaway name cannot carry a weak group', () => {
    const result = service.peerRankMap({
      groupBySymbol: groups,
      rankBySymbol: {
        ENE1: 50,
        ENE2: 50,
        ENE3: 50,
        // One superstar, two laggards: the mean would beat Energy, the median
        // must not.
        TEC1: 99,
        TEC2: 10,
        TEC3: 10
      }
    });

    expect(result.ENE1.groupPercentile).toBeGreaterThan(
      result.TEC1.groupPercentile
    );
  });

  it('leaves a group too small to rank with a null percentile, not a low one', () => {
    const result = service.peerRankMap({
      groupBySymbol: groups,
      minGroupSize: 3,
      rankBySymbol: { ENE1: 95, ENE2: 80, ENE3: 60, TINY: 99 }
    });

    // Unranked is not the same as bottom-ranked — the same distinction `rank`
    // already draws for a newly listed stock.
    expect(result.TINY.groupPercentile).toBeNull();
    expect(result.TINY.rankInGroup).toBe(1);
  });

  it('ignores symbols with no group rather than inventing one', () => {
    const result = service.peerRankMap({
      groupBySymbol: { ...groups, ORPHAN: null },
      rankBySymbol: { ENE1: 95, ENE2: 80, ENE3: 60, ORPHAN: 99 }
    });

    expect(result.ORPHAN).toBeUndefined();
  });
});
