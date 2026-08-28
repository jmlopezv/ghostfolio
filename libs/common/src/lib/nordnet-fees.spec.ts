import {
  commissionParityUsd,
  isNordicSymbol,
  nordnetCommissionSek,
  nordnetCommissionUsd,
  nordnetRoundTripUsd,
  suggestCommissionClass
} from '@ghostfolio/common/nordnet-fees';

// The USDSEK close on 2026-08-21, the day the commission model was rewritten.
const SEK_PER_USD = 9.4645;

describe('isNordicSymbol', () => {
  it('recognises the Nordic venues', () => {
    for (const symbol of ['ASSA-B.ST', 'EQNR.OL', 'NOVO-B.CO', 'NOKIA.HE']) {
      expect(isNordicSymbol(symbol)).toBe(true);
    }
  });

  it('treats US and other European listings as non-Nordic', () => {
    for (const symbol of ['AAPL', 'UNP', 'AIR.DE', 'ULVR.L', 'MC.PA']) {
      expect(isNordicSymbol(symbol)).toBe(false);
    }
  });
});

describe('nordnetCommissionSek', () => {
  it('adds the fixed fee to the percentage rather than taking the larger', () => {
    // MINI non-Nordic: 9 SEK + 0.25% of 5,205 SEK (13.01) = 22.01.
    // Under the retired max() model this was 13.01.
    expect(
      nordnetCommissionSek({
        commissionClass: 'MINI',
        isNordic: false,
        tradeValueSek: 5205
      })
    ).toBeCloseTo(22.0125, 4);
  });

  it('still adds the percentage when it is small next to the fixed fee', () => {
    // 9 SEK + 0.25% of 1,000 SEK (2.50) = 11.50, not 9.
    expect(
      nordnetCommissionSek({
        commissionClass: 'MINI',
        isNordic: false,
        tradeValueSek: 1000
      })
    ).toBeCloseTo(11.5, 6);
  });

  it('applies the lower fixed fee on Nordic venues', () => {
    // Same trade, 1 SEK fixed instead of 9: 1 + 2.50 = 3.50.
    expect(
      nordnetCommissionSek({
        commissionClass: 'MINI',
        isNordic: true,
        tradeValueSek: 1000
      })
    ).toBeCloseTo(3.5, 6);
  });

  it('returns nothing for a zero-value trade', () => {
    expect(
      nordnetCommissionSek({
        commissionClass: 'MINI',
        isNordic: false,
        tradeValueSek: 0
      })
    ).toBe(0);
  });
});

describe('nordnetCommissionUsd', () => {
  it("matches the account holder's own worked example", () => {
    // Stated from the live rate card: a $100 trade costs 0.25% ($0.25) plus
    // 9 SEK (~$0.95), i.e. ~$1.20 — NOT $0.95.
    const fee = nordnetCommissionUsd({
      commissionClass: 'MINI',
      isNordic: false,
      sekPerUsd: SEK_PER_USD,
      tradeValueUsd: 100
    });

    expect(fee).toBeCloseTo(1.2009, 3);
  });

  it('prices a $550 US order under MINI', () => {
    const fee = nordnetCommissionUsd({
      commissionClass: 'MINI',
      isNordic: false,
      sekPerUsd: SEK_PER_USD,
      tradeValueUsd: 550
    });

    // 550 x 9.4645 = 5,205 SEK; 9 + 13.01 = 22.01 SEK; /9.4645 = $2.326.
    expect(fee).toBeCloseTo(2.326, 3);
  });

  it('makes a $550 round trip 0.85% of the position', () => {
    const roundTrip = nordnetRoundTripUsd({
      commissionClass: 'MINI',
      isNordic: false,
      sekPerUsd: SEK_PER_USD,
      tradeValueUsd: 550
    });

    expect(roundTrip).toBeCloseTo(4.65, 2);
    expect(roundTrip / 550).toBeCloseTo(0.00846, 4);
  });

  it('rewards size at every level, because the fixed fee always amortises', () => {
    // The opposite of the retired max() model, where the rate was constant
    // above the threshold. Here the rate falls monotonically.
    const rate = (tradeValueUsd: number) =>
      nordnetRoundTripUsd({
        commissionClass: 'MINI',
        isNordic: false,
        sekPerUsd: SEK_PER_USD,
        tradeValueUsd
      }) / tradeValueUsd;

    const sizes = [100, 250, 400, 550, 1000, 5000];

    for (let i = 1; i < sizes.length; i++) {
      expect(rate(sizes[i])).toBeLessThan(rate(sizes[i - 1]));
    }

    // 2.40% at $100 down toward the 0.50% asymptote (2 x 0.25%).
    expect(rate(100)).toBeCloseTo(0.024, 3);
    expect(rate(5000)).toBeGreaterThan(0.005);
    expect(rate(5000)).toBeLessThan(0.0055);
  });

  it('doubling the position less than doubles the fee', () => {
    const small = nordnetRoundTripUsd({
      commissionClass: 'MINI',
      isNordic: false,
      sekPerUsd: SEK_PER_USD,
      tradeValueUsd: 500
    });
    const large = nordnetRoundTripUsd({
      commissionClass: 'MINI',
      isNordic: false,
      sekPerUsd: SEK_PER_USD,
      tradeValueUsd: 1000
    });

    expect(large).toBeLessThan(2 * small);
    expect(large).toBeGreaterThan(small);
  });
});

describe('commissionParityUsd', () => {
  it('locates where the fixed fee and the percentage cost the same', () => {
    // 9 SEK / 0.0025 = 3,600 SEK; /9.4645 = $380. Not a crossover under an
    // additive fee — both terms always apply — but the point where the bill
    // stops being dominated by the fixed component.
    expect(
      commissionParityUsd({
        commissionClass: 'MINI',
        isNordic: false,
        sekPerUsd: SEK_PER_USD
      })
    ).toBeCloseTo(380.37, 1);
  });

  it('is far lower on Nordic venues, where the fixed fee is 1 SEK', () => {
    expect(
      commissionParityUsd({
        commissionClass: 'MINI',
        isNordic: true,
        sekPerUsd: SEK_PER_USD
      })
    ).toBeCloseTo(42.26, 1);
  });
});

describe('suggestCommissionClass', () => {
  it('keeps MINI for the trade sizes this account actually uses', () => {
    expect(
      suggestCommissionClass({ isNordic: false, tradeValueSek: 5205 })
    ).toBe('MINI');
  });

  it('keeps MINI right up to its ceiling, where SMALL is still dearer', () => {
    // At 15,600 SEK: MINI = 9 + 39 = 48, SMALL = 49 + 23.40 = 72.40.
    expect(
      suggestCommissionClass({ isNordic: false, tradeValueSek: 15_600 })
    ).toBe('MINI');
  });

  it('moves to a cheaper class once the trade is genuinely large', () => {
    // At 100,000 SEK: MINI = 259, SMALL = 199, MEDIUM = 158, FIXED = 178.
    // FIXED only wins here if its non-Nordic percentage is missing.
    expect(
      suggestCommissionClass({ isNordic: false, tradeValueSek: 100_000 })
    ).toBe('MEDIUM');
  });

  it('never recommends SMALL, which is dominated at every size', () => {
    // MINI is cheaper below ~37,300 SEK and MEDIUM above it, so SMALL is
    // always beaten. Surprising enough to pin down rather than rediscover.
    for (const tradeValueSek of [1_000, 20_000, 37_000, 46_000, 100_000]) {
      expect(
        suggestCommissionClass({ isNordic: false, tradeValueSek })
      ).not.toBe('SMALL');
    }
  });
});
