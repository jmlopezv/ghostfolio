import {
  computeExcludedTrackingKeys,
  readTrackedMetrics
} from './signal-trade-tracking.service';

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
