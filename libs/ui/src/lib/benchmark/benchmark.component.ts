import { ConfirmationDialogType } from '@ghostfolio/common/enums';
import {
  getLocale,
  getLowercase,
  resolveMarketCondition
} from '@ghostfolio/common/helper';
import {
  AssetProfileIdentifier,
  Benchmark,
  User
} from '@ghostfolio/common/interfaces';
import { NotificationService } from '@ghostfolio/ui/notifications';

import { DecimalPipe, PercentPipe } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { ellipsisHorizontal, trashOutline } from 'ionicons/icons';
import { isNumber } from 'lodash';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { GfEntityLogoComponent } from '../entity-logo/entity-logo.component';
import { translate } from '../i18n';
import { GfTrendIndicatorComponent } from '../trend-indicator/trend-indicator.component';
import { GfValueComponent } from '../value/value.component';
import { GfBenchmarkDetailDialogComponent } from './benchmark-detail-dialog/benchmark-detail-dialog.component';
import { BenchmarkDetailDialogParams } from './benchmark-detail-dialog/interfaces/interfaces';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    GfEntityLogoComponent,
    GfTrendIndicatorComponent,
    GfValueComponent,
    IonIcon,
    MatButtonModule,
    MatMenuModule,
    MatSortModule,
    MatTableModule,
    NgxSkeletonLoaderModule,
    PercentPipe,
    RouterModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-benchmark',
  styleUrls: ['./benchmark.component.scss'],
  templateUrl: './benchmark.component.html'
})
export class GfBenchmarkComponent {
  public readonly benchmarks = input.required<Benchmark[]>();
  public readonly deviceType = input.required<string>();
  public readonly hasPermissionToDeleteItem = input<boolean>();
  public readonly locale = input(getLocale());
  public readonly showIcon = input(false);
  /** Watchlist-only: show the latest-price + recent-BUY-signal columns. */
  public readonly showSignalColumns = input(false);
  public readonly showSymbol = input(true);
  public readonly sortActive = input('name');
  public readonly sortDirection = input<'asc' | 'desc'>('asc');
  public readonly user = input<User>();

  public readonly itemDeleted = output<AssetProfileIdentifier>();

  protected readonly sort = viewChild(MatSort);

  protected readonly dataSource = new MatTableDataSource<Benchmark>([]);
  // Period the "Return" column shows; toggled by the buttons under the table.
  protected readonly returnPeriods = [
    { key: 'return1wPct', label: '1W' },
    { key: 'return1mPct', label: '1M' },
    { key: 'return3mPct', label: '3M' },
    { key: 'return6mPct', label: '6M' },
    { key: 'return1yPct', label: '1Y' }
  ] as const;
  protected readonly selectedReturnPeriod =
    signal<(typeof this.returnPeriods)[number]['key']>('return1yPct');

  protected readonly displayedColumns = computed(() => {
    return [
      ...(this.showIcon() ? ['icon'] : []),
      'name',
      ...(this.showSignalColumns()
        ? ['marketPrice', 'currency', 'feePct', 'sma50', 'sma200']
        : []),
      ...(this.user()?.settings?.isExperimentalFeatures
        ? ['trend50d', 'trend200d']
        : []),
      'date',
      'change',
      ...(this.showSignalColumns()
        ? [
            'periodReturn',
            'score',
            'rsi',
            'macdHistogram',
            'bollingerPctB',
            'reachProbability',
            'expectedValue',
            'trendTemplate',
            'vcp',
            'recentBuySignal'
          ]
        : []),
      'marketCondition',
      'actions'
    ];
  });
  /**
   * Human explanation of a VCP cell. The contraction sequence alone is opaque
   * ("18→12→6%" means nothing without context), and the pivot is the number the
   * user actually acts on, so both are spelled out on hover.
   */
  protected vcpTooltip(element: {
    vcpContractions?: number;
    vcpDepthsPct?: number[];
    vcpDryUpRatio?: number;
    vcpPivot?: number;
    vcpPivotDistancePct?: number;
    vcpStatus?: string;
    vcpVolumeRatio?: number;
  }): string {
    if (!element?.vcpStatus) {
      return '';
    }

    const parts = [
      `${element.vcpContractions} tightening contractions (${element.vcpDepthsPct?.join('% → ')}%)`,
      `pivot ${element.vcpPivot?.toFixed(2)}`
    ];

    if (isNumber(element.vcpPivotDistancePct)) {
      const distance = element.vcpPivotDistancePct * 100;
      parts.push(
        distance >= 0
          ? `${distance.toFixed(1)}% above pivot`
          : `${Math.abs(distance).toFixed(1)}% below pivot`
      );
    }

    // Both volume phases, because they are a matched pair: supply drying up
    // through the base, then demand showing up on the breakout. Dry-up passing
    // while breakout volume is light is the classic unconfirmed move.
    if (isNumber(element.vcpDryUpRatio)) {
      parts.push(`dry-up ${element.vcpDryUpRatio.toFixed(2)}× average`);
    }

    if (isNumber(element.vcpVolumeRatio)) {
      parts.push(
        `breakout volume ${element.vcpVolumeRatio.toFixed(2)}× average`
      );
    }

    return parts.join(' · ');
  }

  protected isLoading = true;
  protected readonly isNumber = isNumber;
  protected readonly resolveMarketCondition = resolveMarketCondition;
  protected readonly translate = translate;

  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly notificationService = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  public constructor() {
    effect(() => {
      const benchmarks = this.benchmarks();

      if (benchmarks) {
        this.dataSource.data = benchmarks;
        this.dataSource.sortingDataAccessor = (item, property) => {
          if (property === 'hasRecentBuySignal') {
            return (item as Benchmark).hasRecentBuySignal ? 1 : 0;
          }
          if (property === 'periodReturn') {
            return this.periodReturn(item as Benchmark) ?? -Infinity;
          }
          if (property === 'feePct') {
            return (item as Benchmark).feePct ?? Infinity;
          }
          if (property === 'sma50' || property === 'sma200') {
            return (item as Benchmark)[property] ?? -Infinity;
          }
          return getLowercase(item, property);
        };

        this.dataSource.sort = this.sort() ?? null;

        this.isLoading = false;
      }
    });

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (
          params['benchmarkDetailDialog'] &&
          params['dataSource'] &&
          params['symbol']
        ) {
          this.openBenchmarkDetailDialog({
            dataSource: params['dataSource'],
            symbol: params['symbol']
          });
        }
      });

    addIcons({ ellipsisHorizontal, trashOutline });
  }

  /** The trailing return for the currently-selected period, or undefined. */
  protected periodReturn(item: Benchmark): number | undefined {
    return item[this.selectedReturnPeriod()];
  }

  protected onSelectReturnPeriod(
    key: (typeof this.returnPeriods)[number]['key']
  ) {
    this.selectedReturnPeriod.set(key);
  }

  protected onDeleteItem({ dataSource, symbol }: AssetProfileIdentifier) {
    this.notificationService.confirm({
      confirmFn: () => {
        this.itemDeleted.emit({ dataSource, symbol });
      },
      confirmType: ConfirmationDialogType.Warn,
      title: $localize`Do you really want to delete this item?`
    });
  }

  protected onOpenBenchmarkDialog({
    dataSource,
    symbol
  }: AssetProfileIdentifier) {
    this.router.navigate([], {
      queryParams: { dataSource, symbol, benchmarkDetailDialog: true }
    });
  }

  private openBenchmarkDetailDialog({
    dataSource,
    symbol
  }: AssetProfileIdentifier) {
    const dialogRef = this.dialog.open<
      GfBenchmarkDetailDialogComponent,
      BenchmarkDetailDialogParams
    >(GfBenchmarkDetailDialogComponent, {
      data: {
        dataSource,
        symbol,
        colorScheme: this.user()?.settings?.colorScheme,
        deviceType: this.deviceType(),
        locale: this.locale()
      },
      height: this.deviceType() === 'mobile' ? '98vh' : undefined,
      width: this.deviceType() === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result?: AssetProfileIdentifier) => {
        // Clicking a correlated asset in the dialog closes it with that
        // asset's identifier — re-open the dialog for it.
        if (result?.dataSource && result?.symbol) {
          this.onOpenBenchmarkDialog({
            dataSource: result.dataSource,
            symbol: result.symbol
          });

          return;
        }

        this.router.navigate(['.'], { relativeTo: this.route });
      });
  }
}
