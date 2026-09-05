import {
  ChangeDetectionStrategy,
  Component,
  input,
  output
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, searchOutline } from 'ionicons/icons';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

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

  /**
   * Keystrokes are debounced before they reach the page.
   *
   * Every consumer filters a large list on this value — the Watchlist re-filters
   * and re-sorts ~860 rows — so emitting per character made typing re-render the
   * whole table on each letter. 300ms matches the assistant's search.
   */
  private readonly input$ = new Subject<string>();

  public constructor() {
    addIcons({ closeOutline, searchOutline });

    this.input$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.valueChange.emit(value);
      });
  }

  protected onInput(event: Event) {
    this.input$.next((event.target as HTMLInputElement).value);
  }

  protected onClear() {
    // Clearing is a deliberate action, not typing — emit it immediately.
    this.valueChange.emit('');
  }
}
