import { DATE_FORMAT } from '@ghostfolio/common/helper';
import {
  AdminMarketDataDetails,
  AssetDetailResponse,
  LineChartItem
} from '@ghostfolio/common/interfaces';
import { GfDialogFooterComponent } from '@ghostfolio/ui/dialog-footer';
import { GfDialogHeaderComponent } from '@ghostfolio/ui/dialog-header';
import { DataService } from '@ghostfolio/ui/services';

import { DecimalPipe } from '@angular/common';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  Inject,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef
} from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { IonIcon } from '@ionic/angular/standalone';
import { format } from 'date-fns';
import { addIcons } from 'ionicons';
import {
  contractOutline,
  expandOutline,
  gridOutline,
  listOutline,
  pieChartOutline,
  trendingUpOutline
} from 'ionicons/icons';
import { catchError, of } from 'rxjs';

import { GfLineChartComponent } from '../../line-chart/line-chart.component';
import { GfValueComponent } from '../../value/value.component';
import { BenchmarkDetailDialogParams } from './interfaces/interfaces';

const STYLE_SIZES = ['LARGE', 'MID', 'SMALL'] as const;
const STYLE_KINDS = ['VALUE', 'BLEND', 'GROWTH'] as const;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'd-flex flex-column h-100' },
  imports: [
    DecimalPipe,
    GfDialogFooterComponent,
    GfDialogHeaderComponent,
    GfLineChartComponent,
    GfValueComponent,
    IonIcon,
    MatDialogModule,
    MatTabsModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-benchmark-detail-dialog',
  styleUrls: ['./benchmark-detail-dialog.component.scss'],
  templateUrl: 'benchmark-detail-dialog.html'
})
export class GfBenchmarkDetailDialogComponent implements OnInit {
  public assetProfile: AdminMarketDataDetails['assetProfile'];
  public detail: AssetDetailResponse;
  /** True once the asset-detail fetch has settled (success OR error). */
  public detailLoaded = false;
  /** True when the asset-detail fetch failed (shown so this is never silent). */
  public detailLoadError = false;
  public historicalDataItems: LineChartItem[];
  public isFundOrEtf = false;
  public isWidescreen = false;
  public maxOverlapPct = 0;
  public readonly styleKinds = STYLE_KINDS;
  public readonly styleSizes = STYLE_SIZES;
  public value: number;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private destroyRef: DestroyRef,
    public dialogRef: MatDialogRef<GfBenchmarkDetailDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BenchmarkDetailDialogParams
  ) {
    addIcons({
      contractOutline,
      expandOutline,
      gridOutline,
      listOutline,
      pieChartOutline,
      trendingUpOutline
    });
  }

  public ngOnInit() {
    this.dataService
      .fetchAsset({
        dataSource: this.data.dataSource,
        symbol: this.data.symbol
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ assetProfile, marketData }) => {
        this.assetProfile = assetProfile;

        this.historicalDataItems = marketData.map(
          ({ date, marketPrice }, index) => {
            if (marketData.length - 1 === index) {
              this.value = marketPrice;
            }

            return {
              date: format(date, DATE_FORMAT),
              value: marketPrice
            };
          }
        );

        this.changeDetectorRef.markForCheck();
      });

    this.dataService
      .fetchAssetDetail({
        dataSource: this.data.dataSource,
        symbol: this.data.symbol
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError((error) => {
          // Never let a fetch failure leave the dialog silently stuck on the
          // Chart-only view — surface it so it's obvious something broke.
          console.error(
            '[gf-benchmark-detail-dialog] asset-detail failed',
            error
          );

          return of(null);
        })
      )
      .subscribe((detail) => {
        this.detailLoaded = true;

        if (detail) {
          this.detail = detail;
          this.isFundOrEtf =
            detail.dataSource === 'MANUAL' ||
            detail.assetSubClass === 'ETF' ||
            detail.assetSubClass === 'MUTUALFUND';
          this.maxOverlapPct = detail.overlaps?.[0]?.overlapPct ?? 0;
        } else {
          this.detailLoadError = true;
        }

        this.changeDetectorRef.markForCheck();
      });
  }

  /**
   * The grid only renders when we have Yahoo's REAL Morningstar
   * classification (both size and style, decoded from their own Profile
   * page) — that's the only case that ever produces a genuine single-cell
   * answer. The ratio-based ESTIMATED fallback often only has `style` (never
   * `size`, since we deliberately don't guess it — see `classifyStyleBox`'s
   * doc comment), which would highlight a whole column, not one cell; rather
   * than show that misleading partial grid, the ESTIMATED case shows the
   * raw ratios as plain text with no grid at all.
   */
  public get hasStyleGrid(): boolean {
    return this.detail?.styleBox?.sizeStyleSource === 'MORNINGSTAR';
  }

  /** The trailing 1-year % return, if known — a plain static label, no chart interaction. */
  public get oneYearReturnPct(): number | undefined {
    return this.detail?.returns?.find((r) => r.period === '1Y')?.pct;
  }

  /**
   * True when this cell is highlighted. Both axes known → one cell; only style
   * known → the whole style column; only size known → the whole size row.
   */
  public isStyleCell(
    size: (typeof STYLE_SIZES)[number],
    kind: (typeof STYLE_KINDS)[number]
  ): boolean {
    const box = this.detail?.styleBox;

    if (!box) {
      return false;
    }

    const sizeMatch = !box.size || box.size === size;
    const styleMatch = !box.style || box.style === kind;

    return sizeMatch && styleMatch && !!(box.size || box.style);
  }

  /** Human explanation of a style-box cell, for the hover tooltip. */
  public styleCellLabel(
    size: (typeof STYLE_SIZES)[number],
    kind: (typeof STYLE_KINDS)[number]
  ): string {
    const sizeLabel =
      size === 'LARGE' ? 'Large-cap' : size === 'MID' ? 'Mid-cap' : 'Small-cap';
    const kindLabel =
      kind === 'VALUE' ? 'Value' : kind === 'GROWTH' ? 'Growth' : 'Blend';

    return `${sizeLabel} ${kindLabel}`;
  }

  /** 0-1 intensity of an overlap relative to the strongest one. */
  public overlapIntensity(overlapPct: number): number {
    return this.maxOverlapPct > 0
      ? Math.max(0.06, overlapPct / this.maxOverlapPct)
      : 0;
  }

  public onOpenOverlap(dataSource: string, symbol: string) {
    this.dialogRef.close({ dataSource, symbol });
  }

  public onToggleWidescreen() {
    this.isWidescreen = !this.isWidescreen;

    if (this.isWidescreen) {
      this.dialogRef.updateSize('96vw', '94vh');
    } else {
      this.dialogRef.updateSize(
        this.data.deviceType === 'mobile' ? '100vw' : '50rem',
        this.data.deviceType === 'mobile' ? '98vh' : ''
      );
    }
  }

  public onClose() {
    this.dialogRef.close();
  }
}
