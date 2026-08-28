import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import {
  SIGNAL_BACKTEST_POSITION_SIZE,
  SIGNAL_BACKTEST_SLIPPAGE_BPS,
  SIGNAL_NORDNET_COMMISSION_CLASS,
  SIGNAL_BUY_SCORE_MIN,
  SIGNAL_BUY_SIGMA_MULT,
  SIGNAL_DEFAULT_BUY_DROP_PCT,
  SIGNAL_DEFAULT_TAKE_PROFIT_PCT,
  SIGNAL_EXIT_MODE,
  SIGNAL_HOLD_TRAIL_PCT,
  SIGNAL_HORIZON_DAYS,
  SIGNAL_SEK_PER_USD_FALLBACK,
  SIGNAL_STOP_VOL_MULT,
  SIGNAL_TAKE_PROFIT_FLOOR_PCT,
  SIGNAL_TAKE_PROFIT_VOL_MULT,
  SIGNAL_TRAIL_VOL_MULT,
  SignalExitMode
} from '@ghostfolio/common/config';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import { BacktestResult, BacktestTrade } from '@ghostfolio/common/interfaces';
import {
  isNordicSymbol,
  nordnetRoundTripUsd
} from '@ghostfolio/common/nordnet-fees';

import { Injectable } from '@nestjs/common';
import { DataSource } from '@prisma/client';
import { format, subYears } from 'date-fns';

/**
 * Tier 3: replays the buy-the-dip / take-profit rule over historical EOD data to
 * validate and tune thresholds before they are trusted for live alerts. Runs on
 * demand (admin endpoint / CLI) - never on the 30-minute hot path.
 */
@Injectable()
export class BacktestService {
  // Minimum observations before the indicators are meaningful. Must clear the
  // longest window any indicator uses - SMA200 and momentum12M both need 252
  // bars, so anything below that silently yields `null` for those terms and
  // `computeScore` renormalises them away (and `isDowntrend` returns false),
  // i.e. the scorer under test is not the scorer that runs live. The previous
  // value of 50 did exactly that for the first ~200 bars of every run.
  private static readonly WARMUP = 252;

  public constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly marketDataService: MarketDataService
  ) {}

  public async backtest({
    buyDropPct = SIGNAL_DEFAULT_BUY_DROP_PCT,
    buySigmaMult = SIGNAL_BUY_SIGMA_MULT,
    dataSource,
    exitMode = SIGNAL_EXIT_MODE,
    from,
    positionSize = SIGNAL_BACKTEST_POSITION_SIZE,
    slippageBps = SIGNAL_BACKTEST_SLIPPAGE_BPS,
    symbol,
    takeProfitPct = SIGNAL_DEFAULT_TAKE_PROFIT_PCT,
    to = new Date()
  }: {
    buyDropPct?: number;
    buySigmaMult?: number;
    dataSource: DataSource;
    exitMode?: SignalExitMode;
    from?: Date;
    positionSize?: number;
    slippageBps?: number;
    symbol: string;
    takeProfitPct?: number;
    to?: Date;
  }): Promise<BacktestResult> {
    const marketData = await this.marketDataService.getRange({
      assetProfileIdentifiers: [{ dataSource, symbol }],
      dateQuery: { gte: from ?? subYears(to, 1) }
    });

    const series = marketData
      .filter(({ date, symbol: rowSymbol }) => {
        return rowSymbol === symbol && date <= to;
      })
      .map(({ date, marketPrice }) => ({ date, marketPrice }));

    return this.run({
      buyDropPct,
      buySigmaMult,
      dataSource,
      exitMode,
      positionSize,
      series,
      slippageBps,
      symbol,
      takeProfitPct
    });
  }

  public run({
    buyDropPct,
    buySigmaMult = SIGNAL_BUY_SIGMA_MULT,
    dataSource,
    exitMode = SIGNAL_EXIT_MODE,
    positionSize = SIGNAL_BACKTEST_POSITION_SIZE,
    series,
    slippageBps = SIGNAL_BACKTEST_SLIPPAGE_BPS,
    symbol,
    takeProfitPct,
    warmupBars = BacktestService.WARMUP
  }: {
    buyDropPct: number;
    buySigmaMult?: number;
    dataSource: DataSource;
    exitMode?: SignalExitMode;
    positionSize?: number;
    series: { date: Date; marketPrice: number }[];
    slippageBps?: number;
    symbol: string;
    takeProfitPct: number;
    /**
     * Bars to skip before trading starts. Exposed so two runs over series of
     * different bar density (e.g. calendar-day vs trading-day) can be made to
     * begin on the same calendar date, which is what makes them comparable.
     */
    warmupBars?: number;
  }): BacktestResult {
    // Trading days only, so the replayed indicator windows match the live
    // engine's and `years = bars / 252` below is a real year count.
    const tradingDaySeries = series.filter(({ date }) => {
      const day = date.getUTCDay();

      return day >= 1 && day <= 5;
    });
    const closes = tradingDaySeries.map(({ marketPrice }) => marketPrice);
    const { entryIndices, equityCurve, openAtEnd, trades } = this.simulate({
      buyDropPct,
      buySigmaMult,
      closes,
      exitMode,
      positionSize,
      series: tradingDaySeries,
      slippageBps,
      symbol,
      takeProfitPct,
      warmupBars
    });

    const start = warmupBars;
    const tradingDays = Math.max(0, closes.length - start);
    // Out-of-sample = the held-out last 30% of the tradeable window.
    const splitIndex = start + Math.floor(tradingDays * 0.7);

    const realized = trades.filter(({ exitReason }) => exitReason !== 'OPEN');
    const wins = realized.filter(({ netReturnPct }) => netReturnPct > 0).length;
    const avg = (nums: number[]) =>
      nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;

    const fullMetrics = this.metrics(equityCurve.slice(start));
    const totalNetReturnPct = this.compound(trades.map((t) => t.netReturnPct));

    // Profit factor = gross gains ÷ gross losses (on net trade $).
    const grossGain = trades
      .filter((t) => t.netReturnPct > 0)
      .reduce((s, t) => s + (t.netReturnPct / 100) * positionSize, 0);
    const grossLoss = Math.abs(
      trades
        .filter((t) => t.netReturnPct < 0)
        .reduce((s, t) => s + (t.netReturnPct / 100) * positionSize, 0)
    );

    const exposureBars = trades.reduce((s, t) => s + t.holdingDays, 0);
    // Valid because the series was filtered to trading days above; on the raw
    // calendar-day MarketData series (~365 bars/yr) this overstated elapsed
    // years by ~1.45x and correspondingly deflated the CAGR.
    const years = tradingDays > 0 ? tradingDays / 252 : 0;
    const cagrPct =
      years > 0
        ? (Math.pow(1 + totalNetReturnPct / 100, 1 / years) - 1) * 100
        : 0;
    const benchmarkReturnPct =
      closes[start] > 0
        ? (closes[closes.length - 1] / closes[start] - 1) * 100
        : 0;

    // Out-of-sample summary: equity re-based at the split, trades entered after it.
    const oosCurve = equityCurve.slice(splitIndex);
    const oosTrades = trades.filter((_, i) => entryIndices[i] >= splitIndex);
    const oosRealized = oosTrades.filter((t) => t.exitReason !== 'OPEN');
    const oosMetrics = this.metrics(oosCurve);

    return {
      avgHoldingDays: avg(trades.map(({ holdingDays }) => holdingDays)),
      avgNetReturnPct: avg(trades.map(({ netReturnPct }) => netReturnPct)),
      avgReturnPct: avg(trades.map(({ returnPct }) => returnPct)),
      benchmarkReturnPct,
      cagrPct,
      calmar:
        fullMetrics.maxDrawdownPct > 0
          ? cagrPct / fullMetrics.maxDrawdownPct
          : 0,
      dataSource,
      exposurePct: tradingDays > 0 ? (exposureBars / tradingDays) * 100 : 0,
      maxDrawdownPct: fullMetrics.maxDrawdownPct,
      openAtEnd,
      outOfSample: {
        maxDrawdownPct: oosMetrics.maxDrawdownPct,
        sharpe: oosMetrics.sharpe,
        sortino: oosMetrics.sortino,
        totalNetReturnPct: this.compound(oosTrades.map((t) => t.netReturnPct)),
        trades: oosRealized.length,
        winRate:
          oosRealized.length > 0
            ? oosRealized.filter((t) => t.netReturnPct > 0).length /
              oosRealized.length
            : 0
      },
      positionSize,
      profitFactor:
        grossLoss > 0 ? grossGain / grossLoss : grossGain > 0 ? 99 : 0,
      sharpe: fullMetrics.sharpe,
      slippageBps,
      sortino: fullMetrics.sortino,
      stopLossExits: trades.filter((t) => t.exitReason === 'STOP_LOSS').length,
      symbol,
      totalNetReturnPct,
      totalReturnPct: this.compound(trades.map((t) => t.returnPct)),
      tradingDays,
      trades,
      trailingExits: trades.filter((t) => t.exitReason === 'TRAILING').length,
      winRate: realized.length > 0 ? wins / realized.length : 0
    };
  }

  /**
   * Replays the live exit state machine over the close series. Entry/exit prices
   * include a slippage haircut (a partial proxy for spread + gapping through
   * stops, which EOD data can't model exactly). Returns trades, a per-bar equity
   * curve (for risk metrics) and each trade's entry bar index (for the OOS split).
   */
  private simulate({
    buyDropPct,
    buySigmaMult,
    closes,
    exitMode,
    positionSize,
    series,
    slippageBps,
    symbol,
    takeProfitPct,
    warmupBars
  }: {
    buyDropPct: number;
    buySigmaMult: number;
    closes: number[];
    exitMode: SignalExitMode;
    positionSize: number;
    series: { date: Date; marketPrice: number }[];
    slippageBps: number;
    /** Needed for the commission model: Nordic venues have a lower minimum. */
    symbol: string;
    takeProfitPct: number;
    warmupBars: number;
  }): {
    entryIndices: number[];
    equityCurve: number[];
    openAtEnd: number;
    trades: BacktestTrade[];
  } {
    const trades: BacktestTrade[] = [];
    const entryIndices: number[] = [];
    const equityCurve: number[] = [];
    // Commission is a percentage of trade value under the current Nordnet
    // class, not a flat amount, so it scales with the position being modelled.
    const roundTripFee = nordnetRoundTripUsd({
      commissionClass: SIGNAL_NORDNET_COMMISSION_CLASS,
      isNordic: isNordicSymbol(symbol),
      sekPerUsd: SIGNAL_SEK_PER_USD_FALLBACK,
      tradeValueUsd: positionSize
    });
    const slip = slippageBps / 10_000;

    let entryIndex: number | null = null;
    let trailingPeak: number | null = null; // null = WATCHING, set = TRAILING
    let realizedEquity = 1;
    let peakEquity = 1;

    const closePosition = (
      exitIndex: number,
      rawExitPrice: number,
      exitReason: 'STOP_LOSS' | 'TRAILING' | 'OPEN'
    ) => {
      // Pay slippage: buy a touch higher, sell a touch lower.
      const entryPrice = closes[entryIndex] * (1 + slip);
      const exitPrice = rawExitPrice * (1 - slip);
      const shares = positionSize / entryPrice;
      const netPnl = (exitPrice - entryPrice) * shares - roundTripFee;

      trades.push({
        buyDate: format(series[entryIndex].date, DATE_FORMAT),
        buyPrice: entryPrice,
        exitReason,
        holdingDays: exitIndex - entryIndex,
        netReturnPct: (netPnl / positionSize) * 100,
        returnPct: (exitPrice / entryPrice - 1) * 100,
        sellDate: format(series[exitIndex].date, DATE_FORMAT),
        sellPrice: exitPrice
      });
      entryIndices.push(entryIndex);

      realizedEquity = realizedEquity * (1 + netPnl / positionSize);
      entryIndex = null;
      trailingPeak = null;
    };

    for (let i = warmupBars; i < series.length; i++) {
      const price = closes[i];
      const window = closes.slice(0, i + 1);
      const snapshot = this.indicatorsService.computeSnapshot(window);
      const recentHigh =
        this.indicatorsService.highestClose(window, 30) ?? price;
      let equity = realizedEquity;

      if (entryIndex === null) {
        const buyLevel = this.indicatorsService.adaptiveBuyLevel({
          dropPct: buyDropPct,
          horizonDays: SIGNAL_HORIZON_DAYS,
          price,
          recentHigh,
          sigmaMult: buySigmaMult,
          volatility: snapshot.volatility
        });
        const score = this.indicatorsService.computeScore(snapshot);
        const isUpDay = i > 0 ? price > closes[i - 1] : false;

        if (
          price <= buyLevel &&
          !this.indicatorsService.isDowntrend(snapshot) &&
          score >= SIGNAL_BUY_SCORE_MIN &&
          isUpDay
        ) {
          entryIndex = i;
          trailingPeak = null;
        }
      } else {
        const entryPrice = closes[entryIndex];
        const feePerShare = roundTripFee / (positionSize / entryPrice);
        equity = realizedEquity * (price / entryPrice);

        if (exitMode === 'hold-with-stop') {
          // Let winners run: no take-profit. A single wide peak-trailing stop
          // ratchets up from entry — cuts losses, locks big gains, gives room.
          const peak = Math.max(trailingPeak ?? entryPrice, price);
          trailingPeak = peak;
          const holdStop = peak * (1 - SIGNAL_HOLD_TRAIL_PCT);

          if (price <= holdStop) {
            closePosition(
              i,
              price,
              price > entryPrice ? 'TRAILING' : 'STOP_LOSS'
            );
          }
        } else {
          const target = this.indicatorsService.adaptiveTakeProfitLevel({
            averageBuyPrice: entryPrice,
            feePerShare,
            floorPct: Math.max(SIGNAL_TAKE_PROFIT_FLOOR_PCT, takeProfitPct),
            horizonDays: SIGNAL_HORIZON_DAYS,
            volatility: snapshot.volatility,
            volMult: SIGNAL_TAKE_PROFIT_VOL_MULT
          });

          if (trailingPeak === null) {
            const stop = this.indicatorsService.stopLossLevel({
              averageBuyPrice: entryPrice,
              horizonDays: SIGNAL_HORIZON_DAYS,
              volatility: snapshot.volatility,
              volMult: SIGNAL_STOP_VOL_MULT
            });

            if (price <= stop) {
              closePosition(i, price, 'STOP_LOSS');
            } else if (price >= target) {
              trailingPeak = price;
            }
          } else {
            trailingPeak = Math.max(trailingPeak, price);
            const trail = this.indicatorsService.trailingStopLevel({
              horizonDays: SIGNAL_HORIZON_DAYS,
              peak: trailingPeak,
              volatility: snapshot.volatility,
              volMult: SIGNAL_TRAIL_VOL_MULT
            });

            if (price <= trail) {
              closePosition(i, price, 'TRAILING');
            }
          }
        }
      }

      const currentEquity = entryIndex === null ? realizedEquity : equity;
      equityCurve[i] = currentEquity;
      peakEquity = Math.max(peakEquity, currentEquity);
    }

    let openAtEnd = 0;

    if (entryIndex !== null) {
      openAtEnd = 1;
      closePosition(series.length - 1, closes[closes.length - 1], 'OPEN');
    }

    return { entryIndices, equityCurve, openAtEnd, trades };
  }

  /** Sharpe, Sortino (annualised, rf=0) and max drawdown from an equity curve. */
  private metrics(curve: number[]): {
    maxDrawdownPct: number;
    sharpe: number;
    sortino: number;
  } {
    const clean = curve.filter((v) => typeof v === 'number' && v > 0);

    if (clean.length < 3) {
      return { maxDrawdownPct: 0, sharpe: 0, sortino: 0 };
    }

    const returns: number[] = [];
    let peak = clean[0];
    let maxDrawdown = 0;

    for (let i = 1; i < clean.length; i++) {
      returns.push(clean[i] / clean[i - 1] - 1);
      peak = Math.max(peak, clean[i]);
      maxDrawdown = Math.max(maxDrawdown, (peak - clean[i]) / peak);
    }

    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance =
      returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    const downside = Math.sqrt(
      returns.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / returns.length
    );
    const annualise = Math.sqrt(252);

    return {
      maxDrawdownPct: maxDrawdown * 100,
      sharpe: std > 0 ? (mean / std) * annualise : 0,
      sortino: downside > 0 ? (mean / downside) * annualise : 0
    };
  }

  /** Compound a list of per-trade percentage returns into a total %. */
  private compound(returnPcts: number[]): number {
    return (returnPcts.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100;
  }
}
