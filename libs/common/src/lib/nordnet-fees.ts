/**
 * Nordnet commission model. The single source of truth for what a trade costs —
 * nothing anywhere should hard-code a fee figure.
 *
 * Nordnet charges, per order:
 *
 *     fee = fixedFee + commissionPct × tradeValue
 *
 * Both terms always apply: the fixed fee is not a floor that the percentage can
 * replace. A $100 non-Nordic order on Mini costs 9 SEK (~$0.95) PLUS 0.25%
 * ($0.25) = ~$1.20. Buying and selling are separate orders, so a round trip is
 * two charges. Both terms depend on the account's commission class and on
 * whether the venue is Nordic.
 *
 * Because the fixed term is always present, the fee RATE falls as the trade
 * grows — 2.40% round trip at $100, 0.85% at $550, approaching 0.50% for large
 * orders. Trading larger genuinely does amortise the fixed component, with
 * diminishing returns. Two earlier models got this wrong in opposite
 * directions: a flat "$5 per side" until 2026-08-21, then
 * `max(pct × value, minimum)` until 2026-08-26.
 */

export type NordnetCommissionClass = 'MINI' | 'SMALL' | 'MEDIUM' | 'FIXED';

interface CommissionTerms {
  /** Fraction of trade value, e.g. 0.0025 = 0.25%. */
  pct: number;
  /**
   * Fixed component charged on every order, in SEK, ON TOP of the percentage.
   * Nordnet's card labels this "Minst", which reads as a floor but is billed as
   * an addition — see the module comment.
   */
  minSek: number;
}

interface CommissionClassTerms {
  /** Upper bound of the trade size this class is intended for, in SEK. */
  maxTradeSek: number;
  nonNordic: CommissionTerms;
  nordic: CommissionTerms;
}

/**
 * The published rate card. `maxTradeSek` is the size band each class is meant
 * for — it does NOT switch classes automatically, because the class is an
 * account setting rather than a per-order one. It is kept so
 * `suggestCommissionClass` can tell you when you have outgrown your class.
 */
export const NORDNET_COMMISSION_CLASSES: Record<
  NordnetCommissionClass,
  CommissionClassTerms
> = {
  MINI: {
    maxTradeSek: 15_600,
    nonNordic: { minSek: 9, pct: 0.0025 },
    nordic: { minSek: 1, pct: 0.0025 }
  },
  SMALL: {
    maxTradeSek: 46_000,
    nonNordic: { minSek: 49, pct: 0.0015 },
    nordic: { minSek: 39, pct: 0.0015 }
  },
  MEDIUM: {
    maxTradeSek: 143_478,
    nonNordic: { minSek: 69, pct: 0.00089 },
    nordic: { minSek: 69, pct: 0.00069 }
  },
  FIXED: {
    maxTradeSek: Number.POSITIVE_INFINITY,
    // "Fast" is a flat 99 SEK inside the Nordics only. Outside it the card also
    // charges 0.079%, which was stored as zero. That mattered once the model
    // became additive: a flat 99 SEK made this the cheapest class for any
    // non-Nordic order above ~33,700 SEK, which is wrong.
    nonNordic: { minSek: 99, pct: 0.00079 },
    nordic: { minSek: 99, pct: 0 }
  }
};

/**
 * Yahoo suffixes for the Nordic venues Nordnet prices as domestic. Everything
 * else — US, German, UK, Dutch, Swiss — takes the non-Nordic minimum, which for
 * MINI is 9 SEK rather than 1 SEK.
 */
const NORDIC_SUFFIXES = new Set(['CO', 'HE', 'IC', 'OL', 'ST']);

/** True when the symbol trades on a Nordic exchange (Yahoo suffix). */
export function isNordicSymbol(symbol: string): boolean {
  if (!symbol) {
    return false;
  }

  const separatorIndex = symbol.lastIndexOf('.');

  return (
    separatorIndex !== -1 &&
    NORDIC_SUFFIXES.has(symbol.slice(separatorIndex + 1).toUpperCase())
  );
}

/** Commission for one order, in SEK. */
export function nordnetCommissionSek({
  commissionClass,
  isNordic,
  tradeValueSek
}: {
  commissionClass: NordnetCommissionClass;
  isNordic: boolean;
  tradeValueSek: number;
}): number {
  if (!(tradeValueSek > 0)) {
    return 0;
  }

  const terms = NORDNET_COMMISSION_CLASSES[commissionClass];
  const { minSek, pct } = isNordic ? terms.nordic : terms.nonNordic;

  // ADDITIVE, not max(): the fixed component is charged on every order and the
  // percentage is charged on top. A $100 non-Nordic Mini order costs 9 SEK plus
  // 0.25% x $100, i.e. ~$0.95 + $0.25 = ~$1.20 — not $0.95.
  return minSek + pct * tradeValueSek;
}

/**
 * Commission for one order, converted to the engine's base currency (USD).
 *
 * `sekPerUsd` is passed in rather than read from a constant so a caller holding
 * a live rate can use it; the config fallback exists for the pure/offline paths
 * (backtests, unit tests) where no rate service is available.
 */
export function nordnetCommissionUsd({
  commissionClass,
  isNordic,
  sekPerUsd,
  tradeValueUsd
}: {
  commissionClass: NordnetCommissionClass;
  isNordic: boolean;
  sekPerUsd: number;
  tradeValueUsd: number;
}): number {
  if (!(tradeValueUsd > 0) || !(sekPerUsd > 0)) {
    return 0;
  }

  return (
    nordnetCommissionSek({
      commissionClass,
      isNordic,
      tradeValueSek: tradeValueUsd * sekPerUsd
    }) / sekPerUsd
  );
}

/** Round-trip (buy + sell) commission in USD for a position of this size. */
export function nordnetRoundTripUsd(params: {
  commissionClass: NordnetCommissionClass;
  isNordic: boolean;
  sekPerUsd: number;
  tradeValueUsd: number;
}): number {
  return 2 * nordnetCommissionUsd(params);
}

/**
 * The trade value where the fixed component and the percentage component cost
 * the same, in USD.
 *
 * There is no "breakeven" under an additive fee — both terms always apply — so
 * this is a parity point, not a crossover. It is still the number worth knowing,
 * because it says where the bill stops being dominated by the fixed fee: under
 * MINI non-Nordic, 9 / 0.0025 = 3,600 SEK ≈ $380. Below it most of what you pay
 * is the fixed 9 SEK, so increasing size cuts the rate sharply; above it the
 * percentage dominates and the rate flattens out toward 0.25% per order.
 */
export function commissionParityUsd({
  commissionClass,
  isNordic,
  sekPerUsd
}: {
  commissionClass: NordnetCommissionClass;
  isNordic: boolean;
  sekPerUsd: number;
}): number {
  const terms = NORDNET_COMMISSION_CLASSES[commissionClass];
  const { minSek, pct } = isNordic ? terms.nordic : terms.nonNordic;

  if (pct <= 0 || !(sekPerUsd > 0)) {
    return Number.POSITIVE_INFINITY;
  }

  return minSek / pct / sekPerUsd;
}

/**
 * The cheapest class for a given trade size, so an outgrown setting is visible
 * rather than silently expensive. Compares the actual fee each class would
 * charge — the size bands in the rate card are guidance, and near a boundary
 * the lower class can still win (at 15,600 SEK, MINI costs 9 + 39 = 48 SEK
 * against SMALL's 49 + 23.40 = 72.40).
 *
 * Under the additive model SMALL is never the cheapest at any size: MINI wins
 * below ~37,300 SEK and MEDIUM above it. That looks like a bug and is not.
 */
export function suggestCommissionClass({
  isNordic,
  tradeValueSek
}: {
  isNordic: boolean;
  tradeValueSek: number;
}): NordnetCommissionClass {
  const classes = Object.keys(
    NORDNET_COMMISSION_CLASSES
  ) as NordnetCommissionClass[];

  return classes.reduce((best, candidate) => {
    const bestFee = nordnetCommissionSek({
      commissionClass: best,
      isNordic,
      tradeValueSek
    });
    const candidateFee = nordnetCommissionSek({
      commissionClass: candidate,
      isNordic,
      tradeValueSek
    });

    return candidateFee < bestFee ? candidate : best;
  }, classes[0]);
}
