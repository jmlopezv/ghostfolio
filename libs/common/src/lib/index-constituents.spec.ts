import {
  allIndexConstituents,
  EURO_STOXX_50_SYMBOLS,
  EUROPEAN_MIDCAP_SYMBOLS,
  SP500_SYMBOLS
} from '@ghostfolio/common/index-constituents';
import { toTradingViewSymbol } from '@ghostfolio/common/tradingview';

import { DataSource } from '@prisma/client';

describe('index constituents', () => {
  it('holds the expected membership counts', () => {
    // A generated file: a wrong count means the source page changed shape and
    // the regeneration script silently produced garbage.
    expect(SP500_SYMBOLS.length).toBe(503);
    expect(EURO_STOXX_50_SYMBOLS.length).toBe(50);
    // Curated, not generated — a changed count here means someone edited the
    // list or the regeneration script overwrote it.
    expect(EUROPEAN_MIDCAP_SYMBOLS.length).toBe(100);
  });

  it('contains no duplicates within any list', () => {
    expect(new Set(SP500_SYMBOLS).size).toBe(SP500_SYMBOLS.length);
    expect(new Set(EURO_STOXX_50_SYMBOLS).size).toBe(
      EURO_STOXX_50_SYMBOLS.length
    );
    expect(new Set(EUROPEAN_MIDCAP_SYMBOLS).size).toBe(
      EUROPEAN_MIDCAP_SYMBOLS.length
    );
  });

  it('keeps the mid-caps disjoint from the generated indices', () => {
    // The curation deduplicated on the resolved Yahoo symbol precisely because
    // one company can be listed under two exchange tickers (United Utilities
    // and QinetiQ each appeared twice across the FTSE and STOXX sources). A
    // name landing in two lists costs two slots in the 1-99 RS percentile.
    const generated = new Set([...SP500_SYMBOLS, ...EURO_STOXX_50_SYMBOLS]);

    for (const symbol of EUROPEAN_MIDCAP_SYMBOLS) {
      expect(generated.has(symbol)).toBe(false);
    }
  });

  it('gives every mid-cap a venue suffix', () => {
    // All 100 are European listings; a bare ticker would resolve to a US name.
    for (const symbol of EUROPEAN_MIDCAP_SYMBOLS) {
      expect(symbol).toMatch(/\.[A-Z]{1,2}$/);
    }
  });

  it('resolves every mid-cap to a TradingView page', () => {
    // Same guard as the EURO STOXX list: the mid-caps introduced venues the
    // exchange map had never seen (.L, .SW, .ST, .CO, .OL, .WA, .VI, .LS, .IR).
    for (const symbol of EUROPEAN_MIDCAP_SYMBOLS) {
      expect(
        toTradingViewSymbol({ dataSource: DataSource.YAHOO, symbol })
      ).not.toBeNull();
    }
  });

  it('writes US share classes in Yahoo dash form, never with a dot', () => {
    // The index sources write `BRK.B`; Yahoo needs `BRK-B`. A dot would be
    // parsed as a venue suffix and resolve to nothing.
    expect(SP500_SYMBOLS).toContain('BRK-B');
    expect(SP500_SYMBOLS).toContain('BF-B');

    for (const symbol of SP500_SYMBOLS) {
      expect(symbol).not.toContain('.');
    }
  });

  it('keeps a full multi-character dash segment on European tickers', () => {
    // Nordea is NDA-FI.HE. An extractor that allows only one character after
    // the dash captures the fragment `FI.HE`, which Yahoo does not have —
    // this is a regression guard for exactly that bug.
    expect(EURO_STOXX_50_SYMBOLS).toContain('NDA-FI.HE');
    expect(EURO_STOXX_50_SYMBOLS).not.toContain('FI.HE');
  });

  it('gives every European constituent a venue suffix', () => {
    for (const symbol of EURO_STOXX_50_SYMBOLS) {
      expect(symbol).toMatch(/\.[A-Z]{2}$/);
    }
  });

  it('resolves every European constituent to a TradingView page', () => {
    // Catches an unmapped venue: `BR` (Brussels) was missing from the exchange
    // map, so ABI.BR and ARGX.BR would have rendered no chart link at all.
    for (const symbol of EURO_STOXX_50_SYMBOLS) {
      expect(
        toTradingViewSymbol({ dataSource: DataSource.YAHOO, symbol })
      ).not.toBeNull();
    }
  });

  it('maps the Brussels listings onto Euronext', () => {
    expect(
      toTradingViewSymbol({ dataSource: DataSource.YAHOO, symbol: 'ABI.BR' })
    ).toBe('EURONEXT-ABI');
  });

  it('unions all three lists without duplicating', () => {
    const all = allIndexConstituents();

    expect(all.length).toBe(new Set(all).size);
    expect(all.length).toBe(
      new Set([
        ...SP500_SYMBOLS,
        ...EURO_STOXX_50_SYMBOLS,
        ...EUROPEAN_MIDCAP_SYMBOLS
      ]).size
    );
    expect(all.length).toBe(653);
  });
});
