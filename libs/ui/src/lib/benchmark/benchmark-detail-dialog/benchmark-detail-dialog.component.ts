import {
  SIGNAL_TREND_TEMPLATE_MAX_BELOW_HIGH_PCT,
  SIGNAL_TREND_TEMPLATE_MIN_ABOVE_LOW_PCT,
  SIGNAL_TREND_TEMPLATE_MIN_RS,
  SIGNAL_TREND_TEMPLATE_SMA200_RISING_DAYS,
  SIGNAL_VCP_BREAKOUT_VOLUME_RATIO,
  SIGNAL_VCP_MAX_DRYUP_RATIO
} from '@ghostfolio/common/config';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import {
  AdminMarketDataDetails,
  AssetDetailResponse,
  LineChartItem,
  TrendTemplateSnapshot
} from '@ghostfolio/common/interfaces';
import {
  toPerplexityFinanceUrl,
  toTradingViewUrl,
  toYahooFinanceProfileUrl
} from '@ghostfolio/common/symbol-links';
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
  analyticsOutline,
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
      analyticsOutline,
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
   * TradingView symbol page for this asset, or null when there is none to link
   * to — see `toTradingViewUrl`. Kept as a getter rather than a template
   * expression because the exchange resolution is real logic, not formatting.
   */
  public get tradingViewUrl(): string | null {
    return toTradingViewUrl({
      dataSource: this.data.dataSource,
      symbol: this.data.symbol
    });
  }

  /** Yahoo Finance profile page, or null for a listing with no public page. */
  public get yahooFinanceUrl(): string | null {
    return toYahooFinanceProfileUrl({
      dataSource: this.data.dataSource,
      symbol: this.data.symbol
    });
  }

  /** Perplexity Finance page, or null for a listing with no public page. */
  public get perplexityFinanceUrl(): string | null {
    return toPerplexityFinanceUrl({
      dataSource: this.data.dataSource,
      symbol: this.data.symbol
    });
  }

  public get trend(): TrendTemplateSnapshot | undefined {
    return this.detail?.trendTemplate;
  }

  /**
   * The 8 Trend Template criteria in Minervini's own order, each with the
   * number it was decided on.
   *
   * The numbers are the point. A bare tick says a name passed; "303.97 >
   * 285.40" says by how much, which is what separates a leader from something
   * that scraped through and could fail tomorrow. Thresholds come from the
   * shared config constants so the table can never drift from the engine.
   */
  public get trendCriteriaRows(): {
    detail: string;
    label: string;
    ok: boolean;
  }[] {
    const trend = this.trend;

    if (!trend) {
      return [];
    }

    const { criteria, values } = trend;
    const n = (value: number) => value.toFixed(2);

    return [
      {
        detail: `${n(values.price)} vs ${n(values.sma50)} / ${n(values.sma150)} / ${n(values.sma200)}`,
        label: $localize`Price above SMA50/150/200`,
        ok: criteria.aboveAllMovingAverages
      },
      {
        detail: `${n(values.sma150)} vs ${n(values.sma200)}`,
        label: $localize`SMA150 above SMA200`,
        ok: criteria.sma150AboveSma200
      },
      {
        detail: $localize`${trend.sma200RisingDays} days rising (needs ${SIGNAL_TREND_TEMPLATE_SMA200_RISING_DAYS})`,
        label: $localize`SMA200 trending up`,
        ok: criteria.sma200Rising
      },
      {
        detail: `${n(values.sma50)} > ${n(values.sma150)} > ${n(values.sma200)}`,
        label: $localize`Moving averages stacked`,
        ok: criteria.movingAveragesStacked
      },
      {
        detail: `${n(values.price)} vs ${n(values.sma50)}`,
        label: $localize`Price above SMA50`,
        ok: criteria.aboveSma50
      },
      {
        detail: $localize`+${(trend.aboveLowPct * 100).toFixed(1)}% (low ${n(values.low52)}, needs +${SIGNAL_TREND_TEMPLATE_MIN_ABOVE_LOW_PCT * 100}%)`,
        label: $localize`Above the 52-week low`,
        ok: criteria.above52WeekLow
      },
      {
        detail: $localize`−${(trend.belowHighPct * 100).toFixed(1)}% (high ${n(values.high52)}, allows −${SIGNAL_TREND_TEMPLATE_MAX_BELOW_HIGH_PCT * 100}%)`,
        label: $localize`Near the 52-week high`,
        ok: criteria.near52WeekHigh
      },
      {
        detail: this.relativeStrengthDetail,
        label: $localize`Relative strength rank`,
        ok: criteria.relativeStrength
      }
    ];
  }

  /**
   * What the RS cell says, including the case where there is no rank.
   *
   * This used to print "universe too small to rank" for every null — a cause it
   * had never checked, and in practice the wrong one: the ranking cohort is
   * ~850 names against a floor of 30, so that branch is effectively
   * unreachable, while an unpublished map is not. Saying the wrong reason
   * confidently is worse than saying nothing, and it kept a real cache bug
   * invisible for as long as it was there.
   */
  public get relativeStrengthDetail(): string {
    const trend = this.trend;

    if (trend?.rsRank != null) {
      const cohort = trend.rsCohortSize
        ? $localize` of ${trend.rsCohortSize} names`
        : '';
      const asOf = trend.rsAsOf ? $localize`, as of ${trend.rsAsOf}` : '';

      return $localize`${trend.rsRank} (needs ${SIGNAL_TREND_TEMPLATE_MIN_RS})${cohort}${asOf}`;
    }

    switch (trend?.rsUnavailableReason) {
      case 'INSUFFICIENT_HISTORY':
        return $localize`unranked — needs a full year of history`;
      case 'UNIVERSE_TOO_SMALL':
        return $localize`unranked — universe too small to rank`;
      default:
        return $localize`unranked — no ranking published yet`;
    }
  }

  /**
   * The two volume tests, which are a matched pair rather than one reading:
   * supply has to dry up through the base, and demand has to show up on the
   * breakout. A name can pass the first and fail the second — that is exactly
   * what separates an unconfirmed AT_PIVOT from a BREAKOUT.
   */
  public get trendVolumeRows(): {
    detail: string;
    label: string;
    ok: boolean;
    value: string;
  }[] {
    const vcp = this.trend?.vcp;

    if (!vcp) {
      return [];
    }

    return [
      {
        detail: $localize`needs ≤ ${SIGNAL_VCP_MAX_DRYUP_RATIO}× — sellers exhausted`,
        label: $localize`Dry-up (final contraction)`,
        ok: vcp.dryUpRatio <= SIGNAL_VCP_MAX_DRYUP_RATIO,
        value: `${vcp.dryUpRatio.toFixed(2)}×`
      },
      {
        detail: $localize`needs ≥ ${SIGNAL_VCP_BREAKOUT_VOLUME_RATIO}× — demand confirms`,
        label: $localize`Breakout volume (latest bar)`,
        ok: vcp.breakoutVolumeRatio >= SIGNAL_VCP_BREAKOUT_VOLUME_RATIO,
        value: `${vcp.breakoutVolumeRatio.toFixed(2)}×`
      }
    ];
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
