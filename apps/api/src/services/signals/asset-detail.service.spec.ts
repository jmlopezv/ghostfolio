import {
  classifyStyleBox,
  holdingsOverlap,
  normalizeHoldingName,
  ownedSharedShare,
  parseYahooExpenseRatioPct,
  parseYahooStyleBoxIndex,
  styleBoxIndexToCell
} from './asset-detail.service';

describe('normalizeHoldingName', () => {
  it('strips legal suffixes and punctuation so cross-source names match', () => {
    expect(normalizeHoldingName('Apple Inc')).toBe('apple');
    expect(normalizeHoldingName('Apple')).toBe('apple');
    expect(normalizeHoldingName('Volvo AB')).toBe('volvo');
    expect(normalizeHoldingName('Alphabet Inc. Class A')).toBe('alphabet');
    expect(
      normalizeHoldingName('Taiwan Semiconductor Manufacturing Co Ltd')
    ).toBe('taiwan semiconductor manufacturing');
  });

  it('normalizes ampersands and whitespace', () => {
    expect(normalizeHoldingName('Procter & Gamble')).toBe('procter and gamble');
  });
});

describe('holdingsOverlap', () => {
  const A = [
    { name: 'Apple Inc', weight: 0.1 },
    { name: 'Microsoft Corp', weight: 0.08 },
    { name: 'NVIDIA', weight: 0.06 }
  ];

  it('is 100% (of matched weight) for identical holdings', () => {
    const { overlapPct } = holdingsOverlap(A, A);
    // 0.1 + 0.08 + 0.06 = 0.24 -> 24.0
    expect(overlapPct).toBeCloseTo(24, 1);
  });

  it('is 0 for disjoint holdings', () => {
    const B = [
      { name: 'Equinor', weight: 0.2 },
      { name: 'DNB Bank', weight: 0.1 }
    ];
    expect(holdingsOverlap(A, B)).toEqual({
      overlapPct: 0,
      shared: [],
      sharedDetail: []
    });
  });

  it('uses the shared MINIMUM weight and lists shared names (cross-source)', () => {
    // "Apple" (Nordnet-style) matches "Apple Inc"; min(0.1, 0.05)=0.05.
    const B = [
      { name: 'Apple', weight: 0.05 },
      { name: 'Samsung', weight: 0.2 }
    ];
    const { overlapPct, shared } = holdingsOverlap(A, B);
    expect(overlapPct).toBeCloseTo(5, 1);
    expect(shared).toEqual(['Apple Inc']);
  });

  it('returns 0 for empty inputs', () => {
    expect(holdingsOverlap([], A).overlapPct).toBe(0);
    expect(holdingsOverlap(A, []).overlapPct).toBe(0);
  });

  it('exposes per-shared-name contributed weight via sharedDetail', () => {
    const B = [
      { name: 'Apple', weight: 0.05 },
      { name: 'Microsoft', weight: 0.2 }
    ];
    const { sharedDetail } = holdingsOverlap(A, B);
    // Apple: min(0.1, 0.05)=0.05; Microsoft: min(0.08, 0.2)=0.08.
    expect(sharedDetail).toEqual([
      { name: 'Apple Inc', weight: 0.05 },
      { name: 'Microsoft Corp', weight: 0.08 }
    ]);
  });
});

describe('ownedSharedShare', () => {
  const sharedDetail = [
    { name: 'Apple Inc', weight: 0.05 },
    { name: 'Microsoft Corp', weight: 0.08 },
    { name: 'NVIDIA', weight: 0.03 }
  ];

  it('is 0 when none of the shared holdings are owned directly', () => {
    expect(ownedSharedShare(sharedDetail, new Set())).toBe(0);
  });

  it('is 100 when every shared holding is owned directly', () => {
    const owned = new Set(['apple', 'microsoft', 'nvidia']);
    expect(ownedSharedShare(sharedDetail, owned)).toBe(100);
  });

  it('is the weight-share of just the owned names, cross-source normalized', () => {
    // Owning "Apple" (0.05) out of a total shared weight of 0.16 -> 31.3%.
    const owned = new Set(['apple']);
    expect(ownedSharedShare(sharedDetail, owned)).toBeCloseTo(31.3, 1);
  });

  it('returns 0 for empty input', () => {
    expect(ownedSharedShare([], new Set(['apple']))).toBe(0);
  });
});

describe('parseYahooStyleBoxIndex', () => {
  it('extracts the index from a real Yahoo Profile page fragment', () => {
    const html =
      '<img alt="Yahoo partners with Morningstar" height="153" ' +
      'src="https://s.yimg.com/lq/i/fi/3_0stylelargeeq2.gif" width="196">';
    expect(parseYahooStyleBoxIndex(html)).toBe(2);
  });

  it('returns undefined when no style-box image is present', () => {
    expect(
      parseYahooStyleBoxIndex('<html><body>nothing here</body></html>')
    ).toBeUndefined();
  });

  it('returns undefined for an out-of-range index', () => {
    expect(
      parseYahooStyleBoxIndex(
        'src="https://s.yimg.com/lq/i/fi/3_0stylelargeeq0.gif"'
      )
    ).toBeUndefined();
  });
});

describe('styleBoxIndexToCell', () => {
  it('decodes the 9 real Yahoo indices verified live (Vanguard Value=1, S&P 500=2, Vanguard Growth=3, iShares World Small Cap/Russell 2000=8)', () => {
    expect(styleBoxIndexToCell(1)).toEqual({ size: 'LARGE', style: 'VALUE' });
    expect(styleBoxIndexToCell(2)).toEqual({ size: 'LARGE', style: 'BLEND' });
    expect(styleBoxIndexToCell(3)).toEqual({ size: 'LARGE', style: 'GROWTH' });
    expect(styleBoxIndexToCell(4)).toEqual({ size: 'MID', style: 'VALUE' });
    expect(styleBoxIndexToCell(5)).toEqual({ size: 'MID', style: 'BLEND' });
    expect(styleBoxIndexToCell(6)).toEqual({ size: 'MID', style: 'GROWTH' });
    expect(styleBoxIndexToCell(7)).toEqual({ size: 'SMALL', style: 'VALUE' });
    expect(styleBoxIndexToCell(8)).toEqual({ size: 'SMALL', style: 'BLEND' });
    expect(styleBoxIndexToCell(9)).toEqual({ size: 'SMALL', style: 'GROWTH' });
  });

  it('returns undefined for out-of-range indices', () => {
    expect(styleBoxIndexToCell(0)).toBeUndefined();
    expect(styleBoxIndexToCell(10)).toBeUndefined();
  });
});

describe('parseYahooExpenseRatioPct', () => {
  it('extracts the real expense ratio from a live Yahoo Profile page fragment', () => {
    const html =
      '<tr class="yf-lvlf4y"><td class="yf-lvlf4y">Annual Report Expense Ratio (net)</td>' +
      '   <td class=" yf-lvlf4y">0.35%</td>  <td class=" yf-lvlf4y">--</td> </tr>';
    expect(parseYahooExpenseRatioPct(html)).toBe(0.35);
  });

  it('returns undefined when the field is absent', () => {
    expect(
      parseYahooExpenseRatioPct('<html><body>nothing here</body></html>')
    ).toBeUndefined();
  });

  it('handles a 0% expense ratio without treating it as absent', () => {
    const html =
      '<td class="yf-lvlf4y">Annual Report Expense Ratio (net)</td>   <td class=" yf-lvlf4y">0.00%</td>';
    expect(parseYahooExpenseRatioPct(html)).toBe(0);
  });
});

describe('classifyStyleBox', () => {
  it('classifies size by median market cap (approximate giant/large, mid, small/micro bands)', () => {
    expect(classifyStyleBox({ medianMarketCap: 50e9 }).size).toBe('LARGE');
    expect(classifyStyleBox({ medianMarketCap: 20e9 }).size).toBe('MID');
    expect(classifyStyleBox({ medianMarketCap: 1e9 }).size).toBe('SMALL');
    expect(classifyStyleBox({}).size).toBeUndefined();
  });

  it('leans GROWTH on high P/E, P/B and earnings growth', () => {
    expect(
      classifyStyleBox({
        priceToBook: 6,
        priceToEarnings: 30,
        threeYearEarningsGrowth: 0.25
      }).style
    ).toBe('GROWTH');
  });

  it('leans VALUE on low valuation and low growth', () => {
    expect(
      classifyStyleBox({
        priceToBook: 1.1,
        priceToEarnings: 10,
        threeYearEarningsGrowth: 0.01
      }).style
    ).toBe('VALUE');
  });

  it('is BLEND in the middle', () => {
    expect(
      classifyStyleBox({
        priceToBook: 3,
        priceToEarnings: 22,
        threeYearEarningsGrowth: 0.1
      }).style
    ).toBe('BLEND');
  });

  it('leaves style undefined with no valuation or growth signals', () => {
    expect(classifyStyleBox({ medianMarketCap: 20e9 }).style).toBeUndefined();
  });

  it('folds priceToSales and priceToCashflow into the value score', () => {
    // Expensive on every value ratio, no growth data -> nets negative (VALUE
    // side is starved of signal so growth defaults neutral, but a very
    // expensive value score alone should still be enough to push GROWTH).
    expect(
      classifyStyleBox({
        priceToBook: 6,
        priceToCashflow: 25,
        priceToEarnings: 40,
        priceToSales: 5
      }).style
    ).toBe('GROWTH');
  });

  it('re-normalizes over whichever value ratios are actually available', () => {
    // Only priceToSales provided (Yahoo doesn't always return all 4) — should
    // still classify using that single signal, not silently drop to undefined.
    expect(classifyStyleBox({ priceToSales: 0.4 }).style).toBe('VALUE');
  });

  it('defaults the missing side to neutral instead of forcing an extreme call off one signal', () => {
    // Growth data only (no value ratios at all) with a middling growth rate
    // should land in BLEND, not be forced to an extreme by a missing value score.
    expect(classifyStyleBox({ threeYearEarningsGrowth: 0.1 }).style).toBe(
      'BLEND'
    );
  });
});
