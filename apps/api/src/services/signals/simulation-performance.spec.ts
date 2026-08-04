import {
  buildPerformanceSeries,
  computeTrailingPriceReturns,
  normalizeBenchmarkSeries,
  PerformanceSeriesTrade
} from './simulation-performance';

describe('buildPerformanceSeries', () => {
  it('returns an empty series for an empty bucket', () => {
    expect(buildPerformanceSeries([], new Map(), '2026-01-10')).toEqual([]);
  });

  it('forward-fills across a gap day with no stored close (e.g. a weekend)', () => {
    const trades: PerformanceSeriesTrade[] = [
      {
        buyDate: '2026-01-01T10:00:00.000Z',
        buyPrice: 100,
        dataSource: 'YAHOO',
        symbol: 'AAPL'
      }
    ];
    // 2026-01-02 has no close (weekend) — the day should still get a point,
    // forward-filled from 2026-01-01's stored close.
    const marketDataBySymbol = new Map([
      [
        'YAHOO:AAPL',
        [
          { close: 100, date: '2026-01-01' },
          { close: 110, date: '2026-01-03' }
        ]
      ]
    ]);

    const series = buildPerformanceSeries(
      trades,
      marketDataBySymbol,
      '2026-01-03'
    );

    expect(series.map((point) => point.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03'
    ]);
    // 2026-01-02 forward-fills 2026-01-01's price (100) — flat 0% (minus fee
    // drag), same as 2026-01-01 itself.
    expect(series[0].value).toBe(series[1].value);
    // 2026-01-03's real close (110) is a genuinely higher return than the
    // forward-filled day before it.
    expect(series[2].value).toBeGreaterThan(series[1].value);
  });

  it("locks a closed trade's final netReturnPct from its sell date onward, ignoring later price moves", () => {
    const trades: PerformanceSeriesTrade[] = [
      {
        buyDate: '2026-01-01T10:00:00.000Z',
        buyPrice: 100,
        dataSource: 'YAHOO',
        symbol: 'AAPL',
        netReturnPct: 25,
        sellDate: '2026-01-02T10:00:00.000Z'
      }
    ];
    // A later close that would imply a very different return if this trade
    // were still mark-to-marked — it must NOT be used once closed.
    const marketDataBySymbol = new Map([
      [
        'YAHOO:AAPL',
        [
          { close: 100, date: '2026-01-01' },
          { close: 500, date: '2026-01-03' }
        ]
      ]
    ]);

    const series = buildPerformanceSeries(
      trades,
      marketDataBySymbol,
      '2026-01-03'
    );

    const bySellDate = series.find((point) => point.date === '2026-01-02');
    const afterSellDate = series.find((point) => point.date === '2026-01-03');

    expect(bySellDate?.value).toBe(25);
    expect(afterSellDate?.value).toBe(25);
  });

  it("prefers a still-open trade's live currentPrice for today over a stale stored close", () => {
    const trades: PerformanceSeriesTrade[] = [
      {
        buyDate: '2026-01-01T10:00:00.000Z',
        buyPrice: 100,
        currentPrice: 150,
        dataSource: 'YAHOO',
        symbol: 'AAPL'
      }
    ];
    const marketDataBySymbol = new Map([
      ['YAHOO:AAPL', [{ close: 100, date: '2026-01-01' }]]
    ]);

    const series = buildPerformanceSeries(
      trades,
      marketDataBySymbol,
      '2026-01-01'
    );

    // buyPrice 100 -> currentPrice 150 = +50% gross, minus the buy-only fee
    // drag ($5 / $1000 assumed notional = 0.5%) = +49.5%.
    expect(series[0].value).toBe(49.5);
  });

  it('averages multiple trades in the same bucket on the same day', () => {
    const trades: PerformanceSeriesTrade[] = [
      {
        buyDate: '2026-01-01T10:00:00.000Z',
        buyPrice: 100,
        dataSource: 'YAHOO',
        symbol: 'AAPL',
        netReturnPct: 20,
        sellDate: '2026-01-01T11:00:00.000Z'
      },
      {
        buyDate: '2026-01-01T10:00:00.000Z',
        buyPrice: 100,
        dataSource: 'YAHOO',
        symbol: 'MSFT',
        netReturnPct: -10,
        sellDate: '2026-01-01T11:00:00.000Z'
      }
    ];

    const series = buildPerformanceSeries(trades, new Map(), '2026-01-01');

    // (20 + -10) / 2 = 5, not 20 + (-10) = 10.
    expect(series).toEqual([{ date: '2026-01-01', value: 5 }]);
  });
});

describe('normalizeBenchmarkSeries', () => {
  it('normalizes to % change from the close nearest startDate', () => {
    const closes = [
      { close: 100, date: '2026-01-01' },
      { close: 110, date: '2026-01-02' },
      { close: 90, date: '2026-01-03' }
    ];

    const series = normalizeBenchmarkSeries(closes, '2026-01-01');

    expect(series).toEqual([
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 10 },
      { date: '2026-01-03', value: -10 }
    ]);
  });

  it('drops points before startDate and rebases to the first point on/after it', () => {
    const closes = [
      { close: 50, date: '2025-12-31' },
      { close: 100, date: '2026-01-01' },
      { close: 105, date: '2026-01-02' }
    ];

    const series = normalizeBenchmarkSeries(closes, '2026-01-01');

    expect(series).toEqual([
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-02', value: 5 }
    ]);
  });

  it('returns undefined for an empty input', () => {
    expect(normalizeBenchmarkSeries([], '2026-01-01')).toBeUndefined();
  });
});

describe('computeTrailingPriceReturns', () => {
  function daysAgo(days: number, from = new Date()): string {
    return new Date(from.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }

  it('computes real periods a long close history actually covers', () => {
    const now = new Date();
    const closes = [
      { close: 80, date: daysAgo(400, now) },
      { close: 90, date: daysAgo(370, now) }, // covers 1Y
      { close: 95, date: daysAgo(200, now) }, // covers 6M
      { close: 98, date: daysAgo(95, now) }, // covers 3M
      { close: 100, date: daysAgo(35, now) }, // covers 1M
      { close: 108, date: daysAgo(8, now) }, // covers 1W
      { close: 109, date: daysAgo(1, now) }, // covers 1D
      { close: 110, date: daysAgo(0, now) }
    ];

    const readout = computeTrailingPriceReturns(closes);

    // The function rounds to 2 decimals, so compare with that precision.
    expect(readout['1y']).toBeCloseTo((110 / 90 - 1) * 100, 2);
    expect(readout['1d']).toBeCloseTo((110 / 109 - 1) * 100, 2);
  });

  it('omits (does not fabricate) a period the fetched history genuinely does not cover', () => {
    const now = new Date();
    // Only ~10 days of real history — nowhere near enough for 1M/3M/6M/1Y/YTD.
    const closes = [
      { close: 100, date: daysAgo(9, now) },
      { close: 105, date: daysAgo(0, now) }
    ];

    const readout = computeTrailingPriceReturns(closes);

    expect(readout['1m']).toBeUndefined();
    expect(readout['3m']).toBeUndefined();
    expect(readout['6m']).toBeUndefined();
    expect(readout['1y']).toBeUndefined();
    expect(readout['1w']).toBeDefined();
  });

  it('returns an empty object for an empty input', () => {
    expect(computeTrailingPriceReturns([])).toEqual({});
  });
});
