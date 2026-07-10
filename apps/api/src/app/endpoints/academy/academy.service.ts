import { NewsSentimentService } from '@ghostfolio/api/services/news-sentiment/news-sentiment.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import { findAcademyLesson } from '@ghostfolio/common/academy-curriculum';
import {
  AcademyExampleResponse,
  AcademyMarketPulseResponse,
  AcademyProgressResponse,
  AcademyQuizSubmissionResult
} from '@ghostfolio/common/interfaces';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, Prisma } from '@prisma/client';
import { format, subDays } from 'date-fns';
import YahooFinance from 'yahoo-finance2';

// Yahoo tickers for a quick market snapshot — not tied to any user holding,
// so fetched directly rather than through the SymbolProfile/watchlist system.
const MARKET_INDICES: { symbol: string; name: string }[] = [
  { name: 'S&P 500', symbol: '^GSPC' },
  { name: 'Nasdaq Composite', symbol: '^IXIC' },
  { name: 'Dow Jones', symbol: '^DJI' },
  { name: 'VIX (volatility)', symbol: '^VIX' }
];

@Injectable()
export class AcademyService {
  private readonly logger = new Logger(AcademyService.name);

  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
  });

  public constructor(
    private readonly indicatorsService: IndicatorsService,
    private readonly marketDataService: MarketDataService,
    private readonly newsSentimentService: NewsSentimentService,
    private readonly prismaService: PrismaService,
    private readonly symbolProfileService: SymbolProfileService
  ) {}

  public async getProgress(userId: string): Promise<AcademyProgressResponse> {
    const rows = await this.prismaService.academyProgress.findMany({
      where: { userId }
    });

    return {
      progress: rows.map((row) => ({
        completedAt: row.completedAt?.toISOString(),
        lessonId: row.lessonId,
        quizAnswers: (row.quizAnswers as Record<string, string>) ?? undefined,
        score: row.score ?? undefined,
        status: row.status as 'in-progress' | 'completed'
      }))
    };
  }

  /**
   * Grades the submitted answers against the curriculum's `correctAnswer`s and
   * persists the attempt. Calculation answers are compared as trimmed,
   * case-insensitive strings — the curriculum's `correctAnswer` is authored to
   * match the expected format (e.g. "76", "0.317", "Yes").
   */
  public async submitQuiz(
    userId: string,
    lessonId: string,
    answers: Record<string, string>
  ): Promise<AcademyQuizSubmissionResult> {
    const lesson = findAcademyLesson(lessonId);

    if (!lesson) {
      throw new NotFoundException(`Unknown lesson: ${lessonId}`);
    }

    const results = lesson.quiz.map((question) => {
      const submitted = (answers[question.id] ?? '').trim().toLowerCase();
      const correct = submitted === question.correctAnswer.trim().toLowerCase();

      return {
        correct,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        questionId: question.id
      };
    });

    const score =
      results.length === 0
        ? 0
        : Math.round(
            (results.filter(({ correct }) => correct).length / results.length) *
              100
          );

    await this.prismaService.academyProgress.upsert({
      create: {
        completedAt: new Date(),
        lessonId,
        quizAnswers: answers as Prisma.InputJsonValue,
        score,
        status: 'completed',
        user: { connect: { id: userId } }
      },
      update: {
        completedAt: new Date(),
        quizAnswers: answers as Prisma.InputJsonValue,
        score,
        status: 'completed'
      },
      where: { userId_lessonId: { lessonId, userId } }
    });

    return { answers, lessonId, results, score };
  }

  /**
   * Real closes + the live composite score/indicator snapshot for a symbol —
   * the same numbers `SignalsService` computes, reused directly (not
   * re-implemented) so a lesson's "practice" example is genuinely live data.
   */
  public async getExample(
    dataSource: DataSource,
    symbol: string
  ): Promise<AcademyExampleResponse> {
    const marketData = await this.marketDataService.getRange({
      assetProfileIdentifiers: [{ dataSource, symbol }],
      dateQuery: { gte: subDays(new Date(), 400) }
    });

    if (marketData.length === 0) {
      throw new NotFoundException(
        `No market data available for ${symbol} (${dataSource})`
      );
    }

    const closes = marketData.map(({ date, marketPrice }) => ({
      date: format(date, 'yyyy-MM-dd'),
      price: marketPrice
    }));
    const prices = marketData.map(({ marketPrice }) => marketPrice);

    const snapshot = this.indicatorsService.computeSnapshot(prices);
    const score = this.indicatorsService.computeScore(snapshot);

    const [profile] = await this.symbolProfileService.getSymbolProfiles([
      { dataSource, symbol }
    ]);

    return {
      closes,
      currency: profile?.currency,
      dataSource,
      name: profile?.name,
      score,
      snapshot: {
        bollingerPctB: snapshot.bollinger?.pctB ?? null,
        macdHistogram: snapshot.macd?.histogram ?? null,
        momentum12M: snapshot.momentum12M,
        momentum3M: snapshot.momentum3M,
        price: snapshot.price,
        rsi: snapshot.rsi,
        sma200: snapshot.sma200,
        sma50: snapshot.sma50,
        volatility: snapshot.volatility
      },
      symbol
    };
  }

  /**
   * A quick market snapshot (major US indices + VIX, live from Yahoo Finance)
   * plus real market-wide news headlines (if a news provider is configured) —
   * powers the Academy page's "Market Pulse" section. Never throws: a failed
   * index quote or an unconfigured news provider degrades gracefully rather
   * than breaking the whole response.
   */
  public async getMarketPulse(): Promise<AcademyMarketPulseResponse> {
    const indexResults = await Promise.allSettled(
      MARKET_INDICES.map(async ({ name, symbol }) => {
        const quote = await this.yahooFinance.quote(symbol);

        return {
          changePercent: quote.regularMarketChangePercent ?? null,
          name,
          price: quote.regularMarketPrice ?? null,
          symbol
        };
      })
    );

    const indices = indexResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      this.logger.warn(
        `Market index quote failed for ${MARKET_INDICES[index].symbol}: ${result.reason}`
      );

      return {
        changePercent: null,
        name: MARKET_INDICES[index].name,
        price: null,
        symbol: MARKET_INDICES[index].symbol
      };
    });

    const headlines = await this.newsSentimentService.getMarketHeadlines();

    return {
      generatedAt: new Date().toISOString(),
      headlines,
      indices
    };
  }
}
