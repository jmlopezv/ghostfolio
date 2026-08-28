import {
  SIGNAL_NORDNET_COMMISSION_CLASS,
  SIGNAL_SEK_PER_USD_FALLBACK,
  SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD
} from '@ghostfolio/common/config';
import {
  LineChartItem,
  SimulationReadoutPeriod
} from '@ghostfolio/common/interfaces';
import { nordnetCommissionUsd } from '@ghostfolio/common/nordnet-fees';

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
  /**
   * Commission drag on THIS trade, in percentage points, when it is known.
   *
   * Signal-derived trades are hypothetical and carry no real fee, so they leave
   * this undefined and fall back to the assumed-notional figure. Trades built
   * from real orders know exactly what was paid, and using the real number is
   * the point of showing them beside the hypothetical ones.
   */
  feeDragPct?: number;
  netReturnPct?: number;
  sellDate?: string;
  symbol: string;
}

/** A real activity, reduced to what the FIFO walk below needs. */
export interface OrderLike {
  dataSource: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Total commission on the order, in the instrument's own currency. */
  fee: number;
  quantity: number;
  symbol: string;
  tags: string[];
  type: string;
  unitPrice: number;
}

/** A trade reconstructed from real fills, carrying the tags of both legs. */
export interface TrackedOrderTrade extends PerformanceSeriesTrade {
  quantity: number;
  tags: string[];
}

/**
 * Reconstructs round trips from real activities, FIFO, one queue per symbol.
 *
 * This is what lets the Simulation chart show what was ACTUALLY bought beside
 * what the engine SUGGESTED. It deliberately mirrors the FIFO walk
 * `computeSimulation` already runs over `SignalLog`, but reads `Order` instead,
 * so a position the engine never signalled — most of the portfolio — still
 * appears.
 *
 * Three details matter and are easy to get wrong:
 *
 *  - **A sell can span several buy lots**, and a lot can be closed by several
 *    sells. Both are split so each resulting trade has one buy price and one
 *    sell price; a half-closed lot contributes a closed trade for the sold half
 *    and stays open for the rest.
 *  - **Fees are per ORDER, not per share.** They are apportioned across the
 *    order's quantity and then across whatever slice of the lot is involved,
 *    otherwise a partial sale would charge the whole commission to it.
 *  - **Returns stay in the instrument's own currency.** A EUR listing's percent
 *    move is computed in EUR, exactly as the signal-derived trades already are.
 *    Converting to USD would mix an FX bet into a strategy comparison.
 *
 * Pure and synchronous, so the whole reconstruction is unit-testable without a
 * database. `DIVIDEND` and every other activity type are ignored: they change
 * the cash balance, not the price return of a position.
 */
export function ordersToTrades(orders: OrderLike[]): TrackedOrderTrade[] {
  const chronological = [...orders]
    .filter(({ type }) => type === 'BUY' || type === 'SELL')
    .sort((a, b) => a.date.localeCompare(b.date));

  interface Lot {
    date: string;
    /** Commission attributable to ONE share of this lot. */
    feePerShare: number;
    price: number;
    quantity: number;
    tags: string[];
  }

  const lotsBySymbol = new Map<string, Lot[]>();
  const trades: TrackedOrderTrade[] = [];

  const openLot = (order: OrderLike): Lot => ({
    date: order.date,
    feePerShare: order.quantity > 0 ? order.fee / order.quantity : 0,
    price: order.unitPrice,
    quantity: order.quantity,
    tags: order.tags
  });

  for (const order of chronological) {
    const key = `${order.dataSource}:${order.symbol}`;
    const lots = lotsBySymbol.get(key) ?? [];

    if (order.type === 'BUY') {
      lots.push(openLot(order));
      lotsBySymbol.set(key, lots);
      continue;
    }

    const sellFeePerShare = order.quantity > 0 ? order.fee / order.quantity : 0;
    let remaining = order.quantity;

    while (remaining > 1e-9 && lots.length > 0) {
      const lot = lots[0];
      const matched = Math.min(remaining, lot.quantity);
      const roundTripFeePerShare = lot.feePerShare + sellFeePerShare;

      trades.push({
        buyDate: lot.date,
        buyPrice: lot.price,
        dataSource: order.dataSource,
        feeDragPct:
          lot.price > 0 ? (roundTripFeePerShare / lot.price) * 100 : 0,
        netReturnPct:
          lot.price > 0
            ? ((order.unitPrice - lot.price - roundTripFeePerShare) /
                lot.price) *
              100
            : 0,
        quantity: matched,
        sellDate: order.date,
        symbol: order.symbol,
        // Both legs' tags, so a position bought on a signal and sold later is
        // still attributed to the signal that opened it.
        tags: [...new Set([...lot.tags, ...order.tags])]
      });

      lot.quantity -= matched;
      remaining -= matched;

      if (lot.quantity <= 1e-9) {
        lots.shift();
      }
    }

    lotsBySymbol.set(key, lots);
    // A sell with no open lot (a position that predates the imported history)
    // is dropped rather than allowed to invent a negative holding.
  }

  for (const [key, lots] of lotsBySymbol) {
    const [dataSource, ...rest] = key.split(':');
    const symbol = rest.join(':');

    for (const lot of lots) {
      trades.push({
        buyDate: lot.date,
        buyPrice: lot.price,
        dataSource,
        // Only the buy leg has been paid so far.
        feeDragPct: lot.price > 0 ? (lot.feePerShare / lot.price) * 100 : 0,
        quantity: lot.quantity,
        symbol,
        tags: lot.tags
      });
    }
  }

  return trades.sort((a, b) => a.buyDate.localeCompare(b.buyDate));
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
  // Buy-side commission as a % drag on the assumed notional. Percentage-based
  // under the current Nordnet class, so it no longer shrinks with position size
  // above the minimum-fee threshold. Non-Nordic is the conservative assumption:
  // the higher minimum, and most of the traded universe is US-listed.
  const feeDragPct =
    (nordnetCommissionUsd({
      commissionClass: SIGNAL_NORDNET_COMMISSION_CLASS,
      isNordic: false,
      sekPerUsd: SIGNAL_SEK_PER_USD_FALLBACK,
      tradeValueUsd: SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD
    }) /
      SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD) *
    100;

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

      values.push(
        (price / trade.buyPrice - 1) * 100 - (trade.feeDragPct ?? feeDragPct)
      );
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
