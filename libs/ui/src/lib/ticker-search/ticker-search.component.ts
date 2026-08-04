import {
  ChangeDetectionStrategy,
  Component,
  input,
  output
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, searchOutline } from 'ionicons/icons';

/**
 * A plain, page-local ticker/name search box — reused across Watchlist,
 * Analytics, Correlation, and Simulation. One-way [value] + (valueChange),
 * not the model() two-way sugar, so each page keeps its own explicit
 * onSearchChange() handler (matching the existing explicit-handler style
 * already used for those pages' asset-type/category filters).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  selector: 'gf-ticker-search',
  styleUrls: ['./ticker-search.component.scss'],
  templateUrl: './ticker-search.component.html'
})
export class GfTickerSearchComponent {
  public readonly placeholder = input($localize`Search ticker or name…`);
  public readonly value = input('');

  public readonly valueChange = output<string>();

  public constructor() {
    addIcons({ closeOutline, searchOutline });
  }

  protected onInput(event: Event) {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }

  protected onClear() {
    this.valueChange.emit('');
  }
}
