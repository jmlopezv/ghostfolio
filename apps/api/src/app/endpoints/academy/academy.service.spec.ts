import { AcademyService } from './academy.service';

describe('AcademyService', () => {
  let upsertCalls: any[];
  let service: AcademyService;

  beforeEach(() => {
    upsertCalls = [];

    service = new AcademyService(
      {} as any,
      {} as any,
      {} as any,
      {
        academyProgress: {
          upsert: async (args: any) => {
            upsertCalls.push(args);
            return {};
          }
        }
      } as any,
      {} as any
    );
  });

  describe('submitQuiz', () => {
    it('scores a fully-correct submission as 100', async () => {
      const result = await service.submitQuiz('user-1', 'l1-sma-ema', {
        q1: '102.4',
        q2: 'Not a confirmed downtrend (price ≥ SMA200 fails that half of the AND) — a DIP buy could still fire if the other conditions hold',
        q3: "The trend-regime question (\"is this a genuine long-term trend or a recent wiggle\") specifically wants a slow, steady reference that is hard to fake with a short-term price spike — EMA's faster reaction is a liability here, not an asset"
      });

      expect(result.score).toBe(100);
      expect(result.results.every((r) => r.correct)).toBe(true);
      expect(upsertCalls).toHaveLength(1);
    });

    it('is case-insensitive and trims whitespace on answers', async () => {
      const result = await service.submitQuiz('user-1', 'l1-rsi', {
        q1: '  60  ',
        q2: 'oversold',
        q3: 'false'
      });

      expect(result.score).toBe(100);
    });

    it('scores a partially-correct submission proportionally', async () => {
      const result = await service.submitQuiz('user-1', 'l1-macd', {
        q1: 'MACD=4.5, histogram=1.5, strengthening',
        q2: 'A guaranteed reversal downward', // wrong
        q3: "The histogram's magnitude is not comparable across different stocks at different price levels, so its sign (is momentum turning constructive or not) is the more reliable, universally-comparable signal"
      });

      expect(result.score).toBe(67);
      expect(result.results.find((r) => r.questionId === 'q1').correct).toBe(
        true
      );
      expect(result.results.find((r) => r.questionId === 'q2').correct).toBe(
        false
      );
    });

    it('scores 0 when every answer is wrong', async () => {
      const result = await service.submitQuiz('user-1', 'l1-bollinger', {
        q1: 'wrong',
        q2: 'wrong',
        q3: 'wrong'
      });

      expect(result.score).toBe(0);
    });

    it('throws for an unknown lesson id', async () => {
      await expect(
        service.submitQuiz('user-1', 'not-a-real-lesson', {})
      ).rejects.toThrow();
    });

    it('grades a Level 5 (backtesting) lesson correctly', async () => {
      const result = await service.submitQuiz('user-1', 'l5-calmar-drawdown', {
        q1: '27.3%',
        q2: '21.0%',
        q3: "Strategy A — despite B's higher CAGR, its much deeper drawdown (35% vs 10%) makes it far more likely an investor abandons it at the worst possible moment"
      });

      expect(result.score).toBe(100);
    });

    it('grades a Level 8 (certification track) lesson correctly', async () => {
      const result = await service.submitQuiz(
        'user-1',
        'l8-mifid-appropriateness',
        {
          q1: 'MiFID II, Article 25(3) (the appropriateness assessment)',
          q2: 'wrong answer',
          q3: 'No — Avanza and Nordea implement functionally equivalent tests for the same categories, since all three follow the same EU-wide MiFID II requirement'
        }
      );

      expect(result.score).toBe(67);
    });
  });
});
