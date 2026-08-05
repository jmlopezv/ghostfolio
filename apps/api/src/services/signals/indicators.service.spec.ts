import { IndicatorsService } from './indicators.service';

describe('IndicatorsService', () => {
  let service: IndicatorsService;

  beforeEach(() => {
    service = new IndicatorsService();
  });

  describe('sma', () => {
    it('computes the simple moving average', () => {
      expect(service.sma([1, 2, 3, 4, 5], 5)).toBe(3);
      expect(service.sma([2, 4, 6], 2)).toBe(5);
    });

    it('returns null with insufficient data', () => {
      expect(service.sma([1, 2], 5)).toBeNull();
    });
  });

  describe('rsi', () => {
    it('approaches 100 for a monotonically rising series', () => {
      const series = Array.from({ length: 30 }, (_, i) => 100 + i);

      expect(service.rsi(series)).toBeGreaterThan(95);
    });

    it('approaches 0 for a monotonically falling series', () => {
      const series = Array.from({ length: 30 }, (_, i) => 100 - i);

      expect(service.rsi(series)).toBeLessThan(5);
    });
  });

  describe('bollinger', () => {
    it('returns pctB of 0.5 for a flat series', () => {
      const { lower, pctB, upper } = service.bollinger(Array(20).fill(100), 20);

      expect(lower).toBe(100);
      expect(upper).toBe(100);
      expect(pctB).toBe(0.5);
    });

    it('keeps pctB within [0, 1] for the latest price inside the band', () => {
      const series = [
        98, 99, 100, 101, 102, 101, 100, 99, 100, 101, 102, 103, 101, 100, 99,
        100, 101, 102, 100, 101
      ];
      const { pctB } = service.bollinger(series, 20);

      expect(pctB).toBeGreaterThanOrEqual(0);
      expect(pctB).toBeLessThanOrEqual(1);
    });
  });

  describe('momentum', () => {
    it('computes percentage change over the lookback', () => {
      expect(service.momentum([100, 110, 120], 2)).toBeCloseTo(0.2);
    });
  });

  describe('computeScore', () => {
    it('returns a value between 0 and 100', () => {
      const series = Array.from(
        { length: 260 },
        (_, i) => 100 + Math.sin(i / 5) * 5
      );
      const snapshot = service.computeSnapshot(series);
      const score = service.computeScore(snapshot);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    // Pins the actual weighting (bollinger .30, rsi .25, macd .15,
    // trend .15, momentum .15) rather than just a 0-100 bound, so a change
    // to any weight or threshold fails loudly instead of silently reshaping
    // which names clear SIGNAL_BUY_SCORE_MIN.
    it('applies the documented weights to a known snapshot', () => {
      const snapshot = {
        bollinger: { lower: 90, middle: 100, pctB: 0.2, upper: 110 },
        macd: { histogram: 1, macd: 0, signal: 0 },
        momentum3M: 0.1,
        momentum12M: 0.2,
        price: 120,
        rsi: 40,
        sma50: 110,
        sma200: 100,
        volatility: 0.02
      };

      // 0.25*(100-40) + 0.30*(1-0.2)*100 + 0.15*100 (histogram >= 0)
      //   + 0.15*100 (price >= sma200) + 0.15*100 (momentum12M >= 0) = 84
      expect(service.computeScore(snapshot)).toBe(84);
    });

    it('renormalises when indicators are missing rather than scoring 0', () => {
      const snapshot = {
        bollinger: { lower: null, middle: null, pctB: null, upper: null },
        macd: { histogram: null, macd: null, signal: null },
        momentum3M: null,
        momentum12M: null,
        price: 120,
        rsi: 40,
        sma50: null,
        sma200: null,
        volatility: 0.02
      } as unknown as Parameters<typeof service.computeScore>[0];

      // Only RSI contributes: (0.25 * 60) / 0.25 = 60, not 15.
      expect(service.computeScore(snapshot)).toBe(60);
    });
  });

  describe('volatility', () => {
    it('is deflated by forward-filled weekend rows (the calendar-day bug)', () => {
      // Alternating +2%/-2% on trading days.
      const tradingDays: number[] = [100];

      for (let i = 1; i < 200; i++) {
        tradingDays.push(tradingDays[i - 1] * (i % 2 === 0 ? 1.02 : 0.98));
      }

      // The same path with two flat (forward-filled) days after every five,
      // exactly how MarketData stores weekends.
      const withWeekends: number[] = [];

      for (let i = 0; i < tradingDays.length; i++) {
        withWeekends.push(tradingDays[i]);

        if (i % 5 === 4) {
          withWeekends.push(tradingDays[i], tradingDays[i]);
        }
      }

      const clean = service.volatility(tradingDays);
      const polluted = service.volatility(withWeekends);

      // Zero-return days dilute the sample by sqrt(5/7) ~ 0.845.
      expect(polluted / clean).toBeCloseTo(Math.sqrt(5 / 7), 2);
      expect(polluted).toBeLessThan(clean);
    });

    it('is pinned to its lookback, not the length of the array it is given', () => {
      const rng = (seed: number) => {
        let x = seed;

        return () => {
          x = (x * 1103515245 + 12345) % 2147483648;

          return x / 2147483648;
        };
      };
      const next = rng(42);
      const long: number[] = [100];

      for (let i = 1; i < 900; i++) {
        long.push(long[i - 1] * (1 + (next() - 0.5) * 0.04));
      }

      // Same trailing 252 observations -> same sigma, regardless of how much
      // older history is prepended (see SIGNAL_VOLATILITY_LOOKBACK_DAYS).
      expect(service.volatility(long)).toBeCloseTo(
        service.volatility(long.slice(-253)),
        10
      );
    });
  });

  describe('adaptiveTakeProfitLevel', () => {
    it('uses the floor when volatility is zero', () => {
      const level = service.adaptiveTakeProfitLevel({
        averageBuyPrice: 100,
        floorPct: 0.08,
        horizonDays: 15,
        volatility: 0,
        volMult: 1.5
      });

      expect(level).toBeCloseTo(108);
    });

    it('scales the target up with volatility', () => {
      const level = service.adaptiveTakeProfitLevel({
        averageBuyPrice: 100,
        floorPct: 0.08,
        horizonDays: 15,
        volatility: 0.02, // band = 0.02 * sqrt(15) ≈ 0.0775; 1.5*band ≈ 0.116
        volMult: 1.5
      });

      // 1.5*band (≈11.6%) exceeds the 8% floor, so target ≈ 111.6.
      expect(level).toBeGreaterThan(108);
      expect(level).toBeCloseTo(100 * (1 + 1.5 * 0.02 * Math.sqrt(15)));
    });

    it('adds the per-share fee to the cost basis', () => {
      const withFee = service.adaptiveTakeProfitLevel({
        averageBuyPrice: 100,
        feePerShare: 5,
        floorPct: 0.08,
        horizonDays: 15,
        volatility: 0,
        volMult: 1.5
      });

      expect(withFee).toBeCloseTo(105 * 1.08);
    });
  });

  describe('stopLossLevel', () => {
    it('is below the average buy price by the vol band', () => {
      const stop = service.stopLossLevel({
        averageBuyPrice: 100,
        horizonDays: 15,
        volatility: 0.02,
        volMult: 2
      });

      expect(stop).toBeCloseTo(100 * (1 - 2 * 0.02 * Math.sqrt(15)));
      expect(stop).toBeLessThan(100);
    });

    it('equals the buy price when volatility is zero', () => {
      const stop = service.stopLossLevel({
        averageBuyPrice: 100,
        horizonDays: 15,
        volatility: 0,
        volMult: 2
      });

      expect(stop).toBeCloseTo(100);
    });
  });

  describe('trailingStopLevel', () => {
    it('trails below the running peak by the vol band', () => {
      const trail = service.trailingStopLevel({
        horizonDays: 15,
        peak: 120,
        volatility: 0.02,
        volMult: 1
      });

      expect(trail).toBeCloseTo(120 * (1 - 1 * 0.02 * Math.sqrt(15)));
      expect(trail).toBeLessThan(120);
    });
  });

  describe('isDowntrend', () => {
    it('flags a confirmed downtrend', () => {
      const series = Array.from({ length: 260 }, (_, i) => 300 - i);
      const snapshot = service.computeSnapshot(series);

      expect(service.isDowntrend(snapshot)).toBe(true);
    });
  });

  describe('reversalStructure', () => {
    it('is not a reversal while still making new lows (falling knife)', () => {
      // Monotonic decline: below SMA200, no higher-low, RSI not turning up.
      const series = Array.from({ length: 260 }, (_, i) => 300 - i);
      const r = service.reversalStructure(series);

      expect(r.beatenDown).toBe(true);
      expect(r.isReversal).toBe(false);
    });

    it('flags a reversal after a downtrend bottoms and turns up', () => {
      // Long decline (beaten down, below SMA200) then a choppy, realistic
      // recovery: a higher low, a reclaim of the 20-day, and RSI rising through
      // mid-range (not a vertical rip into overbought) and ending on an up day.
      const decline = Array.from({ length: 240 }, (_, i) => 300 - i); // 300→61
      const bounce = [58, 60, 59, 62, 61, 64, 63, 65, 64, 66, 65, 67];
      const r = service.reversalStructure([...decline, ...bounce]);

      expect(r.beatenDown).toBe(true);
      expect(r.rsiTurningUp).toBe(true);
      expect(r.higherLow).toBe(true);
      expect(r.isReversal).toBe(true);
      expect(r.rsi).toBeLessThan(70); // rising, but not overbought
    });
  });

  describe('OHLC volatility (Garman-Klass / Yang-Zhang)', () => {
    const flat = Array.from({ length: 10 }, () => ({
      close: 100,
      high: 100,
      low: 100,
      open: 100
    }));

    it('returns 0 for a flat (no-range, no-gap) series', () => {
      expect(service.garmanKlass(flat)).toBeCloseTo(0);
      expect(service.yangZhang(flat)).toBeCloseTo(0);
    });

    it('returns a positive volatility when there is intraday range', () => {
      const bars = Array.from({ length: 12 }, (_, i) => ({
        close: 100 + (i % 2 === 0 ? 1 : -1),
        high: 103,
        low: 97,
        open: 100
      }));

      expect(service.garmanKlass(bars)).toBeGreaterThan(0);
      expect(service.yangZhang(bars)).toBeGreaterThan(0);
    });
  });

  describe('adaptiveBuyLevel', () => {
    it('defaults to the 1.5-sigma stock band (backward compatible)', () => {
      const implicit = service.adaptiveBuyLevel({
        dropPct: 0.1,
        horizonDays: 42,
        recentHigh: 100,
        volatility: 0.02
      });
      const explicit = service.adaptiveBuyLevel({
        dropPct: 0.1,
        horizonDays: 42,
        recentHigh: 100,
        sigmaMult: 1.5,
        volatility: 0.02
      });

      expect(implicit).toBe(explicit);
      // 1.5 · 0.02 · √42 ≈ 19.4% drop dominates the 10% fixed leg.
      expect(implicit).toBeCloseTo(100 * (1 - 1.5 * 0.02 * Math.sqrt(42)), 6);
    });

    it('a 1.0-sigma band yields a higher (easier) buy level than 1.5-sigma', () => {
      const stock = service.adaptiveBuyLevel({
        dropPct: 0.1,
        horizonDays: 42,
        recentHigh: 100,
        sigmaMult: 1.5,
        volatility: 0.02
      });
      const etf = service.adaptiveBuyLevel({
        dropPct: 0.05,
        horizonDays: 42,
        recentHigh: 100,
        sigmaMult: 1.0,
        volatility: 0.02
      });

      expect(etf).toBeGreaterThan(stock);
    });

    it('sigmaMult is irrelevant when volatility is 0 (fixed leg dominates)', () => {
      const a = service.adaptiveBuyLevel({
        dropPct: 0.05,
        horizonDays: 42,
        recentHigh: 100,
        sigmaMult: 1.0,
        volatility: 0
      });
      const b = service.adaptiveBuyLevel({
        dropPct: 0.05,
        horizonDays: 42,
        recentHigh: 100,
        sigmaMult: 1.5,
        volatility: 0
      });

      expect(a).toBe(95);
      expect(b).toBe(95);
    });

    it('a calm ETF 5.5% off its high triggers under ETF calibration but not stock calibration', () => {
      // Daily σ ≈ 0.006 (calm, diversified): stock geometry needs
      // max(10%, 1.5·0.006·√42 ≈ 5.8%) = 10%; ETF geometry needs
      // max(5%, 1.0·0.006·√42 ≈ 3.9%) = 5%.
      const recentHigh = 100;
      const volatility = 0.006;
      const price = 94.5; // 5.5% below the high

      const stockLevel = service.adaptiveBuyLevel({
        dropPct: 0.1,
        horizonDays: 42,
        recentHigh,
        sigmaMult: 1.5,
        volatility
      });
      const etfLevel = service.adaptiveBuyLevel({
        dropPct: 0.05,
        horizonDays: 42,
        recentHigh,
        sigmaMult: 1.0,
        volatility
      });

      expect(price).toBeGreaterThan(stockLevel); // no trigger as a stock
      expect(price).toBeLessThanOrEqual(etfLevel); // triggers as an ETF
    });
  });
});
