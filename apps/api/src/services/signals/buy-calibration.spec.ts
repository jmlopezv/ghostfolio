import {
  SIGNAL_BUY_SIGMA_MULT,
  SIGNAL_DEFAULT_BUY_DROP_PCT,
  SIGNAL_ETF_BUY_DROP_PCT,
  SIGNAL_ETF_BUY_SIGMA_MULT
} from '@ghostfolio/common/config';

import { resolveBuyCalibration } from './buy-calibration';

describe('resolveBuyCalibration', () => {
  it('gives ETFs the shallower ETF defaults', () => {
    expect(resolveBuyCalibration({ assetSubClass: 'ETF' })).toEqual({
      buyDropPct: SIGNAL_ETF_BUY_DROP_PCT,
      buySigmaMult: SIGNAL_ETF_BUY_SIGMA_MULT
    });
  });

  it('gives stocks, null and undefined asset types the stock defaults', () => {
    for (const assetSubClass of ['STOCK', null, undefined, 'CRYPTOCURRENCY']) {
      expect(resolveBuyCalibration({ assetSubClass })).toEqual({
        buyDropPct: SIGNAL_DEFAULT_BUY_DROP_PCT,
        buySigmaMult: SIGNAL_BUY_SIGMA_MULT
      });
    }
  });

  it('keeps an explicit per-symbol buyDropPct override on an ETF', () => {
    expect(
      resolveBuyCalibration({ assetSubClass: 'ETF', storedBuyDropPct: 0.08 })
    ).toEqual({
      buyDropPct: 0.08,
      // Sigma mult is engine calibration — never user-overridable.
      buySigmaMult: SIGNAL_ETF_BUY_SIGMA_MULT
    });
  });

  it('treats a stored buyDropPct equal to the stock default as unset (non-nullable DB column)', () => {
    expect(
      resolveBuyCalibration({
        assetSubClass: 'ETF',
        storedBuyDropPct: SIGNAL_DEFAULT_BUY_DROP_PCT
      })
    ).toEqual({
      buyDropPct: SIGNAL_ETF_BUY_DROP_PCT,
      buySigmaMult: SIGNAL_ETF_BUY_SIGMA_MULT
    });
  });

  it('keeps an explicit override on a stock too', () => {
    expect(
      resolveBuyCalibration({ assetSubClass: 'STOCK', storedBuyDropPct: 0.05 })
    ).toEqual({
      buyDropPct: 0.05,
      buySigmaMult: SIGNAL_BUY_SIGMA_MULT
    });
  });
});
