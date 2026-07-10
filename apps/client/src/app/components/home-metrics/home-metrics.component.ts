import {
  SIGNAL_METRIC_DEFINITIONS,
  SignalMetricDefinition
} from '@ghostfolio/common/signal-metrics-glossary';

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { linkOutline } from 'ionicons/icons';
import { MarkdownModule } from 'ngx-markdown';

/** How long the scrolled-to card stays highlighted (ms). */
const HIGHLIGHT_DURATION_MS = 1600;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [IonIcon, MarkdownModule, RouterModule],
  selector: 'gf-home-metrics',
  styleUrls: ['./home-metrics.scss'],
  templateUrl: './home-metrics.html'
})
export class GfHomeMetricsComponent {
  protected readonly glossary: SignalMetricDefinition[] =
    SIGNAL_METRIC_DEFINITIONS;

  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  public constructor() {
    addIcons({ linkOutline });

    // Angular's built-in anchorScrolling doesn't reliably land on the exact
    // card (same-route fragment changes, or the target not yet in the DOM),
    // so scroll to the fragment explicitly and flash it for feedback.
    this.route.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fragment) => {
        if (!fragment) {
          return;
        }

        // Defer to the next tick so the cards have rendered.
        setTimeout(() => {
          const element = document.getElementById(fragment);

          if (!element) {
            return;
          }

          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          element.classList.add('gf-metric-highlight');

          setTimeout(() => {
            element.classList.remove('gf-metric-highlight');
          }, HIGHLIGHT_DURATION_MS);
        });
      });
  }

  protected toMarkdown(metric: SignalMetricDefinition): string {
    return [
      metric.summary,
      '```text',
      metric.formula,
      '```',
      metric.notes
    ].join('\n\n');
  }
}
