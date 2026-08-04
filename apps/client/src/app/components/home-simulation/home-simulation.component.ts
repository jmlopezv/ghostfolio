import { UserService } from '@ghostfolio/client/services/user/user.service';
import { SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD } from '@ghostfolio/common/config';
import {
  LineChartItem,
  SimulatedTrade,
  SimulationReadoutPeriod,
  SimulationResponse,
  User
} from '@ghostfolio/common/interfaces';
import { openBenchmarkDetailDialog } from '@ghostfolio/ui/benchmark/benchmark-detail-dialog/open-benchmark-detail-dialog';
import { DataService } from '@ghostfolio/ui/services';
import { GfTickerSearchComponent } from '@ghostfolio/ui/ticker-search';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { IonIcon } from '@ionic/angular/standalone';
import { DataSource } from '@prisma/client';
import { startOfYear, subDays, subMonths, subWeeks, subYears } from 'date-fns';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import { DeviceDetectorService } from 'ngx-device-detector';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import {
  GfSimulationPerformanceChartComponent,
  SimulationChartSeries
} from '../simulation-performance-chart/simulation-performance-chart.component';

interface CalculatorResult {
  feesUsd: number;
  grossProceedsUsd: number;
  netGainUsd: number;
  netProceedsUsd: number;
}

type ZoomPeriodKey = SimulationReadoutPeriod | 'max';
type ReadoutPeriodKey = SimulationReadoutPeriod;

const ZOOM_PERIODS: { key: ZoomPeriodKey; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: 'ytd', label: 'YTD' },
  { key: '1y', label: '1Y' },
  { key: 'max', label: 'Max' }
];

const READOUT_PERIODS: { key: ReadoutPeriodKey; label: string }[] = [
  { key: '1d', label: 'Today' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: 'ytd', label: 'YTD' },
  { key: '1y', label: '1Y' }
];

// Fixed per-series colors for the Simulation performance chart — local to
// this page since no other chart needs a 4th/5th color.
const DIP_COLOR = 'rgb(54, 207, 204)';
const REVERSAL_COLOR = 'rgb(226, 106, 106)';
const TRACKED_COLOR = 'rgb(84, 163, 84)';
const BENCHMARK_COLOR = 'rgb(150, 150, 150)';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** null (not a real cutoff) for 'max' — the caller keeps the full series. */
function periodCutoff(key: ZoomPeriodKey, now: Date): Date | null {
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
    case 'max':
      return null;
  }
}

function filterByPeriod(
  series: LineChartItem[],
  key: ZoomPeriodKey
): LineChartItem[] {
  const cutoff = periodCutoff(key, new Date());

  if (!cutoff) {
    return series;
  }

  return series.filter((point) => new Date(point.date) >= cutoff);
}

/**
 * Chain-links the trailing return over `key` from a cumulative-average-%
 * curve — NOT a naive subtraction, since each point is already a cumulative
 * average % return from the series' own inception, not a rebased daily
 * return. Returns undefined — never a fabricated number — when the series
 * doesn't actually go back far enough to cover the requested period (e.g. a
 * 1Y readout when the engine itself has only run for two months).
 */
function trailingReturn(
  series: LineChartItem[],
  key: ReadoutPeriodKey
): number | undefined {
  if (series.length === 0) {
    return undefined;
  }

  const last = series[series.length - 1];
  const cutoff = periodCutoff(key, new Date());

  if (cutoff && new Date(series[0].date) > cutoff) {
    return undefined;
  }

  // Closest available point AT OR BEFORE the cutoff — the standard "value
  // as of N days ago" convention — not the first point after it.
  let past = series[0];

  if (cutoff) {
    for (const point of series) {
      if (new Date(point.date) > cutoff) {
        break;
      }

      past = point;
    }
  }

  return round2(((1 + last.value / 100) / (1 + past.value / 100) - 1) * 100);
}

const DISPLAYED_COLUMNS = [
  'symbol',
  'name',
  'signalType',
  'status',
  'tracked',
  'buyDate',
  'buyPrice',
  'scoreAtBuy',
  'rsiAtBuy',
  'reachProbabilityAtBuy',
  'convictionAtBuy',
  'takeProfit',
  'stopLoss',
  'currentOrSellPrice',
  'vsSignalPct',
  'vsBuyPct',
  'sellSignal',
  'sellDate',
  'holdingDays',
  'netReturnPct',
  'effectiveAnnualRatePct'
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [
    CommonModule,
    FormsModule,
    GfSimulationPerformanceChartComponent,
    GfTickerSearchComponent,
    IonIcon,
    MatSortModule,
    MatTableModule,
    NgxSkeletonLoaderModule
  ],
  selector: 'gf-home-simulation',
  styleUrls: ['./home-simulation.scss'],
  templateUrl: './home-simulation.html'
})
export class GfHomeSimulationComponent implements OnInit {
  protected readonly assumedNotionalUsd =
    SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD;
  protected readonly dataSource = new MatTableDataSource<SimulatedTrade>([]);
  protected readonly displayedColumns = DISPLAYED_COLUMNS;
  protected investedUsd = SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD;
  protected isLoading = false;
  protected readonly readoutPeriods = READOUT_PERIODS;
  protected searchTerm = '';
  protected selectedTradeIndex: number | null = null;
  protected readonly selectedZoomPeriod = signal<ZoomPeriodKey>('max');
  protected simulation: SimulationResponse | null = null;
  protected trades: SimulatedTrade[] = [];
  protected user: User;
  protected readonly zoomPeriods = ZOOM_PERIODS;

  protected readonly deviceType = computed(
    () => this.deviceDetectorService.deviceInfo().deviceType
  );
  protected readonly sort = viewChild(MatSort);

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deviceDetectorService = inject(DeviceDetectorService);
  private readonly dialog = inject(MatDialog);
  private readonly userService = inject(UserService);

  public constructor() {
    addIcons({ refreshOutline });

    this.dataSource.filterPredicate = (trade, filter) => {
      return (
        !filter ||
        trade.symbol.toLowerCase().includes(filter) ||
        (trade.name ?? '').toLowerCase().includes(filter)
      );
    };

    this.dataSource.sortingDataAccessor = (trade, property) => {
      switch (property) {
        case 'buyDate':
          return new Date(trade.buyDate).getTime();
        case 'sellDate':
          return trade.sellDate ? new Date(trade.sellDate).getTime() : 0;
        case 'currentOrSellPrice':
          return trade.sellPrice ?? trade.currentPrice ?? 0;
        case 'sellSignal': {
          const reached = this.sellSignalReached(trade);
          return reached == null ? -1 : reached ? 1 : 0;
        }
        default:
          return (trade as unknown as Record<string, string | number>)[
            property
          ] as string | number;
      }
    };

    // MatSort attaches once the table (rendered only after loading finishes)
    // exists in the DOM, so re-attach it whenever the viewChild resolves.
    effect(() => {
      const sort = this.sort();

      if (sort) {
        this.dataSource.sort = sort;
      }
    });

    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public ngOnInit() {
    this.load();
  }

  protected get calculatorResult(): CalculatorResult | null {
    const trade = this.selectedTrade;

    // grossReturnPct is only undefined when no price is known yet (a
    // transient live-quote hiccup on an OPEN trade) — the calculator has
    // nothing to compute against until then.
    if (!trade || !this.investedUsd || trade.grossReturnPct == null) {
      return null;
    }

    const grossProceedsUsd =
      this.investedUsd * (1 + trade.grossReturnPct / 100);
    // Only the buy leg has actually been paid for a still-OPEN trade; the
    // sell fee is charged once a matching SELL is logged and it closes.
    const feesUsd = trade.status === 'CLOSED' ? 10 : 5;
    const netProceedsUsd = grossProceedsUsd - feesUsd;
    const netGainUsd = netProceedsUsd - this.investedUsd;

    return { feesUsd, grossProceedsUsd, netGainUsd, netProceedsUsd };
  }

  protected get selectedTrade(): SimulatedTrade | null {
    return this.selectedTradeIndex != null
      ? (this.trades[this.selectedTradeIndex] ?? null)
      : null;
  }

  /**
   * One dataset per non-empty bucket (Dip / Reversal / Tracked / S&P 500),
   * sliced to the currently selected zoom period. Chart-zooming is a client-
   * side slice of the already-fetched full daily curves — no re-fetch per
   * button click.
   */
  protected get chartSeries(): SimulationChartSeries[] {
    if (!this.simulation) {
      return [];
    }

    const period = this.selectedZoomPeriod();
    const series: SimulationChartSeries[] = [];

    if (this.simulation.dipSeries.length > 0) {
      series.push({
        color: DIP_COLOR,
        data: filterByPeriod(this.simulation.dipSeries, period),
        label: $localize`Dip`
      });
    }

    if (this.simulation.reversalSeries.length > 0) {
      series.push({
        color: REVERSAL_COLOR,
        data: filterByPeriod(this.simulation.reversalSeries, period),
        label: $localize`Reversal`
      });
    }

    if (this.simulation.trackedSeries.length > 0) {
      series.push({
        color: TRACKED_COLOR,
        data: filterByPeriod(this.simulation.trackedSeries, period),
        label: $localize`Tracked`
      });
    }

    if (this.simulation.benchmarkSeries?.length) {
      series.push({
        color: BENCHMARK_COLOR,
        data: filterByPeriod(this.simulation.benchmarkSeries, period),
        label: 'S&P 500'
      });
    }

    return series;
  }

  /**
   * One row per non-empty bucket, with a trailing return for every entry in
   * readoutPeriods — independent of the chart's own zoom selection, so
   * "Today / 1W / … / 1Y" always shows the full picture.
   */
  protected get readoutRows(): {
    color: string;
    label: string;
    values: (number | undefined)[];
  }[] {
    if (!this.simulation) {
      return [];
    }

    const rows: {
      color: string;
      label: string;
      values: (number | undefined)[];
    }[] = [];

    const pushRow = (label: string, color: string, series: LineChartItem[]) => {
      if (series.length === 0) {
        return;
      }

      rows.push({
        color,
        label,
        values: this.readoutPeriods.map((period) =>
          trailingReturn(series, period.key)
        )
      });
    };

    pushRow($localize`Dip`, DIP_COLOR, this.simulation.dipSeries);
    pushRow(
      $localize`Reversal`,
      REVERSAL_COLOR,
      this.simulation.reversalSeries
    );
    pushRow($localize`Tracked`, TRACKED_COLOR, this.simulation.trackedSeries);

    // S&P 500 uses real, calendar-anchored trailing returns computed
    // server-side from its own full history (see benchmarkReadout) — NOT
    // trailingReturn() on the chart-truncated benchmarkSeries, which only
    // covers as far back as our own engine's oldest trade.
    if (this.simulation.benchmarkReadout) {
      const readout = this.simulation.benchmarkReadout;
      rows.push({
        color: BENCHMARK_COLOR,
        label: 'S&P 500',
        values: this.readoutPeriods.map((period) => readout[period.key])
      });
    }

    return rows;
  }

  protected onSelectZoomPeriod(key: ZoomPeriodKey) {
    this.selectedZoomPeriod.set(key);
  }

  /** Opens the same asset-detail dialog Watchlist's ticker click opens. */
  protected onOpenAsset(dataSource: DataSource, symbol: string) {
    openBenchmarkDetailDialog({
      colorScheme: this.user?.settings?.colorScheme,
      dataSource,
      destroyRef: this.destroyRef,
      deviceType: this.deviceType(),
      dialog: this.dialog,
      locale: this.user?.settings?.locale,
      symbol
    });
  }

  protected onRefresh() {
    this.load();
  }

  protected onSearchChange(searchTerm: string) {
    this.searchTerm = searchTerm;
    this.dataSource.filter = searchTerm.trim().toLowerCase();
    this.changeDetectorRef.markForCheck();
  }

  /**
   * Whether an OPEN trade's current price has already crossed its take-profit
   * or stop-loss level (i.e. a real SELL should have fired). Returns `null`
   * for CLOSED trades, where the question no longer applies.
   */
  protected sellSignalReached(trade: SimulatedTrade): boolean | null {
    if (trade.status !== 'OPEN' || trade.currentPrice == null) {
      return null;
    }

    const hitTarget =
      trade.takeProfit != null && trade.currentPrice >= trade.takeProfit;
    const hitStop =
      trade.stopLoss != null && trade.currentPrice <= trade.stopLoss;

    return hitTarget || hitStop;
  }

  protected tradeLabel(trade: SimulatedTrade): string {
    const outcome =
      trade.status === 'CLOSED' && trade.netReturnPct != null
        ? `${trade.netReturnPct >= 0 ? '+' : ''}${trade.netReturnPct.toFixed(1)}%`
        : trade.status === 'OPEN' && trade.grossReturnPct != null
          ? 'unrealized'
          : 'price unavailable';

    return `${trade.symbol} · ${trade.signalType} · ${trade.status} (${outcome})`;
  }

  private load() {
    this.isLoading = true;

    this.dataService
      .fetchSimulation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response: SimulationResponse) => {
        this.simulation = response;
        this.trades = response.trades;
        this.dataSource.data = response.trades;

        if (
          this.selectedTradeIndex != null &&
          this.selectedTradeIndex >= this.trades.length
        ) {
          this.selectedTradeIndex = null;
        }

        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });
  }
}
