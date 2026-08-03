import { BenchmarkTrend } from '@ghostfolio/common/types/';

import { EnhancedSymbolProfile } from './enhanced-symbol-profile.interface';

export interface Benchmark {
  /** Annualised volatility (watchlist metrics). */
  annualVol?: number;
  /** STOCK/ETF/etc — used to filter the watchlist by asset type. */
  assetSubClass?: EnhancedSymbolProfile['assetSubClass'];
  /** Bollinger %B(20) (watchlist metrics). */
  bollingerPctB?: number;
  /** Conviction (0-100, EV-based) (watchlist metrics). */
  conviction?: number;
  /** Native currency of the asset (watchlist price column). */
  currency?: string;
  dataSource: EnhancedSymbolProfile['dataSource'];
  /** Ongoing annual fee % (ETFs/funds; watchlist metrics). */
  feePct?: number;
  /** True when a BUY signal fired for this symbol in the last 30 days (watchlist). */
  hasRecentBuySignal?: boolean;
  /** MACD(12/26/9) histogram (watchlist metrics). */
  macdHistogram?: number;
  marketCondition: 'ALL_TIME_HIGH' | 'BEAR_MARKET' | 'NEUTRAL_MARKET';
  /** Latest market price in the native currency (watchlist price column). */
  marketPrice?: number;
  name: EnhancedSymbolProfile['name'];
  /** Terminal reach probability [0-1] (watchlist metrics). */
  reachProbability?: number;
  /** Trailing price returns in % (watchlist metrics). */
  return1mPct?: number;
  return1wPct?: number;
  return1yPct?: number;
  return3mPct?: number;
  return6mPct?: number;
  /** Wilder's RSI(14) (watchlist metrics). */
  rsi?: number;
  /** Composite 0-100 buy-attractiveness score (watchlist metrics). */
  score?: number;
  /** Simple moving averages of the close (watchlist metrics). */
  sma50?: number;
  sma200?: number;
  performances: {
    allTimeHigh: {
      date: Date;
      performancePercent: number;
    };
  };
  symbol: EnhancedSymbolProfile['symbol'];
  trend50d: BenchmarkTrend;
  trend200d: BenchmarkTrend;
}
