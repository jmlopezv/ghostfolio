import {
  toTradingViewSymbol,
  toTradingViewUrl
} from '@ghostfolio/common/tradingview';

describe('toTradingViewSymbol', () => {
  it('resolves a US ticker through the generated exchange map', () => {
    expect(toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'APH' })).toBe(
      'NYSE-APH'
    );
    expect(toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'AAPL' })).toBe(
      'NASDAQ-AAPL'
    );
  });

  it('distinguishes venues that a bare ticker would collapse', () => {
    // The watchlist holds all three: bare `AIR` resolves to Airbus in Paris on
    // TradingView, so the US listing genuinely needs its exchange prefix.
    expect(toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'AIR' })).toBe(
      'NYSE-AIR'
    );
    expect(toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'AIR.DE' })).toBe(
      'XETR-AIR'
    );
    expect(toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'AIR.PA' })).toBe(
      'EURONEXT-AIR'
    );
  });

  it('writes a US share class with a dot', () => {
    expect(toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'BRK-B' })).toBe(
      'NYSE-BRK.B'
    );
  });

  it('writes a Nordic share class with an underscore', () => {
    expect(
      toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'ASSA-B.ST' })
    ).toBe('OMXSTO-ASSA_B');
    expect(
      toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'NOVO-B.CO' })
    ).toBe('OMXCOP-NOVO_B');
    expect(
      toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'NDA-SE.ST' })
    ).toBe('OMXSTO-NDA_SE');
  });

  it('maps every non-US suffix on the watchlist', () => {
    const cases: [string, string][] = [
      ['EXV1.DE', 'XETR-EXV1'],
      ['EQNR.OL', 'OSL-EQNR'],
      ['NOKIA.HE', 'OMXHEX-NOKIA'],
      ['MC.PA', 'EURONEXT-MC'],
      ['ASM.AS', 'EURONEXT-ASM'],
      ['RYA.IR', 'EURONEXT-RYA'],
      ['ITX.MC', 'BME-ITX'],
      ['NESN.SW', 'SIX-NESN'],
      ['ULVR.L', 'LSE-ULVR'],
      ['LUN.TO', 'TSX-LUN'],
      ['BKCH.MI', 'MIL-BKCH'],
      ['1810.HK', 'HKEX-1810'],
      ['UQA.VI', 'VIE-UQA']
    ];

    for (const [symbol, expected] of cases) {
      expect(toTradingViewSymbol({ dataSource: 'YAHOO', symbol })).toBe(
        expected
      );
    }
  });

  it('falls back to the bare ticker for a US symbol added since generation', () => {
    expect(
      toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'NOTINMAP' })
    ).toBe('NOTINMAP');
  });

  it('returns null for a MANUAL fund, which has no market listing', () => {
    expect(
      toTradingViewSymbol({
        dataSource: 'MANUAL',
        symbol: 'AMF_AKTIEFOND_GLOBAL'
      })
    ).toBeNull();
  });

  it('returns null for a listing TradingView has retired', () => {
    // Yahoo still quotes EA, but TradingView dropped NASDAQ:EA — and bare `EA`
    // resolves to an unrelated Thai company, so no link beats a wrong chart.
    expect(
      toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'EA' })
    ).toBeNull();
  });

  it('returns null rather than a guessed link for an unmapped suffix', () => {
    expect(
      toTradingViewSymbol({ dataSource: 'YAHOO', symbol: 'PETR4.SA' })
    ).toBeNull();
  });
});

describe('toTradingViewUrl', () => {
  it('builds the symbol-page URL', () => {
    expect(toTradingViewUrl({ dataSource: 'YAHOO', symbol: 'APH' })).toBe(
      'https://www.tradingview.com/symbols/NYSE-APH/'
    );
  });

  it('propagates null so callers can omit the link entirely', () => {
    expect(
      toTradingViewUrl({ dataSource: 'MANUAL', symbol: 'NORDNET_GLOBAL_INDEX' })
    ).toBeNull();
  });
});
