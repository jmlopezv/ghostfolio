import {
  SIGNAL_BUY_SIGMA_MULT,
  SIGNAL_DEFAULT_BUY_DROP_PCT,
  SIGNAL_ETF_BUY_DROP_PCT,
  SIGNAL_ETF_BUY_SIGMA_MULT
} from '@ghostfolio/common/config';

export interface BuyCalibration {
  buyDropPct: number;
  buySigmaMult: number;
}

/**
 * Asset-type-aware buy-dip calibration. Stocks keep the classic
 * max(10%, 1.5σ√horizon) required drop; ETFs — which are diversified and
 * essentially never print a 10% drop off a 30-day high outside a crash —
 * get a shallower 5% floor and a 1.0σ band.
 *
 * Override rule: a stored per-symbol `buyDropPct` counts as an explicit user
 * override only when it differs from SIGNAL_DEFAULT_BUY_DROP_PCT. The
 * SignalConfig column is non-nullable with a DB default of 0.1, so a row
 * created merely to set `isActiveTrade`/`cashThreshold` holds 0.1 and must
 * still be treated as "unset" for an ETF. (Caveat: a user deliberately
 * setting exactly 0.10 on an ETF is indistinguishable from the default and
 * will be re-calibrated to the ETF floor.)
 *
 * `buySigmaMult` is engine calibration, never user-overridable.
 */
export function resolveBuyCalibration({
  assetSubClass,
  storedBuyDropPct
}: {
  assetSubClass: string | null | undefined;
  storedBuyDropPct?: number;
}): BuyCalibration {
  const isEtf = assetSubClass === 'ETF';

  const defaultDropPct = isEtf
    ? SIGNAL_ETF_BUY_DROP_PCT
    : SIGNAL_DEFAULT_BUY_DROP_PCT;

  const hasExplicitOverride =
    storedBuyDropPct != null &&
    storedBuyDropPct !== SIGNAL_DEFAULT_BUY_DROP_PCT;

  return {
    buyDropPct: hasExplicitOverride ? storedBuyDropPct : defaultDropPct,
    buySigmaMult: isEtf ? SIGNAL_ETF_BUY_SIGMA_MULT : SIGNAL_BUY_SIGMA_MULT
  };
}
