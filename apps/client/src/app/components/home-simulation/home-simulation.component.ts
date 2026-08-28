import { UserService } from '@ghostfolio/client/services/user/user.service';
import { SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD } from '@ghostfolio/common/config';
import {
  LineChartItem,
  SimulatedTrade,
  SimulationReadoutPeriod,
  SignalExitMarker,
  SimulationResponse,
  TrackedPosition,
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
  SimulationChartMarker,
  SimulationChartSeries
} from '../simulation-performance-chart/simulation-performance-chart.component';

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

// Fixed per-series colors for the Simulation performance chart.
//
// Eleven lines need eleven SEPARATED HUES, not shades of one. An earlier
// version grouped by family — four greens for the real-money lines — on the
// theory that a shared hue would read as a group. On a chart with this many
// overlapping curves it read as one indistinguishable smear instead, which is
// why only three lines appeared to be drawn. Grouping is what the legend and
// the labels are for; colour's only job here is to tell two lines apart.
//
// Hues are spread around the wheel and no two adjacent entries sit within
// ~40 degrees of each other.
const DIP_COLOR = 'rgb(0, 176, 185)'; // teal
const REVERSAL_COLOR = 'rgb(224, 74, 74)'; // red
const LEADER_COLOR = 'rgb(240, 150, 20)'; // amber
const LEADER_GATED_COLOR = 'rgb(150, 84, 8)'; // brown
const TT8_COLOR = 'rgb(140, 82, 226)'; // violet
const WATCH_LEADER_COLOR = 'rgb(214, 92, 200)'; // magenta
const TRACKED_COLOR = 'rgb(30, 110, 60)'; // deep green
const TRACKED_BET_COLOR = 'rgb(120, 176, 40)'; // olive
const TRACKED_DIP_COLOR = 'rgb(40, 120, 216)'; // blue
const TRACKED_LEADER_COLOR = 'rgb(200, 60, 130)'; // pink
const BENCHMARK_COLOR = 'rgb(140, 140, 140)'; // grey, dashed

/**
 * Bootstrap contextual class per strategy/status chip.
 *
 * The tables rendered every badge `bg-secondary`, so a DIP, a BET and a LEADER
 * were visually identical — the one thing a badge exists to prevent.
 */
const BADGE_CLASS: Record<string, string> = {
  BET: 'bg-success',
  BOUGHT: 'bg-primary',
  CLOSED: 'bg-warning text-dark',
  DIP: 'bg-info text-dark',
  LEADER: 'bg-danger',
  OPEN: 'bg-secondary',
  REVERSAL: 'bg-warning text-dark',
  SOLD: 'bg-dark',
  TT8: 'bg-primary',
  UNTAGGED: 'bg-secondary'
};

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
  'expectedValueAtBuy',
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
  protected isLoading = false;
  protected readonly readoutPeriods = READOUT_PERIODS;
  protected searchTerm = '';
  protected readonly selectedZoomPeriod = signal<ZoomPeriodKey>('max');
  protected simulation: SimulationResponse | null = null;
  protected trades: SimulatedTrade[] = [];
  protected user: User;
  protected readonly zoomPeriods = ZOOM_PERIODS;

  protected readonly deviceType = computed(
    () => this.deviceDetectorService.deviceInfo().deviceType
  );
  protected readonly sort = viewChild(MatSort);
  /** Drives the show-all / hide-all / reset-zoom buttons above the chart. */
  protected readonly performanceChart = viewChild(
    GfSimulationPerformanceChartComponent
  );

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

  /**
   * One dataset per non-empty bucket (Dip / Reversal / Tracked / S&P 500),
   * sliced to the currently selected zoom period. Chart-zooming is a client-
   * side slice of the already-fetched full daily curves — no re-fetch per
   * button click.
   */
  /** Bootstrap class for a strategy or status chip; grey only if unrecognised. */
  protected badgeClass(value?: string): string {
    return BADGE_CLASS[value ?? ''] ?? 'bg-secondary';
  }

  /** Exits the engine signalled, newest first, for the table under the chart. */
  protected get exitMarkers(): SignalExitMarker[] {
    return [...(this.simulation?.exitMarkers ?? [])].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
  }

  /**
   * The same exits as chart annotations.
   *
   * Pinned at the trade's OWN return, not at the value the strategy curve
   * happens to hold that day. The y-axis is already "% net return", so a dot at
   * +18.1% reads correctly against it, and its height above the line is exactly
   * how much that one trade beat the bucket average by. Pinning it to the curve
   * instead would put a dot labelled +18.1% at the 5% mark.
   *
   * Every exit is marked, including ones on positions the engine never
   * suggested buying — it still told the user when to sell them, and that is
   * the part being measured.
   */
  protected get chartMarkers(): SimulationChartMarker[] {
    return this.exitMarkers.map((exit) => ({
      date: exit.date,
      label: `${exit.symbol} ${exit.netReturnPct >= 0 ? '+' : ''}${exit.netReturnPct.toFixed(1)}%`,
      value: exit.netReturnPct
    }));
  }

  /** Real open positions, strongest first. */
  protected get trackedPositions(): TrackedPosition[] {
    return [...(this.simulation?.trackedPositions ?? [])].sort(
      (a, b) => (b.netReturnPct ?? 0) - (a.netReturnPct ?? 0)
    );
  }

  protected get chartSeries(): SimulationChartSeries[] {
    if (!this.simulation) {
      return [];
    }

    const period = this.selectedZoomPeriod();

    // An empty bucket is omitted entirely rather than drawn flat: a legend
    // entry for a strategy that has never fired reads as "this made 0%", which
    // is a different and wrong claim. Leader Breakout is the live example —
    // absent until a breakout actually fires.
    return this.chartDefinitions
      .filter(({ data }) => data?.length > 0)
      .map(({ color, dashed, data, hidden, label }) => ({
        color,
        dashed,
        data: filterByPeriod(data, period),
        hidden,
        label
      }));
  }

  /**
   * Every candidate line, in legend order: engine suggestions first, then what
   * was actually bought, then the benchmark.
   *
   * Every line is drawn on load. An earlier version started the four Tracked
   * lines hidden to reduce clutter, which was a reasonable idea and a bad one
   * in practice: the legend that was supposed to bring them back was never
   * registered, so they were simply unreachable. Hiding anything by default
   * only works if the control that unhides it demonstrably exists.
   */
  private get chartDefinitions(): (SimulationChartSeries & {
    data: LineChartItem[];
  })[] {
    const simulation = this.simulation;

    return [
      {
        color: DIP_COLOR,
        data: simulation.dipSeries,
        label: $localize`Dip`
      },
      {
        color: REVERSAL_COLOR,
        data: simulation.reversalSeries,
        label: $localize`Reversal`
      },
      {
        color: WATCH_LEADER_COLOR,
        data: simulation.watchLeaderSeries,
        label: $localize`Watch Leader`
      },
      {
        color: LEADER_COLOR,
        data: simulation.leaderSeries,
        label: $localize`Leader Breakout`
      },
      {
        color: LEADER_GATED_COLOR,
        data: simulation.leaderGatedSeries,
        label: $localize`Leader Breakout (gated)`
      },
      {
        color: TT8_COLOR,
        data: simulation.tt8Series,
        label: $localize`Trend Template (bought)`
      },
      {
        color: TRACKED_COLOR,
        data: simulation.trackedSeries,
        label: $localize`Tracked`
      },
      {
        color: TRACKED_BET_COLOR,
        data: simulation.trackedBetSeries,
        label: $localize`Tracked Bet`
      },
      {
        color: TRACKED_DIP_COLOR,
        data: simulation.trackedDipSeries,
        label: $localize`Tracked Dip`
      },
      {
        color: TRACKED_LEADER_COLOR,
        data: simulation.trackedLeaderSeries,
        label: $localize`Tracked Leader`
      },
      {
        color: BENCHMARK_COLOR,
        // Dashed: a reference, not a strategy anyone ran.
        dashed: true,
        data: simulation.benchmarkSeries,
        label: 'S&P 500'
      }
    ];
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

    // Same order and the same non-empty rule as the chart, so a line and its
    // row can never disagree about whether a strategy exists.
    for (const { color, data, label } of this.chartDefinitions) {
      if (label !== 'S&P 500') {
        pushRow(label, color, data ?? []);
      }
    }

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

        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });
  }
}
