import { UserService } from '@ghostfolio/client/services/user/user.service';
import { SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD } from '@ghostfolio/common/config';
import {
  LineChartItem,
  SimulatedTrade,
  SimulationResponse,
  User
} from '@ghostfolio/common/interfaces';
import { openBenchmarkDetailDialog } from '@ghostfolio/ui/benchmark/benchmark-detail-dialog/open-benchmark-detail-dialog';
import { GfLineChartComponent } from '@ghostfolio/ui/line-chart';
import { DataService } from '@ghostfolio/ui/services';

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
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { IonIcon } from '@ionic/angular/standalone';
import { DataSource } from '@prisma/client';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import { DeviceDetectorService } from 'ngx-device-detector';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

interface CalculatorResult {
  feesUsd: number;
  grossProceedsUsd: number;
  netGainUsd: number;
  netProceedsUsd: number;
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
    GfLineChartComponent,
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
  protected dipSeries: LineChartItem[] = [];
  protected investedUsd = SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD;
  protected isLoading = false;
  protected reversalSeries: LineChartItem[] = [];
  protected selectedTradeIndex: number | null = null;
  protected simulation: SimulationResponse;
  protected trades: SimulatedTrade[] = [];
  protected user: User;

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
        this.dipSeries = response.dipSeries;
        this.reversalSeries = response.reversalSeries;

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
