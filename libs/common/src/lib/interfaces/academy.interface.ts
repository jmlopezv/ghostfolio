export interface AcademyLessonProgress {
  lessonId: string;
  status: 'in-progress' | 'completed';
  quizAnswers?: Record<string, string>;
  score?: number;
  completedAt?: string;
}

export interface AcademyProgressResponse {
  progress: AcademyLessonProgress[];
}

export interface AcademyQuizSubmissionResult {
  lessonId: string;
  answers: Record<string, string>;
  score: number;
  results: {
    questionId: string;
    correct: boolean;
    correctAnswer: string;
    explanation: string;
  }[];
}

export interface AcademyExampleResponse {
  dataSource: string;
  symbol: string;
  name?: string;
  currency?: string;
  closes: { date: string; price: number }[];
  score: number | null;
  snapshot: {
    rsi: number | null;
    macdHistogram: number | null;
    bollingerPctB: number | null;
    sma50: number | null;
    sma200: number | null;
    momentum3M: number | null;
    momentum12M: number | null;
    volatility: number | null;
    price: number;
  };
}

export interface AcademyMarketIndexQuote {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
}

export interface AcademyMarketHeadline {
  title: string;
  summary?: string;
  source?: string;
  url?: string;
  publishedAt?: string;
}

export interface AcademyMarketPulseResponse {
  generatedAt: string;
  indices: AcademyMarketIndexQuote[];
  /** null when no news provider is configured. */
  headlines: AcademyMarketHeadline[] | null;
}
