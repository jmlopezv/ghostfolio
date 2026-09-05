import { ImpersonationStorageService } from '@ghostfolio/client/services/impersonation-storage.service';
import { UserService } from '@ghostfolio/client/services/user/user.service';
import { locale as defaultLocale } from '@ghostfolio/common/config';
import {
  AssetProfileIdentifier,
  Benchmark,
  User,
  WatchlistMetric
} from '@ghostfolio/common/interfaces';
import { hasPermission, permissions } from '@ghostfolio/common/permissions';
import { GfBenchmarkComponent } from '@ghostfolio/ui/benchmark';
import { GfFabComponent } from '@ghostfolio/ui/fab';
import { GfPremiumIndicatorComponent } from '@ghostfolio/ui/premium-indicator';
import { DataService } from '@ghostfolio/ui/services';
import { GfTickerSearchComponent } from '@ghostfolio/ui/ticker-search';

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DeviceDetectorService } from 'ngx-device-detector';
import { timer } from 'rxjs';

import { GfCreateWatchlistItemDialogComponent } from './create-watchlist-item-dialog/create-watchlist-item-dialog.component';
import { CreateWatchlistItemDialogParams } from './create-watchlist-item-dialog/interfaces/interfaces';

/**
 * Refresh cadence for the watchlist and its metrics.
 *
 * Matched to the server's five-minute cache (WATCHLIST_ITEMS_CACHE_TTL and
 * SIGNAL_WATCHLIST_METRICS_CACHE_TTL). At the previous 30 minutes the cache had
 * always expired by the time the page asked again, so every visit paid a full
 * cold rebuild and the cache never actually served anyone.
 */
const WATCHLIST_METRICS_REFRESH_MS = 5 * 60 * 1000;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfBenchmarkComponent,
    GfFabComponent,
    GfPremiumIndicatorComponent,
    GfTickerSearchComponent,
    MatSnackBarModule,
    RouterModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-home-watchlist',
  styleUrls: ['./home-watchlist.scss'],
  templateUrl: './home-watchlist.html'
})
export class GfHomeWatchlistComponent implements OnInit {
  protected assetTypeFilter: 'ALL' | 'ETF' | 'FUND' | 'STOCK' = 'ALL';
  protected hasImpersonationId: boolean;
  protected hasPermissionToCreateWatchlistItem: boolean;
  protected hasPermissionToDeleteWatchlistItem: boolean;
  protected isSendingLeaderScreen = false;
  protected searchTerm = '';
  protected user: User;
  protected watchlist: Benchmark[];

  // Latest metrics snapshot, held separately because it arrives on its own
  // request and the two can land in either order. See loadWatchlistData.
  private latestMetrics: Record<string, WatchlistMetric> = {};

  protected readonly deviceType = computed(
    () => this.deviceDetectorService.deviceInfo().deviceType
  );

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deviceDetectorService = inject(DeviceDetectorService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly impersonationStorageService = inject(
    ImpersonationStorageService
  );
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);

  public constructor() {
    this.impersonationStorageService
      .onChangeHasImpersonation()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((impersonationId) => {
        this.hasImpersonationId = !!impersonationId;
      });

    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (params['createWatchlistItemDialog']) {
          this.openCreateWatchlistItemDialog();
        }
      });

    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.hasPermissionToCreateWatchlistItem =
            !this.hasImpersonationId &&
            hasPermission(
              this.user.permissions,
              permissions.createWatchlistItem
            );
          this.hasPermissionToDeleteWatchlistItem =
            !this.hasImpersonationId &&
            hasPermission(
              this.user.permissions,
              permissions.deleteWatchlistItem
            );

          this.changeDetectorRef.markForCheck();
        }
      });
  }

  public ngOnInit() {
    timer(0, WATCHLIST_METRICS_REFRESH_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadWatchlistData();
      });
  }

  /**
   * Cached derivations of `watchlist`.
   *
   * These were plain getters bound in the template, so each one rescanned the
   * ~860-item array on EVERY change-detection pass — and `filteredWatchlist`
   * returned a fresh array identity each time, which re-fired the table's
   * effect and made it re-sort and re-render all 860 rows continuously. They are
   * now recomputed only when the data or a filter actually changes.
   */
  private derived: {
    etfCount: number;
    filtered: Benchmark[];
    fundCount: number;
    stockCount: number;
  } = { etfCount: 0, filtered: [], fundCount: 0, stockCount: 0 };

  protected get filteredWatchlist(): Benchmark[] {
    return this.derived.filtered;
  }

  protected get etfCount(): number {
    return this.derived.etfCount;
  }

  protected get fundCount(): number {
    return this.derived.fundCount;
  }

  protected get stockCount(): number {
    return this.derived.stockCount;
  }

  /** Recompute the cached derivations. Call after any change to the inputs. */
  private refreshDerived() {
    if (!this.watchlist) {
      this.derived = {
        etfCount: 0,
        filtered: this.watchlist,
        fundCount: 0,
        stockCount: 0
      };

      return;
    }

    let items = this.watchlist;

    if (this.assetTypeFilter === 'FUND') {
      items = items.filter(this.isFund);
    } else if (this.assetTypeFilter !== 'ALL') {
      items = items.filter((item) => {
        return item.assetSubClass === this.assetTypeFilter;
      });
    }

    const searchTerm = this.searchTerm.trim().toLowerCase();

    if (searchTerm) {
      items = items.filter((item) => {
        return (
          item.symbol?.toLowerCase().includes(searchTerm) ||
          item.name?.toLowerCase().includes(searchTerm)
        );
      });
    }

    this.derived = {
      etfCount: this.watchlist.filter((item) => {
        return item.assetSubClass === 'ETF';
      }).length,
      filtered: items,
      fundCount: this.watchlist.filter(this.isFund).length,
      stockCount: this.watchlist.filter((item) => {
        return item.assetSubClass === 'STOCK';
      }).length
    };
  }

  protected onSearchChange(searchTerm: string) {
    this.searchTerm = searchTerm;
    this.refreshDerived();
    this.changeDetectorRef.markForCheck();
  }

  protected onSelectAssetTypeFilter(
    assetTypeFilter: 'ALL' | 'ETF' | 'FUND' | 'STOCK'
  ) {
    this.assetTypeFilter = assetTypeFilter;
    this.refreshDerived();
    this.changeDetectorRef.markForCheck();
  }

  // Mutual funds are MANUAL-datasource assets (Nordnet/Avanza-priced), some
  // older profiles lack assetSubClass — dataSource is the robust marker.
  private isFund(item: Benchmark): boolean {
    return item.dataSource === 'MANUAL' || item.assetSubClass === 'MUTUALFUND';
  }

  protected onWatchlistItemDeleted({
    dataSource,
    symbol
  }: AssetProfileIdentifier) {
    this.dataService
      .deleteWatchlistItem({ dataSource, symbol })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          return this.loadWatchlistData();
        }
      });
  }

  /**
   * Runs the leader screen on demand and reports the outcome.
   *
   * The scheduled screen runs at 22:40 on weekday evenings, which a machine
   * that is asleep or a dev server that is stopped simply misses — crons do not
   * catch up. This is the manual path. The snackbar always states a result,
   * including zero, because a silent alert and a broken alert are otherwise
   * indistinguishable.
   */
  protected onSendLeaderScreen() {
    if (this.isSendingLeaderScreen) {
      return;
    }

    this.isSendingLeaderScreen = true;
    this.changeDetectorRef.markForCheck();

    this.dataService
      .sendLeaderScreen()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.isSendingLeaderScreen = false;
          this.snackBar.open(
            $localize`Leader screen failed - check the API log`,
            undefined,
            { duration: 5000 }
          );
          this.changeDetectorRef.markForCheck();
        },
        next: ({ sent }) => {
          this.isSendingLeaderScreen = false;
          this.snackBar.open(
            sent > 0
              ? $localize`${sent} breakout(s) sent to Telegram`
              : $localize`No new breakouts today`,
            undefined,
            { duration: 5000 }
          );
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  /**
   * Loads the rows and their metrics INDEPENDENTLY, rather than waiting for
   * both.
   *
   * The two requests are not comparable in cost: the watchlist itself is a
   * cheap read, while the metrics snapshot spans every watched symbol and
   * takes seconds on a cold cache. Joining them meant the table stayed empty
   * for as long as the slower one took, which read as the page being broken
   * rather than busy.
   *
   * Rows therefore render as soon as they arrive, and each metric merges into
   * its existing row afterwards. The merge is keyed on `symbol`, the same key
   * the joined version used, so row identity is unchanged.
   */
  private loadWatchlistData() {
    this.dataService
      .fetchWatchlist()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ watchlist }) => {
        // Carries whatever metrics are already known, so a 30-minute refresh
        // never blanks columns that are still valid.
        this.watchlist = watchlist.map((item) => {
          return { ...item, ...this.latestMetrics[item.symbol] };
        });

        this.refreshDerived();
        this.changeDetectorRef.markForCheck();
      });

    this.dataService
      .fetchWatchlistMetrics()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((metrics) => {
        this.latestMetrics = metrics;

        // Rows normally land first, but not necessarily. If they have not, the
        // handler above merges from `latestMetrics` when they do.
        if (this.watchlist) {
          // Mutated in place rather than respread: a new object per row would
          // change every row's identity, and the table would discard and
          // rebuild all ~860 of them purely to show columns that just arrived.
          for (const item of this.watchlist) {
            Object.assign(item, metrics[item.symbol]);
          }

          this.refreshDerived();
        }

        this.changeDetectorRef.markForCheck();
      });
  }

  private openCreateWatchlistItemDialog() {
    this.userService
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.user = user;

        const dialogRef = this.dialog.open<
          GfCreateWatchlistItemDialogComponent,
          CreateWatchlistItemDialogParams
        >(GfCreateWatchlistItemDialogComponent, {
          autoFocus: false,
          data: {
            deviceType: this.deviceType(),
            locale: this.user?.settings?.locale ?? defaultLocale
          },
          width: this.deviceType() === 'mobile' ? '100vw' : '50rem'
        });

        dialogRef
          .afterClosed()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(({ dataSource, symbol } = {}) => {
            if (dataSource && symbol) {
              this.dataService
                .postWatchlistItem({ dataSource, symbol })
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe({
                  next: () => this.loadWatchlistData()
                });
            }

            this.router.navigate(['.'], { relativeTo: this.route });
          });
      });
  }
}
