import { locale as defaultLocale } from '@ghostfolio/common/config';
import { ColorScheme } from '@ghostfolio/common/types';

import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { DataSource } from '@prisma/client';

import { GfBenchmarkDetailDialogComponent } from './benchmark-detail-dialog.component';
import { BenchmarkDetailDialogParams } from './interfaces/interfaces';

/**
 * Opens the same asset-detail dialog the Watchlist page uses, so a ticker
 * clicked anywhere in the app (Analytics, Simulation, Correlation, ...)
 * lands on the identical Chart/Style/Holdings/Correlation view. Mirrors
 * `BenchmarkComponent`'s `openBenchmarkDetailDialog` exactly (including the
 * afterClosed re-open when the user clicks a correlated asset inside the
 * dialog), factored out so a third/fourth call site doesn't re-duplicate it.
 */
export function openBenchmarkDetailDialog({
  colorScheme,
  dataSource,
  destroyRef,
  deviceType,
  dialog,
  locale,
  symbol
}: {
  colorScheme?: ColorScheme;
  dataSource: DataSource;
  destroyRef: DestroyRef;
  deviceType?: string;
  dialog: MatDialog;
  locale?: string;
  symbol: string;
}): void {
  const dialogRef = dialog.open<
    GfBenchmarkDetailDialogComponent,
    BenchmarkDetailDialogParams
  >(GfBenchmarkDetailDialogComponent, {
    data: {
      colorScheme,
      dataSource,
      deviceType: deviceType ?? 'desktop',
      locale: locale ?? defaultLocale,
      symbol
    },
    height: deviceType === 'mobile' ? '98vh' : undefined,
    width: deviceType === 'mobile' ? '100vw' : '50rem'
  });

  dialogRef
    .afterClosed()
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe((result?: { dataSource?: DataSource; symbol?: string }) => {
      // Clicking a correlated asset in the dialog closes it with that asset's
      // identifier — re-open the dialog for it.
      if (result?.dataSource && result?.symbol) {
        openBenchmarkDetailDialog({
          colorScheme,
          dataSource: result.dataSource,
          destroyRef,
          deviceType,
          dialog,
          locale,
          symbol: result.symbol
        });
      }
    });
}
