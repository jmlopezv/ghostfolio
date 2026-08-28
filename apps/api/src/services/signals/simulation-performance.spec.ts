import { resolveTradeStatus } from './signals.service';
import {
  buildPerformanceSeries,
  computeTrailingPriceReturns,
  normalizeBenchmarkSeries,
  OrderLike,
  ordersToTrades,
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

    // buyPrice 100 -> currentPrice 150 = +50% gross, minus the buy-only fee.
    // On the $1,000 assumed notional that is 9 SEK + 0.25% = 32.66 SEK =
    // $3.45, so 0.345% of drag.
    expect(series[0].value).toBeCloseTo(49.65, 2);
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

describe('ordersToTrades', () => {
  const order = (overrides: Partial<OrderLike> = {}): OrderLike => ({
    dataSource: 'YAHOO',
    date: '2026-01-01',
    fee: 0,
    quantity: 1,
    symbol: 'AAPL',
    tags: [],
    type: 'BUY',
    unitPrice: 100,
    ...overrides
  });

  it('leaves a lone BUY open, with only the buy-side fee charged', () => {
    const trades = ordersToTrades([
      order({ fee: 5, quantity: 2, unitPrice: 100 })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].sellDate).toBeUndefined();
    expect(trades[0].netReturnPct).toBeUndefined();
    // 5 across 2 shares = 2.50/share on a 100 entry.
    expect(trades[0].feeDragPct).toBeCloseTo(2.5, 6);
  });

  it('closes a BUY against a later SELL and charges both legs', () => {
    const trades = ordersToTrades([
      order({ fee: 2, quantity: 1, unitPrice: 100 }),
      order({ date: '2026-02-01', fee: 3, type: 'SELL', unitPrice: 120 })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].sellDate).toBe('2026-02-01');
    // (120 - 100 - 5) / 100
    expect(trades[0].netReturnPct).toBeCloseTo(15, 6);
  });

  it('matches FIFO, so the oldest lot is sold first', () => {
    const trades = ordersToTrades([
      order({ date: '2026-01-01', unitPrice: 100 }),
      order({ date: '2026-01-02', unitPrice: 200 }),
      order({ date: '2026-03-01', quantity: 1, type: 'SELL', unitPrice: 300 })
    ]);

    const closed = trades.filter(({ sellDate }) => sellDate);
    const open = trades.filter(({ sellDate }) => !sellDate);

    expect(closed).toHaveLength(1);
    expect(closed[0].buyPrice).toBe(100);
    expect(open).toHaveLength(1);
    expect(open[0].buyPrice).toBe(200);
  });

  it('splits a lot when a SELL closes only part of it', () => {
    const trades = ordersToTrades([
      order({ quantity: 10, unitPrice: 100 }),
      order({ date: '2026-02-01', quantity: 4, type: 'SELL', unitPrice: 150 })
    ]);

    const closed = trades.filter(({ sellDate }) => sellDate);
    const open = trades.filter(({ sellDate }) => !sellDate);

    expect(closed[0].quantity).toBe(4);
    expect(open[0].quantity).toBe(6);
  });

  it('spans several lots when one SELL closes more than one', () => {
    const trades = ordersToTrades([
      order({ date: '2026-01-01', quantity: 2, unitPrice: 100 }),
      order({ date: '2026-01-02', quantity: 3, unitPrice: 110 }),
      order({ date: '2026-03-01', quantity: 5, type: 'SELL', unitPrice: 120 })
    ]);

    expect(trades).toHaveLength(2);
    expect(trades.every(({ sellDate }) => sellDate === '2026-03-01')).toBe(
      true
    );
    expect(trades.map(({ buyPrice }) => buyPrice)).toEqual([100, 110]);
  });

  it('apportions an order fee across its quantity, not across the slice sold', () => {
    // A 10-share buy paying 10 is 1/share. Selling 2 of them must be charged
    // 2, not the whole 10 — otherwise a partial exit looks catastrophic.
    const trades = ordersToTrades([
      order({ fee: 10, quantity: 10, unitPrice: 100 }),
      order({
        date: '2026-02-01',
        fee: 0,
        quantity: 2,
        type: 'SELL',
        unitPrice: 100
      })
    ]);

    const closed = trades.find(({ sellDate }) => sellDate);

    expect(closed.netReturnPct).toBeCloseTo(-1, 6);
  });

  it('keeps the tags of both legs so a closed position stays attributable', () => {
    const trades = ordersToTrades([
      order({ tags: ['DIP'] }),
      order({ date: '2026-02-01', tags: [], type: 'SELL', unitPrice: 120 })
    ]);

    expect(trades[0].tags).toEqual(['DIP']);
  });

  it('ignores DIVIDEND and other non-trade activity types', () => {
    const trades = ordersToTrades([
      order({ type: 'DIVIDEND', unitPrice: 0.25 }),
      order({ type: 'BUY', unitPrice: 100 })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].buyPrice).toBe(100);
  });

  it('drops a SELL with no open lot rather than inventing a short position', () => {
    const trades = ordersToTrades([
      order({ quantity: 5, type: 'SELL', unitPrice: 100 })
    ]);

    expect(trades).toEqual([]);
  });

  it('keeps symbols in separate FIFO queues', () => {
    const trades = ordersToTrades([
      order({ symbol: 'AAPL', unitPrice: 100 }),
      order({ symbol: 'MSFT', unitPrice: 200 }),
      order({
        date: '2026-02-01',
        symbol: 'MSFT',
        type: 'SELL',
        unitPrice: 250
      })
    ]);

    const closed = trades.filter(({ sellDate }) => sellDate);

    expect(closed).toHaveLength(1);
    expect(closed[0].symbol).toBe('MSFT');
  });

  it('processes out-of-order input chronologically', () => {
    const trades = ordersToTrades([
      order({ date: '2026-03-01', type: 'SELL', unitPrice: 120 }),
      order({ date: '2026-01-01', unitPrice: 100 })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].netReturnPct).toBeCloseTo(20, 6);
  });
});

describe('buildPerformanceSeries with a per-trade fee', () => {
  it('prefers a trade-specific feeDragPct over the assumed-notional default', () => {
    const marketDataBySymbol = new Map([
      ['YAHOO:AAPL', [{ close: 110, date: '2026-01-01' }]]
    ]);

    const [withDefault] = buildPerformanceSeries(
      [
        {
          buyDate: '2026-01-01',
          buyPrice: 100,
          dataSource: 'YAHOO',
          symbol: 'AAPL'
        }
      ],
      marketDataBySymbol,
      '2026-01-01'
    );

    const [withOwnFee] = buildPerformanceSeries(
      [
        {
          buyDate: '2026-01-01',
          buyPrice: 100,
          dataSource: 'YAHOO',
          feeDragPct: 0,
          symbol: 'AAPL'
        }
      ],
      marketDataBySymbol,
      '2026-01-01'
    );

    expect(withOwnFee.value).toBe(10);
    expect(withDefault.value).toBeLessThan(10);
  });
});

describe('resolveTradeStatus', () => {
  it('is OPEN when a signal fired and nothing was bought', () => {
    expect(
      resolveTradeStatus({
        exitSignalled: false,
        purchased: false,
        sold: false
      })
    ).toBe('OPEN');
  });

  it('is BOUGHT once a real purchase is linked', () => {
    expect(
      resolveTradeStatus({ exitSignalled: false, purchased: true, sold: false })
    ).toBe('BOUGHT');
  });

  it('is CLOSED when the engine signalled an exit and the position is held', () => {
    // AMZN: told to sell on 2026-08-03, kept anyway. Neither open nor sold.
    expect(
      resolveTradeStatus({ exitSignalled: true, purchased: true, sold: false })
    ).toBe('CLOSED');
  });

  it('is SOLD once a real sale exists, outranking the exit signal', () => {
    expect(
      resolveTradeStatus({ exitSignalled: true, purchased: true, sold: true })
    ).toBe('SOLD');
  });

  it('is SOLD for a sale the engine never asked for', () => {
    // XDJP.DE: sold on the user's own decision, no exit signal in the log.
    expect(
      resolveTradeStatus({ exitSignalled: false, purchased: true, sold: true })
    ).toBe('SOLD');
  });
});
