import { UserService } from '@ghostfolio/client/services/user/user.service';
import { SignalLogEntry, SignalLogResponse, User } from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  effect,
  inject,
  OnInit,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

const CATEGORY_ORDER = ['BUY', 'REVERSAL', 'SELL', 'REINVEST'];

const HEADER_ROW_1 = [
  'date',
  'symbol',
  'name',
  'signal',
  'atSignalGroup',
  'nowGroup',
  'reason'
];
const HEADER_ROW_2 = [
  'score',
  'rsi',
  'reach',
  'conv',
  'price',
  'currentScore',
  'currentRsi',
  'currentReach',
  'currentConv',
  'currentPrice',
  'days'
];
const DISPLAYED_COLUMNS = [
  'date',
  'symbol',
  'name',
  'signal',
  'score',
  'rsi',
  'reach',
  'conv',
  'price',
  'currentScore',
  'currentRsi',
  'currentReach',
  'currentConv',
  'currentPrice',
  'days',
  'reason'
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [
    CommonModule,
    IonIcon,
    MatSortModule,
    MatTableModule,
    NgxSkeletonLoaderModule,
    RouterModule
  ],
  selector: 'gf-home-analytics',
  styleUrls: ['./home-analytics.scss'],
  templateUrl: './home-analytics.html'
})
export class GfHomeAnalyticsComponent implements OnInit {
  protected readonly dataSource = new MatTableDataSource<SignalLogEntry>([]);
  protected days = 30;
  protected readonly displayedColumns = DISPLAYED_COLUMNS;
  protected entries: SignalLogEntry[] = [];
  protected readonly headerRow1 = HEADER_ROW_1;
  protected readonly headerRow2 = HEADER_ROW_2;
  protected isLoading = false;
  protected selectedCategory: string | null = null;
  protected summaryCards: {
    category: string;
    last30d: number;
    last7d: number;
  }[] = [];
  protected user: User;

  protected readonly sort = viewChild(MatSort);

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userService = inject(UserService);

  public constructor() {
    addIcons({ refreshOutline });

    this.dataSource.sortingDataAccessor = (entry, property) => {
      switch (property) {
        case 'date':
          return new Date(entry.createdAt).getTime();
        case 'signal':
          return entry.category ?? '';
        case 'reach':
          return entry.reachProbability ?? -1;
        case 'conv':
          return entry.conviction ?? -Infinity;
        case 'price':
          return entry.livePrice ?? -1;
        case 'currentReach':
          return entry.currentReachProbability ?? -1;
        case 'currentConv':
          return entry.currentConviction ?? -Infinity;
        case 'currentPrice':
          return entry.currentPrice ?? -1;
        case 'days':
          return entry.daysSinceSignal ?? -1;
        default:
          return (entry as unknown as Record<string, string | number>)[
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

  protected get filteredEntries(): SignalLogEntry[] {
    if (!this.selectedCategory) {
      return this.entries;
    }

    return this.entries.filter(
      (entry) =>
        entry.category === this.selectedCategory ||
        (this.selectedCategory === 'REVERSAL' &&
          entry.signalType === 'REVERSAL')
    );
  }

  protected onRefresh() {
    this.load();
  }

  protected onSelectCategory(category: string | null) {
    this.selectedCategory = this.selectedCategory === category ? null : category;
    this.dataSource.data = this.filteredEntries;
    this.changeDetectorRef.markForCheck();
  }

  protected percent(value: number | undefined): string {
    return value == null ? '—' : `${Math.round(value * 100)}%`;
  }

  private load() {
    this.isLoading = true;

    this.dataService
      .fetchSignalLog({ days: this.days })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response: SignalLogResponse) => {
        this.entries = response.entries;

        const categories = new Set<string>([
          ...CATEGORY_ORDER,
          ...Object.keys(response.summary.last30d)
        ]);

        this.summaryCards = [...categories]
          .filter(
            (category) =>
              CATEGORY_ORDER.includes(category) ||
              response.summary.last30d[category] > 0
          )
          .sort(
            (a, b) =>
              (CATEGORY_ORDER.indexOf(a) + 1 || 99) -
              (CATEGORY_ORDER.indexOf(b) + 1 || 99)
          )
          .map((category) => ({
            category,
            last30d: response.summary.last30d[category] ?? 0,
            last7d: response.summary.last7d[category] ?? 0
          }));

        this.dataSource.data = this.filteredEntries;
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });
  }
}
