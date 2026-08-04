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
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

export interface SimulationChartSeries {
  color: string;
  data: LineChartItem[];
  label: string;
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
  public readonly series = input.required<SimulationChartSeries[]>();

  protected chart: Chart<'line'>;

  private readonly chartCanvas =
    viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');

  public constructor() {
    Chart.register(
      annotationPlugin,
      LinearScale,
      LineController,
      LineElement,
      PointElement,
      TimeScale,
      Tooltip
    );

    registerChartConfiguration();
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
      datasets: this.series().map(({ color, data: points, label }) => ({
        backgroundColor: color,
        borderColor: color,
        borderWidth: 2,
        data: points.map(({ date, value }) => ({
          x: parseDate(date)?.getTime() ?? null,
          y: value
        })),
        label,
        pointRadius: 0
      }))
    };

    if (!this.chartCanvas()) {
      return;
    }

    if (this.chart) {
      this.chart.data = data;
      this.chart.options.plugins ??= {};
      this.chart.options.plugins.tooltip = this.getTooltipPluginConfiguration();

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
            annotation: {
              annotations: {
                yAxis: {
                  borderColor: `rgba(${getTextColor(this.colorScheme())}, 0.1)`,
                  borderWidth: 1,
                  scaleID: 'y',
                  type: 'line',
                  value: 0
                }
              }
            },
            legend: {
              align: 'start',
              display: true,
              position: 'bottom'
            },
            tooltip: this.getTooltipPluginConfiguration(),
            verticalHoverLine: {
              color: `rgba(${getTextColor(this.colorScheme())}, 0.1)`
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
