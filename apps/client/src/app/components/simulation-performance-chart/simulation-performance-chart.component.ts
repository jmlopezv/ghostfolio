import {
  getTooltipOptions,
  getVerticalHoverLinePlugin
} from '@ghostfolio/common/chart-helper';
import {
  getBackgroundColor,
  getDateFormatString,
  getLocale,
  getTextColor,
  parseDate
} from '@ghostfolio/common/helper';
import { LineChartItem } from '@ghostfolio/common/interfaces';
import { ColorScheme } from '@ghostfolio/common/types';
import { registerChartConfiguration } from '@ghostfolio/ui/chart';

import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  OnChanges,
  OnDestroy,
  viewChild
} from '@angular/core';
import {
  Chart,
  ChartData,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
  type TooltipOptions
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

export interface SimulationChartSeries {
  color: string;
  data: LineChartItem[];
  /** Rendered dashed — marks a buy-and-hold twin of a solid line. */
  dashed?: boolean;
  /** Starts hidden; still toggleable from the legend. */
  hidden?: boolean;
  label: string;
}

/** A point to mark on the chart — an exit the engine signalled. */
export interface SimulationChartMarker {
  date: string;
  label: string;
  /** Where on the y-axis to pin it, in the same % units as the series. */
  value: number;
}

/**
 * A generalization of gf-benchmark-comparator's two-hardcoded-dataset chart
 * into an N-named-series % performance chart — used by the Simulation tab to
 * overlay DIP / REVERSAL / Tracked (+ optional S&P 500) curves on one chart.
 * Built as its own component rather than extending gf-benchmark-comparator
 * or gf-line-chart, since both are used elsewhere and are hard-capped at 2
 * datasets by design.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgxSkeletonLoaderModule],
  selector: 'gf-simulation-performance-chart',
  styleUrls: ['./simulation-performance-chart.component.scss'],
  templateUrl: './simulation-performance-chart.component.html'
})
export class GfSimulationPerformanceChartComponent
  implements OnChanges, OnDestroy
{
  public readonly colorScheme = input.required<ColorScheme>();
  public readonly isLoading = input<boolean>(false);
  public readonly locale = input(getLocale());
  public readonly markers = input<SimulationChartMarker[]>([]);
  public readonly series = input.required<SimulationChartSeries[]>();

  protected chart: Chart<'line'>;

  private readonly chartCanvas =
    viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');

  public constructor() {
    // Legend is what makes a line toggleable — Chart.js hides a dataset on
    // legend click natively, but only if the plugin that draws the legend is
    // registered. Without it `legend: { display: true }` configures nothing,
    // no legend appears, and there is nothing to click. Chart.js registers
    // nothing by default; every plugin used here has to be named.
    Chart.register(
      annotationPlugin,
      Legend,
      LinearScale,
      LineController,
      LineElement,
      PointElement,
      TimeScale,
      Tooltip,
      zoomPlugin
    );

    registerChartConfiguration();
  }

  /** Show every series again after the legend has been used to hide some. */
  public showAll() {
    this.setAllVisible(true);
  }

  /** Hide every series, so one can be brought back alone. */
  public hideAll() {
    this.setAllVisible(false);
  }

  /** Undo any drag-zoom / pan back to the full range. */
  public resetZoom() {
    this.chart?.resetZoom();
  }

  private setAllVisible(visible: boolean) {
    if (!this.chart) {
      return;
    }

    this.chart.data.datasets.forEach((_, index) => {
      this.chart.setDatasetVisibility(index, visible);
    });

    this.chart.update();
  }

  public ngOnChanges() {
    if (this.series()) {
      this.initialize();
    }
  }

  public ngOnDestroy() {
    this.chart?.destroy();
  }

  private initialize() {
    const data: ChartData<'line'> = {
      datasets: this.series().map(
        ({ color, dashed, data: points, hidden, label }) => ({
          backgroundColor: color,
          borderColor: color,
          // A buy-and-hold twin shares its sibling's colour, so the dash is
          // what separates them — same strategy, different exit.
          borderDash: dashed ? [5, 3] : undefined,
          borderWidth: 2,
          data: points.map(({ date, value }) => ({
            x: parseDate(date)?.getTime() ?? null,
            y: value
          })),
          hidden: hidden ?? false,
          label,
          pointRadius: 0
        })
      )
    };

    if (!this.chartCanvas()) {
      return;
    }

    if (this.chart) {
      this.chart.data = data;
      this.chart.options.plugins ??= {};
      this.chart.options.plugins.tooltip = this.getTooltipPluginConfiguration();
      // Rebuild the markers too — a zoom change re-enters here, and stale
      // annotations would sit at the wrong dates.
      this.chart.options.plugins.annotation = {
        annotations: this.getAnnotations()
      };

      this.chart.update();
    } else {
      this.chart = new Chart<'line'>(this.chartCanvas().nativeElement, {
        data,
        options: {
          animation: false,
          elements: {
            line: {
              tension: 0
            },
            point: {
              hoverBackgroundColor: getBackgroundColor(this.colorScheme()),
              hoverRadius: 2,
              radius: 0
            }
          },
          interaction: { intersect: false, mode: 'index' },
          maintainAspectRatio: true,
          plugins: {
            annotation: { annotations: this.getAnnotations() },
            legend: {
              align: 'start',
              display: true,
              labels: {
                boxHeight: 2,
                boxWidth: 24,
                padding: 12,
                usePointStyle: false
              },
              // Chart.js toggles a dataset when its legend entry is clicked,
              // which is the show/hide behaviour this chart needs; the cursor
              // change is the only hint that it is clickable.
              onHover: (event) => {
                const target = event.native?.target as HTMLElement | undefined;

                if (target) {
                  target.style.cursor = 'pointer';
                }
              },
              onLeave: (event) => {
                const target = event.native?.target as HTMLElement | undefined;

                if (target) {
                  target.style.cursor = 'default';
                }
              },
              position: 'bottom'
            },
            tooltip: this.getTooltipPluginConfiguration(),
            verticalHoverLine: {
              color: `rgba(${getTextColor(this.colorScheme())}, 0.1)`
            },
            zoom: {
              limits: { x: { minRange: 7 * 24 * 60 * 60 * 1000 } },
              pan: { enabled: true, mode: 'x', modifierKey: 'shift' },
              zoom: {
                drag: {
                  backgroundColor: `rgba(${getTextColor(this.colorScheme())}, 0.08)`,
                  enabled: true
                },
                mode: 'x',
                wheel: { enabled: true, speed: 0.05 }
              }
            }
          },
          responsive: true,
          scales: {
            x: {
              border: {
                color: `rgba(${getTextColor(this.colorScheme())}, 0.1)`,
                width: 1
              },
              display: true,
              grid: {
                display: false
              },
              type: 'time',
              time: {
                tooltipFormat: getDateFormatString(this.locale()),
                unit: 'month'
              }
            },
            y: {
              border: {
                width: 0
              },
              display: true,
              // Annotations do not widen a Chart.js scale, and an exit marker
              // sits ABOVE every curve by construction — it is one trade's
              // return against a bucket average. Without headroom the topmost
              // label is drawn outside the plot area and clipped, which is
              // exactly what happened to the first one shipped.
              ...this.markerHeadroom(),
              grid: {
                color: ({ scale, tick }) => {
                  if (
                    tick.value === 0 ||
                    tick.value === scale.max ||
                    tick.value === scale.min
                  ) {
                    return `rgba(${getTextColor(this.colorScheme())}, 0.1)`;
                  }

                  return 'transparent';
                }
              },
              position: 'right',
              ticks: {
                callback: (value: number) => {
                  return `${value.toFixed(2)} %`;
                },
                display: true,
                mirror: true,
                z: 1
              }
            }
          }
        },
        plugins: [
          getVerticalHoverLinePlugin(this.chartCanvas(), this.colorScheme())
        ],
        type: 'line'
      });
    }
  }

  /**
   * Enough room above and below the extreme markers for their labels to fit.
   *
   * `suggested*` rather than hard bounds, so the data still decides the scale
   * whenever it already reaches further than the markers do.
   */
  private markerHeadroom(): { suggestedMax?: number; suggestedMin?: number } {
    const values = this.markers().map(({ value }) => value);

    if (values.length === 0) {
      return {};
    }

    const highest = Math.max(...values);
    const lowest = Math.min(...values);
    // A label is ~26px off its dot; 15% of the spread clears it at any zoom.
    const pad = Math.max(3, (highest - lowest) * 0.15);

    return {
      suggestedMax: highest + pad,
      suggestedMin: Math.min(0, lowest - pad)
    };
  }

  /**
   * The zero line, plus one labelled point per signalled exit.
   *
   * The exits are the reason this chart is worth reading: without them a
   * strategy curve just runs on, and there is nothing to show that the engine
   * said "sell" on a given day or what taking that advice would have returned.
   */
  private getAnnotations() {
    const textColor = getTextColor(this.colorScheme());
    const annotations: Record<string, unknown> = {
      yAxis: {
        borderColor: `rgba(${textColor}, 0.1)`,
        borderWidth: 1,
        scaleID: 'y',
        type: 'line',
        value: 0
      }
    };

    this.markers().forEach((marker, index) => {
      const positive = marker.value >= 0;
      const color = positive ? 'rgb(21, 128, 61)' : 'rgb(190, 40, 30)';
      const x = parseDate(marker.date)?.getTime() ?? null;

      // TWO annotations, not one. In chartjs-plugin-annotation v3 a `point`
      // has no `label` option — `label` is its own annotation type — so a
      // label nested inside a point is silently dropped and only the bare dot
      // draws. They share coordinates and are offset apart by the label.
      annotations[`exitPoint${index}`] = {
        backgroundColor: color,
        borderColor: getBackgroundColor(this.colorScheme()),
        borderWidth: 2,
        pointStyle: 'circle',
        radius: 6,
        type: 'point',
        xValue: x,
        yValue: marker.value
      };

      annotations[`exitLabel${index}`] = {
        backgroundColor: color,
        borderRadius: 4,
        callout: {
          borderColor: color,
          borderWidth: 1,
          display: true,
          margin: 3,
          side: 4
        },
        color: '#fff',
        content: marker.label,
        font: { size: 10, weight: 'bold' },
        padding: { x: 5, y: 3 },
        type: 'label',
        xValue: x,
        // BELOW a gain, above a loss — the opposite of the obvious choice, and
        // the correct one here. An exit marker is one trade's return against a
        // bucket average, so a winning exit sits above every curve on the
        // chart: the space between the dot and the curves is empty, while the
        // space above it is the edge of the plot. Putting the label on the
        // outside clipped the topmost one straight off the canvas.
        yAdjust: positive ? 26 : -26,
        yValue: marker.value
      };
    });

    return annotations;
  }

  private getTooltipPluginConfiguration(): Partial<TooltipOptions<'line'>> {
    return {
      ...getTooltipOptions({
        colorScheme: this.colorScheme(),
        locale: this.locale(),
        unit: '%'
      }),
      mode: 'index',
      position: 'top',
      xAlign: 'center',
      yAlign: 'bottom'
    };
  }
}
