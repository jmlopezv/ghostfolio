import {
  computeExcludedTrackingKeys,
  computeLiveTrackedKeys,
  provenanceTagOf,
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

describe('readTrackedMetrics — exit price', () => {
  const base = {
    realBuyDate: '2026-06-25T00:00:00.000Z',
    realBuyPrice: 100,
    trackedOrderId: 'order-1',
    trackedStatus: 'TRAILING_EXIT',
    trackedStopLoss: 80,
    trackedTakeProfit: 130
  };

  it('reads the recorded exit price', () => {
    expect(
      readTrackedMetrics({
        ...base,
        trackedAlertedAt: '2026-08-03T18:25:00.000Z',
        trackedExitPrice: 128.5
      }).trackedExitPrice
    ).toBe(128.5);
  });

  it('leaves it undefined on exits recorded before the field existed', () => {
    // These have to be reconstructed from the daily close. Returning undefined
    // rather than 0 is what lets the caller tell "not recorded" from "recorded
    // as zero" and flag the number as inferred.
    expect(
      readTrackedMetrics({
        ...base,
        trackedAlertedAt: '2026-08-03T18:25:00.000Z'
      }).trackedExitPrice
    ).toBeUndefined();
  });

  it('ignores a non-numeric exit price rather than trusting it', () => {
    expect(
      readTrackedMetrics({
        ...base,
        trackedExitPrice: '128.5'
      }).trackedExitPrice
    ).toBeUndefined();
  });
});

describe('provenanceTagOf', () => {
  it('reads the provenance tag off an order', () => {
    expect(provenanceTagOf([{ name: 'BET' }])).toBe('BET');
    expect(provenanceTagOf([{ name: 'LEADER' }])).toBe('LEADER');
    expect(provenanceTagOf([{ name: 'DIP' }])).toBe('DIP');
  });

  it('ignores tags that are not provenance', () => {
    // ACTIVE_TRADE is a different axis entirely and must never become a type.
    expect(provenanceTagOf([{ name: 'ACTIVE_TRADE' }])).toBe('UNTAGGED');
    expect(provenanceTagOf([{ name: 'ACTIVE_TRADE' }, { name: 'BET' }])).toBe(
      'BET'
    );
  });

  it('reports UNTAGGED rather than guessing a strategy', () => {
    // The old behaviour was to assume DIP, which put the user's own market
    // calls inside the curve measuring the dip strategy.
    expect(provenanceTagOf([])).toBe('UNTAGGED');
    expect(provenanceTagOf(undefined)).toBe('UNTAGGED');
    expect(provenanceTagOf([])).not.toBe('DIP');
  });
});
