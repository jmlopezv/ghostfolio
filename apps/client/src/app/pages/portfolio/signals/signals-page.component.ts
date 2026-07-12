import {
  TradingSignal,
  TradingSignalsResponse
} from '@ghostfolio/common/interfaces';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowDownCircleOutline,
  arrowUpCircleOutline,
  pauseCircleOutline,
  refreshCircleOutline
} from 'ionicons/icons';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

@Component({
  host: { class: 'page' },
  imports: [CommonModule, IonIcon, NgxSkeletonLoaderModule],
  selector: 'gf-signals-page',
  styleUrl: './signals-page.component.scss',
  templateUrl: './signals-page.component.html'
})
export class GfSignalsPageComponent {
  public groups: {
    color: string;
    iconName: string;
    key: keyof TradingSignalsResponse;
    label: string;
    signals: TradingSignal[];
  }[] = [];
  public hasSignals = false;
  public isLoading = false;

  public constructor(
    private changeDetectorRef: ChangeDetectorRef,
    private dataService: DataService,
    private destroyRef: DestroyRef
  ) {
    addIcons({
      arrowDownCircleOutline,
      arrowUpCircleOutline,
      pauseCircleOutline,
      refreshCircleOutline
    });
  }

  public ngOnInit() {
    this.initialize();
  }

  public onRefresh() {
    this.initialize();
  }

  private initialize() {
    this.isLoading = true;

    this.dataService
      .fetchTradingSignals()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.groups = [
          {
            color: 'text-success',
            iconName: 'arrow-up-circle-outline',
            key: 'buy',
            label: $localize`Buy`,
            signals: response.buy
          },
          {
            color: 'text-danger',
            iconName: 'arrow-down-circle-outline',
            key: 'sell',
            label: $localize`Sell`,
            signals: response.sell
          },
          {
            color: 'text-primary',
            iconName: 'refresh-circle-outline',
            key: 'reinvest',
            label: $localize`Reinvest`,
            signals: response.reinvest
          },
          {
            color: 'text-muted',
            iconName: 'pause-circle-outline',
            key: 'hold',
            label: $localize`Hold`,
            signals: response.hold
          }
        ];

        this.hasSignals = this.groups.some(({ signals }) => signals.length > 0);
        this.isLoading = false;

        this.changeDetectorRef.markForCheck();
      });
  }
}
