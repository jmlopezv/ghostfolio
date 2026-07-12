import {
  ACADEMY_LEVELS,
  AcademyLesson,
  AcademyLevel
} from '@ghostfolio/common/academy-curriculum';
import {
  AcademyExampleResponse,
  AcademyLessonProgress,
  AcademyMarketPulseResponse,
  AcademyQuizSubmissionResult,
  LineChartItem
} from '@ghostfolio/common/interfaces';
import { GfAcademyQuizComponent } from '@ghostfolio/ui/academy-quiz';
import { GfLineChartComponent } from '@ghostfolio/ui/line-chart';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { DataSource } from '@prisma/client';
import { MarkdownModule } from 'ngx-markdown';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

const FALLBACK_SYMBOL = 'AAPL';
const FALLBACK_DATA_SOURCE: DataSource = 'YAHOO';

export interface ReadingSource {
  name: string;
  description: string;
  url: string;
}

/**
 * Curated, static — no scraping of any of these sites. Perplexity Finance is
 * included per the user's own reference; the rest are picked for direct
 * relevance to this portfolio: fund/ETF research (Morningstar) and general
 * charting/market data (TradingView, Yahoo Finance — the latter already this
 * app's own price data source). A previously-included Nordnet news link and a
 * one-time Perplexity share link were removed (2026-07-08) as broken/low-value.
 */
const READING_SOURCES: ReadingSource[] = [
  {
    description:
      'AI-powered market summaries, sector heatmaps, and news/sentiment digests — a fast, structured way to get a feel for "what happened today."',
    name: 'Perplexity Finance',
    url: 'https://www.perplexity.ai/finance'
  },
  {
    description:
      'Independent fund/ETF ratings, fee analysis, and analyst research — directly relevant given most of this portfolio sits in the fund sleeve.',
    name: 'Morningstar',
    url: 'https://www.morningstar.com/'
  },
  {
    description:
      'Charting, technical-analysis community ideas, and watchlists — complements the indicator-driven approach used throughout this engine.',
    name: 'TradingView',
    url: 'https://www.tradingview.com/'
  },
  {
    description:
      "The same free data source this app's own signal engine is built on — quotes, fundamentals, and news in one place.",
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/'
  }
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page' },
  imports: [
    CommonModule,
    GfAcademyQuizComponent,
    GfLineChartComponent,
    MarkdownModule,
    NgxSkeletonLoaderModule,
    RouterModule
  ],
  selector: 'gf-home-academy',
  styleUrls: ['./home-academy.scss'],
  templateUrl: './home-academy.html'
})
export class GfHomeAcademyComponent implements OnInit {
  protected exampleChart: LineChartItem[] | null = null;
  protected exampleMeta: AcademyExampleResponse | null = null;
  protected isLoading = false;
  protected isLoadingExample = false;
  protected isLoadingMarketPulse = false;
  protected levels: AcademyLevel[] = ACADEMY_LEVELS;
  protected marketPulse: AcademyMarketPulseResponse | null = null;
  protected progressByLessonId: Record<string, AcademyLessonProgress> = {};
  protected quizResult: AcademyQuizSubmissionResult | null = null;
  protected readingSources: ReadingSource[] = READING_SOURCES;
  protected selectedLesson: AcademyLesson | null = null;

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);

  public ngOnInit() {
    this.isLoading = true;
    this.isLoadingMarketPulse = true;

    this.dataService
      .fetchAcademyProgress()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((response) => {
        this.progressByLessonId = Object.fromEntries(
          response.progress.map((entry) => [entry.lessonId, entry])
        );
        this.isLoading = false;
        this.changeDetectorRef.markForCheck();
      });

    this.dataService
      .fetchAcademyMarketPulse()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.isLoadingMarketPulse = false;
          this.changeDetectorRef.markForCheck();
        },
        next: (response) => {
          this.marketPulse = response;
          this.isLoadingMarketPulse = false;
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  protected lessonStatus(
    lesson: AcademyLesson
  ): 'not-started' | 'completed' | 'coming-soon' {
    if (lesson.quiz.length === 0) {
      return 'coming-soon';
    }

    return this.progressByLessonId[lesson.id]?.status === 'completed'
      ? 'completed'
      : 'not-started';
  }

  protected onSelectLesson(lesson: AcademyLesson) {
    if (lesson.quiz.length === 0) {
      return;
    }

    this.selectedLesson = lesson;
    this.exampleChart = null;
    this.exampleMeta = null;

    const priorScore = this.progressByLessonId[lesson.id]?.score;
    this.quizResult =
      priorScore != null
        ? {
            answers: this.progressByLessonId[lesson.id]?.quizAnswers ?? {},
            lessonId: lesson.id,
            results: [],
            score: priorScore
          }
        : null;

    this.loadExample(lesson);
    this.changeDetectorRef.markForCheck();
  }

  protected onSubmitQuiz(answers: Record<string, string>) {
    if (!this.selectedLesson) {
      return;
    }

    this.dataService
      .submitAcademyQuiz(this.selectedLesson.id, answers)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        this.quizResult = result;
        this.progressByLessonId[result.lessonId] = {
          completedAt: new Date().toISOString(),
          lessonId: result.lessonId,
          quizAnswers: result.answers,
          score: result.score,
          status: 'completed'
        };
        this.changeDetectorRef.markForCheck();
      });
  }

  private loadExample(lesson: AcademyLesson) {
    const symbol = lesson.practiceSymbolDefault ?? FALLBACK_SYMBOL;
    this.isLoadingExample = true;

    this.dataService
      .fetchAcademyExample(FALLBACK_DATA_SOURCE, symbol)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.isLoadingExample = false;
          this.changeDetectorRef.markForCheck();
        },
        next: (response) => {
          this.exampleMeta = response;
          this.exampleChart = response.closes.map(({ date, price }) => ({
            date,
            value: price
          }));
          this.isLoadingExample = false;
          this.changeDetectorRef.markForCheck();
        }
      });
  }
}
