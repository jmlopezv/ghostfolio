import {
  researchLinks,
  toPerplexityFinanceUrl,
  toYahooFinanceProfileUrl,
  toYahooFinanceUrl
} from '@ghostfolio/common/symbol-links';

import { DataSource } from '@prisma/client';

const yahoo = (symbol: string) => ({ dataSource: DataSource.YAHOO, symbol });

describe('toYahooFinanceUrl', () => {
  it('builds the quote page for a US ticker', () => {
    expect(toYahooFinanceUrl(yahoo('UNP'))).toBe(
      'https://finance.yahoo.com/quote/UNP/'
    );
  });

  it('keeps a Nordic suffix intact', () => {
    expect(toYahooFinanceUrl(yahoo('ASSA-B.ST'))).toBe(
      'https://finance.yahoo.com/quote/ASSA-B.ST/'
    );
  });

  it('returns null for a MANUAL fund, which has no market listing', () => {
    expect(
      toYahooFinanceUrl({
        dataSource: DataSource.MANUAL,
        symbol: 'AVANZA-ZERO'
      })
    ).toBeNull();
  });
});

describe('toYahooFinanceProfileUrl', () => {
  it('extends the quote page rather than rebuilding it', () => {
    expect(toYahooFinanceProfileUrl(yahoo('UNP'))).toBe(
      'https://finance.yahoo.com/quote/UNP/profile/'
    );
  });

  it('propagates null so callers can omit the link', () => {
    expect(
      toYahooFinanceProfileUrl({
        dataSource: DataSource.MANUAL,
        symbol: 'AVANZA-ZERO'
      })
    ).toBeNull();
  });
});

describe('toPerplexityFinanceUrl', () => {
  it('builds the finance page', () => {
    expect(toPerplexityFinanceUrl(yahoo('JNJ'))).toBe(
      'https://www.perplexity.ai/finance/JNJ'
    );
  });

  it('returns null for a MANUAL fund', () => {
    expect(
      toPerplexityFinanceUrl({
        dataSource: DataSource.MANUAL,
        symbol: 'AVANZA-ZERO'
      })
    ).toBeNull();
  });
});

describe('researchLinks', () => {
  it('returns all three for a US listing, in reading order', () => {
    expect(researchLinks(yahoo('UNP'))).toEqual([
      { label: 'Yahoo', url: 'https://finance.yahoo.com/quote/UNP/' },
      {
        label: 'TradingView',
        url: 'https://www.tradingview.com/symbols/NYSE-UNP/'
      },
      { label: 'Perplexity', url: 'https://www.perplexity.ai/finance/UNP' }
    ]);
  });

  it('writes a Nordic share class the way TradingView addresses it', () => {
    // The underscore is why the Telegram alert uses HTML rather than legacy
    // Markdown, which mis-parses `_` inside a URL.
    const tradingView = researchLinks(yahoo('ASSA-B.ST')).find(
      ({ label }) => label === 'TradingView'
    );

    expect(tradingView?.url).toBe(
      'https://www.tradingview.com/symbols/OMXSTO-ASSA_B/'
    );
  });

  it('omits a link that has no page rather than emitting a dead one', () => {
    // EA is on the retired-listing blocklist: Yahoo and Perplexity still have
    // pages, TradingView does not.
    expect(researchLinks(yahoo('EA')).map(({ label }) => label)).toEqual([
      'Yahoo',
      'Perplexity'
    ]);
  });

  it('returns nothing at all for a MANUAL fund', () => {
    expect(
      researchLinks({ dataSource: DataSource.MANUAL, symbol: 'AVANZA-ZERO' })
    ).toEqual([]);
  });
});
