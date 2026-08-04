import {
  SIGNAL_BUY_FEE_USD,
  SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD
} from '@ghostfolio/common/config';
import {
  LineChartItem,
  SimulationReadoutPeriod
} from '@ghostfolio/common/interfaces';

import { startOfYear, subDays, subMonths, subWeeks, subYears } from 'date-fns';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

export interface PerformanceSeriesTrade {
  buyDate: string;
  buyPrice: number;
  currentPrice?: number;
  dataSource: string;
  netReturnPct?: number;
  sellDate?: string;
  symbol: string;
}

/**
 * Builds a daily mark-to-market AVERAGE % net return curve for a bucket of
 * trades (DIP / REVERSAL / tracked) — one point per calendar day from the
 * earliest buyDate to `todayStr`, tracking how that bucket's return has
 * actually developed over time. A trade contributes its live mark-to-market
 * return (via marketDataBySymbol, forward-filled across non-trading days)
 * while OPEN, and its final, already-computed netReturnPct once it closes —
 * locked from that day forward. Equal-weighted average across whichever
 * trades have started and have a resolvable value that day. `todayStr` is a
 * parameter (not read from `Date.now()`) so this stays a pure,
 * deterministically testable function.
 */
export function buildPerformanceSeries(
  trades: PerformanceSeriesTrade[],
  marketDataBySymbol: Map<string, { date: string; close: number }[]>,
  todayStr: string
): LineChartItem[] {
  if (trades.length === 0) {
    return [];
  }

  const startDateStr = trades
    .map((trade) => trade.buyDate.slice(0, 10))
    .sort()[0];

  const pointerBySymbol = new Map<string, number>();

  const priceAsOf = (key: string, dateStr: string): number | undefined => {
    const closes = marketDataBySymbol.get(key);

    if (!closes || closes.length === 0) {
      return undefined;
    }

    let pointer = pointerBySymbol.get(key) ?? 0;

    while (pointer + 1 < closes.length && closes[pointer + 1].date <= dateStr) {
      pointer++;
    }

    pointerBySymbol.set(key, pointer);

    return closes[pointer].date <= dateStr ? closes[pointer].close : undefined;
  };

  const points: LineChartItem[] = [];
  const feeDragPct =
    (SIGNAL_BUY_FEE_USD / SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD) * 100;

  for (
    let day = new Date(`${startDateStr}T00:00:00.000Z`);
    day.toISOString().slice(0, 10) <= todayStr;
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const dateStr = day.toISOString().slice(0, 10);
    const values: number[] = [];

    for (const trade of trades) {
      if (trade.buyDate.slice(0, 10) > dateStr) {
        continue;
      }

      if (trade.sellDate != null && trade.sellDate.slice(0, 10) <= dateStr) {
        if (trade.netReturnPct != null) {
          values.push(trade.netReturnPct);
        }

        continue;
      }

      // Still open as of this day — today uses the fresher live quote
      // already fetched for the table; earlier days mark to market against
      // stored daily closes.
      const price =
        dateStr === todayStr && trade.currentPrice != null
          ? trade.currentPrice
          : priceAsOf(`${trade.dataSource}:${trade.symbol}`, dateStr);

      if (price == null) {
        continue;
      }

      values.push((price / trade.buyPrice - 1) * 100 - feeDragPct);
    }

    if (values.length > 0) {
      points.push({ date: dateStr, value: round2(average(values)) });
    }
  }

  return points;
}

/**
 * Normalizes a raw dated-close series (e.g. S&P 500) to % change from the
 * close nearest `startDate` — the same "% since inception" convention used
 * for the trade-performance series above, so both can share a y-axis. Used
 * ONLY for the chart overlay — see computeTrailingPriceReturns for the
 * readout table, which needs the real, un-truncated history instead.
 */
export function normalizeBenchmarkSeries(
  closes: { close: number; date: string }[],
  startDate: string
): LineChartItem[] | undefined {
  if (closes.length === 0) {
    return undefined;
  }

  const fromStart = closes.filter((point) => point.date >= startDate);
  const startClose = fromStart[0]?.close ?? closes[0].close;

  if (!startClose) {
    return undefined;
  }

  return fromStart.map((point) => ({
    date: point.date,
    value: round2((point.close / startClose - 1) * 100)
  }));
}

const READOUT_PERIOD_KEYS: SimulationReadoutPeriod[] = [
  '1d',
  '1w',
  '1m',
  '3m',
  '6m',
  'ytd',
  '1y'
];

function readoutPeriodCutoff(key: SimulationReadoutPeriod, now: Date): Date {
  switch (key) {
    case '1d':
      return subDays(now, 1);
    case '1w':
      return subWeeks(now, 1);
    case '1m':
      return subMonths(now, 1);
    case '3m':
      return subMonths(now, 3);
    case '6m':
      return subMonths(now, 6);
    case 'ytd':
      return startOfYear(now);
    case '1y':
      return subYears(now, 1);
  }
}

/**
 * Real, calendar-anchored trailing price returns for every readout period,
 * computed directly from a symbol's own full close history — NOT the
 * chart's since-our-inception rebased series. This is what lets a
 * long-history benchmark like the S&P 500 show a genuine 3M/6M/YTD/1Y number
 * even though the trading-signals engine itself has only run a couple of
 * months — dip/reversal/trackedSeries genuinely can't answer those periods
 * yet, but the real index can. A period is omitted (not fabricated) when
 * even the fetched history doesn't reach back that far.
 */
export function computeTrailingPriceReturns(
  closes: { close: number; date: string }[]
): Partial<Record<SimulationReadoutPeriod, number>> {
  const result: Partial<Record<SimulationReadoutPeriod, number>> = {};

  if (closes.length === 0) {
    return result;
  }

  const last = closes[closes.length - 1];
  const firstDateStr = closes[0].date;
  const now = new Date();

  for (const key of READOUT_PERIOD_KEYS) {
    const cutoffStr = readoutPeriodCutoff(key, now).toISOString().slice(0, 10);

    if (firstDateStr > cutoffStr) {
      continue; // not enough real history for this period — leave it out
    }

    // Closest available close AT OR BEFORE the cutoff — the standard
    // "price as of N days ago" convention (mirrors buildPerformanceSeries'
    // own forward-fill priceAsOf logic), not the first point after it.
    let past = closes[0];

    for (const point of closes) {
      if (point.date > cutoffStr) {
        break;
      }

      past = point;
    }

    if (past.close) {
      result[key] = round2((last.close / past.close - 1) * 100);
    }
  }

  return result;
}
