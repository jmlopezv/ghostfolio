import {
  computeExcludedTrackingKeys,
  computeLiveTrackedKeys,
  readTrackedMetrics
} from './signal-trade-tracking.service';

describe('computeLiveTrackedKeys', () => {
  const trackedMetrics = (trackedStatus: string) => {
    return {
      realBuyDate: '2026-06-25T00:00:00.000Z',
      realBuyPrice: 100,
      trackedOrderId: 'order-1',
      trackedStatus,
      trackedStopLoss: 80,
      trackedTakeProfit: 130
    };
  };

  it('claims positions an open tracked trade is still watching', () => {
    const keys = computeLiveTrackedKeys([
      {
        dataSource: 'YAHOO',
        metrics: trackedMetrics('TRACKING'),
        symbol: 'EXV1.DE'
      },
      {
        dataSource: 'YAHOO',
        metrics: trackedMetrics('TRAILING'),
        symbol: 'IS0E.DE'
      }
    ]);

    expect(keys.has('YAHOO:EXV1.DE')).toBe(true);
    expect(keys.has('YAHOO:IS0E.DE')).toBe(true);
  });

  it('releases a position once its tracked trade has finished', () => {
    // A closed trade must hand the symbol back to the exit state machine,
    // otherwise a stopped-out position would never be managed again.
    const keys = computeLiveTrackedKeys([
      {
        dataSource: 'YAHOO',
        metrics: trackedMetrics('STOP_HIT'),
        symbol: 'AAPL'
      },
      {
        dataSource: 'YAHOO',
        metrics: trackedMetrics('TRAILING_EXIT'),
        symbol: 'AMZN'
      }
    ]);

    expect(keys.size).toBe(0);
  });

  it('ignores BUY rows that were never linked to a real purchase', () => {
    const keys = computeLiveTrackedKeys([
      {
        dataSource: 'YAHOO',
        metrics: { assetSubClass: 'ETF' },
        symbol: 'NVDA'
      },
      { dataSource: 'YAHOO', metrics: null, symbol: 'GOOGL' }
    ]);

    expect(keys.size).toBe(0);
  });
});

describe('computeExcludedTrackingKeys', () => {
  it('builds one dataSource:symbol key per config row', () => {
    const keys = computeExcludedTrackingKeys([
      { dataSource: 'YAHOO', symbol: '0P000134K9.F' },
      { dataSource: 'MANUAL', symbol: 'NORDNET_SUOMI_INDEKSI' }
    ]);

    expect(keys.has('YAHOO:0P000134K9.F')).toBe(true);
    expect(keys.has('MANUAL:NORDNET_SUOMI_INDEKSI')).toBe(true);
    expect(keys.has('YAHOO:AMZN')).toBe(false);
  });

  it('is empty when no symbol is excluded', () => {
    expect(computeExcludedTrackingKeys([]).size).toBe(0);
  });
});

describe('readTrackedMetrics', () => {
  it('returns null for a plain, never-tracked metrics blob', () => {
    expect(readTrackedMetrics({ assetSubClass: 'ETF' })).toBeNull();
    expect(readTrackedMetrics(null)).toBeNull();
  });

  it('parses a real tracked-metrics blob', () => {
    const tracked = readTrackedMetrics({
      realBuyDate: '2026-06-25T00:00:00.000Z',
      realBuyPrice: 227.23,
      trackedOrderId: 'order-1',
      trackedStatus: 'TRACKING',
      trackedStopLoss: 200,
      trackedTakeProfit: 260
    });

    expect(tracked?.trackedStatus).toBe('TRACKING');
    expect(tracked?.realBuyPrice).toBe(227.23);
  });
});
