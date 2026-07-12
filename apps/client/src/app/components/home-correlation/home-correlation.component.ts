import { UserService } from '@ghostfolio/client/services/user/user.service';
import { locale as defaultLocale } from '@ghostfolio/common/config';
import { CorrelationMatrixResponse, User } from '@ghostfolio/common/interfaces';
import { GfBenchmarkDetailDialogComponent } from '@ghostfolio/ui/benchmark/benchmark-detail-dialog/benchmark-detail-dialog.component';
import { BenchmarkDetailDialogParams } from '@ghostfolio/ui/benchmark/benchmark-detail-dialog/interfaces/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { DataSource } from '@prisma/client';
import { DeviceDetectorService } from 'ngx-device-detector';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [CommonModule, NgxSkeletonLoaderModule],
  selector: 'gf-home-correlation',
  styleUrls: ['./home-correlation.scss'],
  templateUrl: './home-correlation.html'
})
export class GfHomeCorrelationComponent implements OnInit {
  protected isLoading = true;
  protected matrix: number[][] = [];
  protected maxOverlapPct = 0;
  protected symbols: CorrelationMatrixResponse['symbols'] = [];
  protected user: User;

  protected readonly deviceType = computed(
    () => this.deviceDetectorService.deviceInfo().deviceType
  );

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly deviceDetectorService = inject(DeviceDetectorService);
  private readonly dialog = inject(MatDialog);
  private readonly userService = inject(UserService);

  public constructor() {
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

  /** 0.06-1 intensity for the cell background — a floor so even small overlaps register. */
  protected intensity(pct: number): number {
    return this.maxOverlapPct > 0
      ? Math.max(0.06, pct / this.maxOverlapPct)
      : 0;
  }

  protected onOpenAsset(dataSource: DataSource, symbol: string) {
    const dialogRef = this.dialog.open<
      GfBenchmarkDetailDialogComponent,
      BenchmarkDetailDialogParams
    >(GfBenchmarkDetailDialogComponent, {
      data: {
        dataSource,
        symbol,
        colorScheme: this.user?.settings?.colorScheme,
        deviceType: this.deviceType(),
        locale: this.user?.settings?.locale ?? defaultLocale
      },
      height: this.deviceType() === 'mobile' ? '98vh' : undefined,
      width: this.deviceType() === 'mobile' ? '100vw' : '50rem'
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result?: { dataSource?: DataSource; symbol?: string }) => {
        if (result?.dataSource && result?.symbol) {
          this.onOpenAsset(result.dataSource, result.symbol);
        }
      });
  }

  private load() {
    this.isLoading = true;

    this.dataService
      .fetchCorrelationMatrix()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.symbols = response.symbols;
        this.matrix = response.matrix;

        let max = 0;
        for (let i = 0; i < this.matrix.length; i++) {
          for (let j = 0; j < this.matrix.length; j++) {
            if (i !== j) {
              max = Math.max(max, this.matrix[i][j]);
            }
          }
        }
        this.maxOverlapPct = max;

        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });
  }
}
