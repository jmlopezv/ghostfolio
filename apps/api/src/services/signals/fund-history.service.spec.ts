import {
  computeSeriesMetrics,
  extractHoldings,
  parseNordnetFundDetails,
  parseOrderbookIdFromScraperUrl,
  reconstructNavSeries,
  restoreSwedishFundName
} from './fund-history.service';

describe('parseNordnetFundDetails', () => {
  // Trimmed-down but structurally faithful fragment of a Nordnet fund page
  // with ?details (rowheader/cell pairs + schema.org JSON-LD).
  const html = [
    '<script type="application/ld+json">{"@context":"https://schema.org/","@type":"Product",',
    '"aggregateRating":{"@type":"AggregateRating","ratingValue":"4","bestRating":"5"}}</script>',
    '<span role="rowheader">Kategori</span></span><div class="x"><div class="y">',
    '<span role="cell" class="z">Korea</span></div></div>',
    '<span role="rowheader">ISIN</span></span><div class="x"><div class="y">',
    '<span role="cell" class="z">LU0301634860</span></div></div>',
    '<span role="rowheader">Antal ägare hos Nordnet</span></span>',
    '<span role="cell">6 895</span>',
    '<span role="rowheader">Handlas i</span></span><div><div>',
    '<span role="cell">USD</span></div></div>',
    // Dehydrated state fragment (quotes escaped as \") with the fund's own
    // navInfo, fees, risk and holdings blocks.
    '<script>self.__next_f.push("\\"navInfo\\":{\\"latestNav\\":{\\"date\\":\\"2026-07-07\\",\\"value\\":195.388},',
    '\\"returns\\":[{\\"development\\":-0.2,\\"period\\":\\"DAY_1\\"},',
    '{\\"development\\":-0.6,\\"period\\":\\"WEEK_1\\"},',
    '{\\"development\\":5.66,\\"period\\":\\"MONTH_1\\"},',
    '{\\"development\\":9.77,\\"period\\":\\"MONTH_6\\"},',
    '{\\"development\\":16.42,\\"period\\":\\"YEAR_1\\"}]},',
    '\\"fees\\":{\\"managementFee\\":0.4,\\"ongoingCost\\":0.45,\\"totalFee\\":0.45},',
    '\\"standardDeviation\\":13.51,\\"sharpeRatio\\":0.83,',
    '\\"instrument\\":{\\"orderBook\\":{\\"id\\":\\"52540035-e3f9-46a1-945a-aa7b72e811ad\\"}},',
    // Realistic holding objects — a long logoUrl pushes the holding's own
    // top-level "name" more than 300 chars from "weight" (the old fixed-
    // window regex's blind spot), and a nested market/segment object repeats
    // "name" again further along. Two different markets (Nasdaq + a
    // Stockholm-listed name) prove the extractor isn't just keying off
    // "Nasdaq" specifically.
    '\\"holdings\\":[{\\"orderBookId\\":\\"99c43961-8eef-4c7a-9954-2fe31c47b70d\\",',
    '\\"name\\":\\"NVIDIA\\",\\"instrumentClass\\":\\"STOCK\\",\\"slug\\":\\"nvidia-nvda-xnas\\",',
    '\\"logoUrl\\":\\"https://cdn.prod.nntech.io/cms-proxy/6xe8ehctp75g/5JUACsX9UWOWwXKsJAnbep/b4185df851cb1db0e988e8837ef2ba1c/nvda.png\\",',
    '\\"market\\":{\\"countryCode\\":\\"US\\",\\"name\\":\\"Nasdaq\\",\\"segment\\":{\\"name\\":\\"Nasdaq\\"}},',
    '\\"positionType\\":\\"LONG\\",\\"weight\\":5.53},',
    '{\\"orderBookId\\":\\"7e1c2f3a-8b4d-4e5f-9a6b-1c2d3e4f5a6b\\",',
    '\\"name\\":\\"Volvo\\",\\"instrumentClass\\":\\"STOCK\\",\\"slug\\":\\"volvo-volv-b-xsto\\",',
    '\\"logoUrl\\":\\"https://cdn.prod.nntech.io/cms-proxy/6xe8ehctp75g/anotherlongopaqueassetid1234567890abcdef/volvo.png\\",',
    '\\"market\\":{\\"countryCode\\":\\"SE\\",\\"name\\":\\"Stockholmsborsen\\",\\"segment\\":{\\"name\\":\\"Stockholmsborsen\\"}},',
    '\\"positionType\\":\\"LONG\\",\\"weight\\":4.2}]")</script>'
  ].join('');

  it('extracts owners, ISIN, category, rating, currency, NAV, returns, fee, risk and holdings', () => {
    const details = parseNordnetFundDetails(html);

    expect(details.category).toBe('Korea');
    expect(details.isin).toBe('LU0301634860');
    expect(details.owners).toBe(6895);
    expect(details.rating).toBe(4);
    expect(details.currency).toBe('USD');
    expect(details.latestNav).toEqual({ date: '2026-07-07', value: 195.388 });
    expect(details.returns).toEqual([
      { development: -0.2, period: 'DAY_1' },
      { development: -0.6, period: 'WEEK_1' },
      { development: 5.66, period: 'MONTH_1' },
      { development: 9.77, period: 'MONTH_6' },
      { development: 16.42, period: 'YEAR_1' }
    ]);
    expect(details.feePct).toBe(0.45);
    expect(details.managementFeePct).toBe(0.4);
    expect(details.standardDeviation).toBe(13.51);
    expect(details.sharpeRatio).toBe(0.83);
    expect(details.holdings).toEqual([
      { name: 'NVIDIA', weight: 0.0553 },
      { name: 'Volvo', weight: 0.042 }
    ]);
    expect(details.orderbookId).toBe('52540035-e3f9-46a1-945a-aa7b72e811ad');
  });

  it('returns empty fields on unrelated HTML', () => {
    const details = parseNordnetFundDetails(
      '<html><body>nothing</body></html>'
    );

    expect(details.owners).toBeUndefined();
    expect(details.isin).toBeUndefined();
    expect(details.rating).toBeUndefined();
  });
});

describe('extractHoldings', () => {
  it('extracts the real top-level name even when a long logoUrl pushes it past a 300-char lookahead', () => {
    // The old fixed-window regex (`[\s\S]{0,300}?` between "name" and
    // "weight") failed here: the padding below alone is >300 chars, so the
    // holding's own "name" was skipped and the nearer, nested
    // "market":{"name":"Nasdaq"} field was captured instead — the exact bug
    // reported live (every holding showing as "Nasdaq").
    const longLogoUrl = 'https://cdn.example.com/' + 'a'.repeat(320) + '.png';
    const html = [
      '\\"holdings\\":[{\\"orderBookId\\":\\"abc\\",\\"name\\":\\"NVIDIA\\",',
      `\\"instrumentClass\\":\\"STOCK\\",\\"logoUrl\\":\\"${longLogoUrl}\\",`,
      '\\"market\\":{\\"countryCode\\":\\"US\\",\\"name\\":\\"Nasdaq\\",\\"segment\\":{\\"name\\":\\"Nasdaq\\"}},',
      '\\"positionType\\":\\"LONG\\",\\"weight\\":5.65}]'
    ].join('');

    expect(extractHoldings(html)).toEqual([{ name: 'NVIDIA', weight: 0.0565 }]);
  });

  it('extracts multiple holdings across different markets and caps at 10', () => {
    const holdingObjects = Array.from({ length: 12 }, (_, index) =>
      [
        `{\\"orderBookId\\":\\"id-${index}\\",\\"name\\":\\"Company${index}\\",`,
        '\\"instrumentClass\\":\\"STOCK\\",',
        '\\"market\\":{\\"countryCode\\":\\"SE\\",\\"name\\":\\"Stockholmsborsen\\"},',
        `\\"weight\\":${(5 - index * 0.1).toFixed(2)}}`
      ].join('')
    );
    const html = `\\"holdings\\":[${holdingObjects.join(',')}]`;

    const holdings = extractHoldings(html);

    expect(holdings).toHaveLength(10);
    expect(holdings[0]).toEqual({ name: 'Company0', weight: 0.05 });
    expect(holdings.every(({ name }) => name !== 'Stockholmsborsen')).toBe(
      true
    );
  });

  it('returns an empty array when there is no holdings array', () => {
    expect(extractHoldings('<html><body>nothing</body></html>')).toEqual([]);
  });
});

describe('restoreSwedishFundName', () => {
  it('restores diacritics word-by-word, leaving unknown words intact', () => {
    expect(restoreSwedishFundName('Lansforsakringar Global Index')).toBe(
      'Länsförsäkringar Global Index'
    );
    expect(restoreSwedishFundName('AMF Aktiefond Varlden')).toBe(
      'AMF Aktiefond Världen'
    );
    expect(restoreSwedishFundName('SEB Emerging Markets Indexnara')).toBe(
      'SEB Emerging Markets Indexnära'
    );
    expect(restoreSwedishFundName('Swedbank Robur Access USA')).toBe(
      'Swedbank Robur Access USA'
    );
  });
});

describe('parseOrderbookIdFromScraperUrl', () => {
  it('extracts the orderbook id from an Avanza fund-guide URL', () => {
    expect(
      parseOrderbookIdFromScraperUrl(
        'https://www.avanza.se/_api/fund-guide/guide/596635'
      )
    ).toBe('596635');
  });

  it('returns null for Nordnet URLs and missing values', () => {
    expect(
      parseOrderbookIdFromScraperUrl(
        'https://www.nordnet.se/fonder/lista/nordnet-global-index-sek-0c65c468'
      )
    ).toBeNull();
    expect(parseOrderbookIdFromScraperUrl(undefined)).toBeNull();
    expect(parseOrderbookIdFromScraperUrl(null)).toBeNull();
  });
});

describe('reconstructNavSeries', () => {
  it('anchors the last point at the current NAV and scales the rest', () => {
    // 0% at start, +10% mid, +25% at the end; current NAV 125 => start was 100.
    const series = reconstructNavSeries(
      [
        { x: Date.UTC(2025, 6, 1), y: 0 },
        { x: Date.UTC(2025, 11, 1), y: 10 },
        { x: Date.UTC(2026, 5, 30), y: 25 }
      ],
      125
    );

    expect(series).toHaveLength(3);
    expect(series[0].marketPrice).toBeCloseTo(100, 4);
    expect(series[1].marketPrice).toBeCloseTo(110, 4);
    expect(series[2].marketPrice).toBeCloseTo(125, 4);
  });

  it('labels points by their STOCKHOLM calendar day (Avanza stamps NAVs at Stockholm midnight)', () => {
    // Summer (CEST = UTC+2): 2026-07-07T22:00Z is 2026-07-08 00:00 in
    // Stockholm — the official NAV date is the 8th, not the 7th.
    const summer = reconstructNavSeries(
      [{ x: Date.UTC(2026, 6, 7, 22, 0, 0), y: 0 }],
      100
    );

    expect(summer[0].date.toISOString()).toBe('2026-07-08T00:00:00.000Z');

    // Winter (CET = UTC+1): 23:00Z Jan 5 is still Jan 5 locally; 23:30Z
    // crosses midnight into Jan 6; two Jan 6 points de-duplicate to the last.
    const winter = reconstructNavSeries(
      [
        { x: Date.UTC(2026, 0, 5, 22, 0, 0), y: 0 },
        { x: Date.UTC(2026, 0, 5, 23, 30, 0), y: 1 },
        { x: Date.UTC(2026, 0, 6, 22, 0, 0), y: 2 }
      ],
      102
    );

    expect(winter).toHaveLength(2);
    expect(winter[0].date.toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(winter[0].marketPrice).toBeCloseTo(100, 4);
    expect(winter[1].date.toISOString()).toBe('2026-01-06T00:00:00.000Z');
    expect(winter[1].marketPrice).toBeCloseTo(102, 4);
  });

  it('never emits a row dated after the official NAV date (maxDate cap)', () => {
    const series = reconstructNavSeries(
      [
        { x: Date.UTC(2026, 6, 6, 22, 0, 0), y: 0 }, // 2026-07-07 Stockholm
        { x: Date.UTC(2026, 6, 7, 22, 0, 0), y: 1 } // 2026-07-08 Stockholm
      ],
      100,
      '2026-07-07'
    );

    expect(series).toHaveLength(1);
    expect(series[0].date.toISOString()).toBe('2026-07-07T00:00:00.000Z');
  });

  it('returns empty for missing series or non-positive NAV', () => {
    expect(reconstructNavSeries([], 100)).toEqual([]);
    expect(reconstructNavSeries([{ x: 1, y: 0 }], 0)).toEqual([]);
  });

  it('skips corrupt points implying a non-positive NAV', () => {
    const series = reconstructNavSeries(
      [
        { x: Date.UTC(2026, 0, 5), y: -150 },
        { x: Date.UTC(2026, 0, 6), y: 0 }
      ],
      100
    );

    expect(series).toHaveLength(1);
    expect(series[0].marketPrice).toBeCloseTo(100, 4);
  });
});

describe('computeSeriesMetrics', () => {
  it('computes window returns from an ordered close series', () => {
    // 300 days rising 0.1% per day.
    const closes = Array.from({ length: 300 }, (_, i) => 100 * 1.001 ** i);
    const metrics = computeSeriesMetrics(closes);

    expect(metrics.return1mPct).toBeCloseTo((1.001 ** 21 - 1) * 100, 1);
    expect(metrics.return1yPct).toBeCloseTo((1.001 ** 252 - 1) * 100, 1);
    expect(metrics.maxDrawdownPct).toBeCloseTo(0, 4);
    expect(metrics.annualVolPct).toBeCloseTo(0, 1);
  });

  it('returns nulls when history is too short for a window', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
    const metrics = computeSeriesMetrics(closes);

    expect(metrics.return1mPct).not.toBeNull();
    expect(metrics.return6mPct).toBeNull();
    expect(metrics.return1yPct).toBeNull();
  });

  it('measures the max drawdown of a peak-trough series', () => {
    const closes = [
      ...Array.from({ length: 30 }, () => 100),
      120, // peak
      90, // trough: 25% off the peak
      100
    ];
    const metrics = computeSeriesMetrics(closes);

    expect(metrics.maxDrawdownPct).toBeCloseTo(25, 2);
  });
});
