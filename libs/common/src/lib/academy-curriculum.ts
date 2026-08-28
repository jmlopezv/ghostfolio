/**
 * Static curriculum for the Academy training area (Home → Academy). Levels map
 * 1:1 onto real, already-implemented parts of the trading-signals engine — see
 * `signal-metrics-glossary.ts` and `docs/TRADING_SIGNALS.md` for the canonical
 * formula source most lessons reuse. All 8 levels are fully authored. Level 8
 * (complex instruments) is grounded in real, cited regulatory sources (Nordnet
 * FAQ, MiFID II Article 25, ESMA complexity guidance, Nordnet Academy) — it is
 * educational preparation, not a copy of any broker's actual test.
 * `home-academy.component.ts` shows a "Coming soon" badge whenever a lesson's
 * `quiz.length === 0`, in case a future lesson is added ahead of its content.
 */

export interface AcademyQuizQuestion {
  id: string;
  type: 'multiple-choice' | 'calculation';
  /** Markdown; calculation questions embed the real formula being tested. */
  prompt: string;
  /** Multiple-choice only. */
  options?: string[];
  /** The option text (multiple-choice) or the accepted numeric/text answer (calculation). */
  correctAnswer: string;
  /** Shown only after the user submits an answer. */
  explanation: string;
}

export interface AcademyFurtherReading {
  title: string;
  url: string;
}

export interface AcademyLesson {
  /** Stable slug, e.g. 'l1-rsi'. Used as the progress-tracking key. */
  id: string;
  title: string;
  /** Markdown. */
  theory: string;
  /** Links to /home/metrics#metric-<id> when a canonical glossary entry exists. */
  glossaryRef?: string;
  /** Suggested symbol for the live practice example if the user's watchlist has no obvious pick. */
  practiceSymbolDefault?: string;
  /** External sources to go deeper — only added where a real, verified-working URL exists (never guessed). */
  furtherReading?: AcademyFurtherReading[];
  quiz: AcademyQuizQuestion[];
}

export interface AcademyLevel {
  /** Stable slug, e.g. 'level-1'. */
  id: string;
  title: string;
  description: string;
  lessons: AcademyLesson[];
}

export const ACADEMY_LEVELS: AcademyLevel[] = [
  {
    id: 'level-1',
    title: 'Level 1 — Foundations: price & volume indicators',
    description:
      'The building blocks every later level depends on: moving averages, RSI, MACD, Bollinger Bands, volatility, and momentum/trend regime — the exact indicators computed by `IndicatorsService` on every symbol, every cycle.',
    lessons: [
      {
        id: 'l1-sma-ema',
        title: 'Moving averages: SMA & EMA',
        glossaryRef: 'sma',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## Simple vs. exponential\n\n' +
          'A **simple moving average (SMA)** over *n* periods is just the arithmetic mean of the last *n* closing prices — every day in the window counts equally:\n\n' +
          '```\nSMAₙ = (1/n) · Σ closeᵢ  for the last n closes\n```\n\n' +
          'An **exponential moving average (EMA)** instead weights recent prices more heavily, so it reacts faster to new information. The engine uses EMA internally for MACD (Level 1, next lesson) but uses plain SMA for the trend regime, because a *slow, steady* reference is exactly what you want when the question is "is this a genuine long-term uptrend or just a recent wiggle."\n\n' +
          '## How this engine uses it\n\n' +
          'Two SMAs matter here: **SMA50** and **SMA200**. `price ≥ SMA200` is the engine\'s definition of a long-term uptrend. A **confirmed downtrend** — the condition that suppresses the default DIP buy path entirely — is stricter than just "below SMA200": it requires `SMA50 < SMA200 AND price < SMA200`. That extra clause matters: a stock briefly dipping under its 200-day average while still in a broadly rising trend (SMA50 still above SMA200) is treated very differently from one where the medium-term trend has actually rolled over too. This is the engine\'s way of avoiding "catching a falling knife" — buying a dip that is actually the start of a real decline.',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "A stock's 5-day SMA over closes `98, 100, 102, 101, 103` was 100.8. A new close of 106 arrives, and the oldest close (98) rolls out of the window. Using the rolling-window update (subtract the dropped close's contribution, add the new one) rather than re-summing everything, compute the new 5-day SMA.",
            correctAnswer: '102.4',
            explanation:
              'New SMA₅ = old SMA₅ − oldest/5 + newest/5 = 100.8 − 98/5 + 106/5 = 100.8 − 19.6 + 21.2 = **102.4**. (Check: 100+102+101+103+106 = 512, 512/5 = 102.4 — matches.) This rolling update is exactly why a moving average is cheap to maintain day over day: no need to re-sum the whole window each time.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "A stock has SMA50 < SMA200, but its price is currently sitting just ABOVE SMA200. Is this a confirmed downtrend per the engine's `isDowntrend()`, and could a DIP buy still fire?",
            options: [
              'Not a confirmed downtrend (price ≥ SMA200 fails that half of the AND) — a DIP buy could still fire if the other conditions hold',
              'Yes, a confirmed downtrend — SMA50 < SMA200 alone is sufficient',
              'Impossible to know without RSI',
              'A confirmed downtrend, and DIP buys are always blocked once SMA50 < SMA200 regardless of price'
            ],
            correctAnswer:
              'Not a confirmed downtrend (price ≥ SMA200 fails that half of the AND) — a DIP buy could still fire if the other conditions hold',
            explanation:
              '`isDowntrend()` requires BOTH `SMA50 < SMA200 AND price < SMA200`. A weakening medium-term trend (SMA50 below SMA200) with price still holding above SMA200 is a real, different case from a full confirmed downtrend — the engine deliberately does not suppress DIP on the medium-term signal alone.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Given that EMA reacts faster to new prices than SMA, why does the engine deliberately use SMA (not EMA) for the SMA50/SMA200 trend-regime check, despite using EMA for MACD?',
            options: [
              'The trend-regime question ("is this a genuine long-term trend or a recent wiggle") specifically wants a slow, steady reference that is hard to fake with a short-term price spike — EMA\'s faster reaction is a liability here, not an asset',
              'SMA is mathematically impossible to compute over 200 periods',
              'EMA cannot be computed for periods longer than 26',
              'There is no real reason — it is an arbitrary historical choice'
            ],
            correctAnswer:
              'The trend-regime question ("is this a genuine long-term trend or a recent wiggle") specifically wants a slow, steady reference that is hard to fake with a short-term price spike — EMA\'s faster reaction is a liability here, not an asset',
            explanation:
              'MACD wants sensitivity to recent momentum (EMA is right there); trend regime wants stability against short-term noise (SMA is right there) — same toolkit, deliberately different tool for a different job.'
          }
        ]
      },
      {
        id: 'l1-rsi',
        title: "RSI — Wilder's Relative Strength Index",
        glossaryRef: 'rsi',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## What it measures\n\n' +
          'RSI is a momentum oscillator bounded in [0, 100], built from the ratio of average gains to average losses over the last 14 periods (Wilder-smoothed, not a plain average):\n\n' +
          '```\nRS = avgGain₁₄ / avgLoss₁₄\nRSI = 100 − 100 / (1 + RS)\n```\n\n' +
          'Readings below 30 are conventionally "oversold," above 70 "overbought." RSI is 25% of the composite score\'s weight (the single largest component), because it is the most direct measure of "has this been sold off hard recently."\n\n' +
          '## The subtlety in the REVERSAL path\n\n' +
          'A common misconception is that a REVERSAL buy needs RSI *below* 30 today. It does not — it needs RSI **rising, but still under 70**. The oversold washout is expected to have already happened *during the decline*; the REVERSAL structure check is looking for RSI turning back up from wherever it bottomed, which confirms selling pressure is easing, not that the stock is still deeply oversold at the exact moment of the signal.',
        furtherReading: [
          {
            title: 'Relative strength index — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Relative_strength_index'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'Given avgGain₁₄ = 1.2 and avgLoss₁₄ = 0.8, compute RSI (round to the nearest whole number).',
            correctAnswer: '60',
            explanation:
              'RS = 1.2 / 0.8 = 1.5. RSI = 100 − 100/(1+1.5) = 100 − 40 = **60**.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt: 'An RSI reading of 22 is conventionally considered:',
            options: [
              'Oversold',
              'Overbought',
              'Neutral',
              'Invalid (RSI cannot go below 30)'
            ],
            correctAnswer: 'Oversold',
            explanation: 'Below 30 is the conventional oversold threshold.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "True or false: the REVERSAL buy path requires today's RSI to be below 30.",
            options: ['False', 'True'],
            correctAnswer: 'False',
            explanation:
              'It requires RSI rising from a prior oversold read but still below 70 — the washout happened earlier in the decline, not necessarily on the signal day itself.'
          }
        ]
      },
      {
        id: 'l1-macd',
        title: 'MACD — trend & momentum via EMA gap',
        glossaryRef: 'macd',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The three pieces\n\n' +
          '```\nMACD = EMA₁₂(close) − EMA₂₆(close)\nsignal = EMA₉(MACD)\nhistogram = MACD − signal\n```\n\n' +
          'MACD itself is the gap between a fast (12-period) and slow (26-period) EMA — positive means the short-term trend is running above the longer-term one. The **signal line** smooths MACD further, and the **histogram** (MACD minus signal) is what the engine actually scores: a positive, rising histogram means upward momentum is strengthening, not just present.\n\n' +
          '## How it is scored\n\n' +
          'The composite score treats the histogram as a binary-ish input: a non-negative histogram contributes strongly (its full weight at a high value), a negative one contributes only a small baseline — it is a quality signal ("is momentum turning constructive"), not a precise magnitude measure.',
        furtherReading: [
          {
            title: 'MACD — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/MACD'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "Yesterday: EMA₁₂ = 102, EMA₂₆ = 100 (MACD = 2). Today the fast EMA rises to 105 while the slow EMA barely moves to 100.5, and the signal line (EMA₉ of MACD) is 3. Compute today's MACD and histogram, and state whether momentum is strengthening or weakening versus yesterday.",
            correctAnswer: 'MACD=4.5, histogram=1.5, strengthening',
            explanation:
              "Today's MACD = 105 − 100.5 = 4.5 (up from yesterday's 2 — the gap widened). Histogram = 4.5 − 3 = **1.5**. Since MACD itself grew from 2 to 4.5, momentum is **strengthening**, even though the histogram's sign alone wouldn't tell you that trend — you have to compare MACD across days, not just look at one snapshot."
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'A positive, rising MACD histogram is generally interpreted as:',
            options: [
              'Strengthening upward momentum',
              'A guaranteed reversal downward',
              'Irrelevant to the composite score',
              'Only meaningful for options traders'
            ],
            correctAnswer: 'Strengthening upward momentum',
            explanation:
              'It means the gap between the fast and slow EMA is growing in the positive direction — momentum building, not just present.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why does the composite score treat the MACD histogram as roughly binary (a high score if non-negative, a low baseline if negative) rather than scaling smoothly with its exact magnitude?',
            options: [
              "The histogram's magnitude is not comparable across different stocks at different price levels, so its sign (is momentum turning constructive or not) is the more reliable, universally-comparable signal",
              'It is a bug that should eventually be fixed',
              'The histogram magnitude is always zero in practice',
              'MACD cannot produce negative values'
            ],
            correctAnswer:
              "The histogram's magnitude is not comparable across different stocks at different price levels, so its sign (is momentum turning constructive or not) is the more reliable, universally-comparable signal",
            explanation:
              'A $2 histogram value means something very different for a $10 stock than a $500 stock — treating it as a quality flag (constructive vs. not) sidesteps that scaling problem entirely, the same reasoning Bollinger %B uses by being self-normalizing.'
          }
        ]
      },
      {
        id: 'l1-bollinger',
        title: 'Bollinger Bands & %B',
        glossaryRef: 'bollinger-pctb',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The band\n\n' +
          '```\nmid = SMA₂₀(close);  σ = stdev₂₀(close)\nupper = mid + 2σ;  lower = mid − 2σ\n%B = (price − lower) / (upper − lower)\n```\n\n' +
          '%B tells you *where inside the band* the price currently sits, normalized to [0, 1]: 0 means sitting right on the lower band, 1 means right on the upper band. It is the single largest weight in the composite score (30%) precisely because it is a clean, self-normalizing "how stretched is this move" signal — no separate calibration needed across different stocks with wildly different price levels or volatilities.\n\n' +
          '## Reading it\n\n' +
          'A low %B (price pinned near the lower band) is what the engine treats as attractive for a dip-buy; a high %B (pinned near the upper band) is treated as stretched/expensive. The value is clamped to [0, 1] before scoring, since a band can be briefly pierced (%B < 0 or > 1) during a sharp move.',
        furtherReading: [
          {
            title: 'Bollinger Bands — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Bollinger_Bands'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'mid = 100, σ = 5, current price = 95. Compute the upper band, lower band, and %B.',
            correctAnswer: 'upper=110, lower=90, %B=0.25',
            explanation:
              'upper = 100 + 2×5 = 110. lower = 100 − 2×5 = 90. %B = (95−90)/(110−90) = 5/20 = **0.25**.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt: 'A %B near 0 means the price is:',
            options: [
              'Stretched down toward the lower band (potentially oversold)',
              'Stretched up toward the upper band',
              'Exactly at the 20-day average',
              'Undefined — %B cannot approach 0'
            ],
            correctAnswer:
              'Stretched down toward the lower band (potentially oversold)',
            explanation:
              '%B = 0 corresponds to price sitting exactly on the lower band.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Two stocks, one trading at $20 and one at $2,000, both have %B = 0.1. Why does %B let the composite score treat these two very differently-priced stocks with the same 30% weight, without any separate calibration?',
            options: [
              '%B is self-normalizing (always in roughly [0,1] regardless of the underlying price level), so the same weight/threshold logic applies uniformly across any stock',
              '%B secretly adjusts its weight based on stock price',
              "It doesn't — %B is actually unreliable across different price levels",
              'Because both stocks must have identical volatility for %B to be valid'
            ],
            correctAnswer:
              '%B is self-normalizing (always in roughly [0,1] regardless of the underlying price level), so the same weight/threshold logic applies uniformly across any stock',
            explanation:
              'This self-normalizing property is exactly why %B (not the raw band width, and not raw price) is the one that gets the largest single weight in the composite score — it is directly comparable across the entire watchlist, from penny stocks to triple-digit ones.'
          }
        ]
      },
      {
        id: 'l1-volatility',
        title: 'Volatility: close-to-close vs. Yang-Zhang/Garman-Klass',
        glossaryRef: 'volatility',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## Two ways to measure the same thing\n\n' +
          'The simplest estimator uses only closing prices — the standard deviation of daily log returns:\n\n' +
          '```\nclose-to-close: σ = stdev( ln(closeₜ / closeₜ₋₁) )\nannualised: σ_annual = σ · √252\n```\n\n' +
          'This is what the engine uses for the composite score, the buy-zone gate, strategy candidates, and backtesting — everywhere volatility is needed at portfolio scale across the whole watchlist. The `√252` annualization comes from there being roughly 252 trading days in a year: variance scales linearly with time, so *standard deviation* scales with the *square root* of time.\n\n' +
          '## Why a second estimator exists\n\n' +
          "Close-to-close volatility throws away the whole trading day's range — a stock that gapped down, traded wildly intraday, and closed flat looks exactly like a quiet day. The **Yang-Zhang** estimator (falling back to **Garman-Klass** when overnight data is unavailable) uses the full open/high/low/close range, which is a much less noisy estimate over short windows. The engine reserves this more expensive, more precise estimator for **owned active trades only** — where getting the stop/target/trail bands right actually matters for money already on the table — rather than computing it for the entire watchlist every cycle.",
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "Stock A: daily σ = 1% and price gapped down 8% overnight then closed flat for the day (no intraday range beyond the gap). Stock B: daily σ = 1% too, but traded in a wide 6%-of-price intraday range before closing flat, no overnight gap. Close-to-close volatility measures only the day-over-day closing price change. For which stock (A, B, both, or neither) would close-to-close volatility most understate the day's true price risk, and why?",
            correctAnswer: 'Both',
            explanation:
              'Close-to-close only sees the NET change from yesterday\'s close to today\'s close — if both stocks closed "flat" relative to their own prior close despite very different amounts of real intraday chaos (a gap for A, a wide range for B), close-to-close volatility would understate the true risk for **both**, just via different mechanisms. This is exactly the blind spot Yang-Zhang/Garman-Klass (which use the full OHLC range) are built to catch.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why does the engine use Yang-Zhang/Garman-Klass only for owned active trades, not the whole watchlist?',
            options: [
              'It is a more precise but more expensive OHLC-based estimator, reserved for where accuracy matters most (real money already at risk)',
              'It only works for cryptocurrencies',
              'It is actually less accurate, so it is used as a lightweight fallback',
              "It requires a paid data subscription the engine doesn't have"
            ],
            correctAnswer:
              'It is a more precise but more expensive OHLC-based estimator, reserved for where accuracy matters most (real money already at risk)',
            explanation:
              'Close-to-close is cheap and good enough for ranking hundreds of watchlist candidates; the OHLC estimator is worth the extra cost only for the stop/target/trail bands on positions actually held.'
          },
          {
            id: 'q3',
            type: 'calculation',
            prompt:
              'A fund has been tracked for only 40 trading days so far (well short of the 200 needed for SMA200). Its close-to-close daily σ over those 40 days is 0.8%. Compute its annualized volatility, and state whether this number is likely to be a reliable long-run estimate yet.',
            correctAnswer: '≈12.7%, not yet reliable (small sample)',
            explanation:
              '0.008 × √252 ≈ 0.008 × 15.87 ≈ **0.127** (12.7%). The arithmetic is valid, but with only 40 observations feeding the standard deviation, this estimate can swing a lot as more days accumulate — the same "needs real history to be trustworthy" theme as SMA200/momentum12M (Level 1, earlier lesson) applies to volatility too, just with a shorter minimum bar.'
          }
        ]
      },
      {
        id: 'l1-momentum-trend',
        title: 'Momentum (3M/12M) & trend regime',
        glossaryRef: 'momentum',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## Trailing return, not an oscillator\n\n' +
          '```\nmomentumₙ = price_today / price_{t−n} − 1\n```\n\n' +
          'The engine looks at two windows: **3-month** (≈63 trading days) and **12-month** (≈252 trading days). Unlike RSI or %B, momentum is not bounded — it is simply "how much has this actually returned" over the window.\n\n' +
          '## Why 12-month momentum matters for quality, not just direction\n\n' +
          'Positive 12-month momentum contributes to the composite score as a "quality filter": a stock that has genuinely trended up over the last year is treated differently from one that has been in a real, sustained decline, even if both happen to look similarly oversold on RSI/%B *today*. Deeply negative 12-month momentum is one of the signals that keeps a beaten-down name out of the default DIP path — that combination (bad long-term trend + short-term oversold) is exactly the "falling knife" profile the REVERSAL path exists to handle separately, with its own stricter confirmation requirements (Level 2).',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "A stock's price 252 trading days ago was 100. Today it is 80 (a real 12-month loss), but it fell as low as 60 three months ago and has since rallied hard. Compute the 12-month momentum. Given this number, would you expect the engine's DIP path or REVERSAL path to be the one potentially handling a buy here, and why?",
            correctAnswer: '-20%, REVERSAL path',
            explanation:
              'Momentum12M = 80/100 − 1 = −0.20 = **−20%**. A negative 12-month momentum like this is one of the signals that routes a name AWAY from the uptrend-only DIP path and toward the REVERSAL path\'s stricter bottom-confirmation requirements (Level 2) — the "real decline, now potentially recovering" profile is exactly what REVERSAL exists to evaluate carefully, not what DIP is built for.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'In the composite score, positive 12-month momentum acts as a:',
            options: [
              'Tailwind / quality filter',
              'Hard veto that blocks all other signals',
              'It is not used anywhere in the engine',
              'A measure of daily volatility'
            ],
            correctAnswer: 'Tailwind / quality filter',
            explanation:
              'It rewards names with a genuinely positive long-term trend, and its absence (deeply negative momentum) is part of what routes a name toward the stricter REVERSAL path instead of the default DIP path.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Two stocks both have RSI = 28 (oversold) today. Stock X has +15% 12-month momentum; Stock Y has −40% 12-month momentum. Does the composite score treat these two identically, given they share the same RSI?',
            options: [
              'No — momentum12M is a separate 15%-weighted term, so X (positive momentum) gets a meaningfully higher composite score than Y for the same RSI reading',
              'Yes — RSI alone determines the composite score',
              'No — the engine would simply refuse to score Y at all',
              'Yes, because momentum only matters for the REVERSAL path, never the composite score'
            ],
            correctAnswer:
              'No — momentum12M is a separate 15%-weighted term, so X (positive momentum) gets a meaningfully higher composite score than Y for the same RSI reading',
            explanation:
              'This is exactly the point of blending multiple independent indicators (Level 2, next lesson) — two names can share one oversold reading yet score very differently once their broader trend quality is accounted for.'
          }
        ]
      }
    ]
  },
  {
    id: 'level-2',
    title: 'Level 2 — Scoring & decision rules',
    description:
      'How the Level 1 indicators combine into one composite score, the gates a candidate must clear before it can be ranked, and the exact rules that fire a BUY, hold a position, or trigger a SELL.',
    lessons: [
      {
        id: 'l2-composite-score',
        title: 'The composite score: a weighted blend, not a black box',
        glossaryRef: 'composite-score',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The formula\n\n' +
          '```\nscore = 100 · Σ wᵢ·nᵢ,  where Σ wᵢ = 1\n```\n\n' +
          'With weights: RSI 25%, Bollinger %B 30%, MACD histogram 15%, SMA200 trend 15%, momentum 12M 15%. Each raw indicator is first normalized into [0, 1] (or a fixed alternative value when it is a binary-ish quality check like MACD/trend/momentum), then blended.\n\n' +
          '## A gate, never a multiplier\n\n' +
          'This is the single most important design decision to internalize: the composite score **ranks candidates and gates eligibility** — a DIP buy needs score ≥ 55, the strategy builder needs score ≥ 45 — but it never multiplies into the trade\'s expected value or position size. That job belongs to expected value (Level 3), which is calculated completely separately from the score. Conflating "how attractive does this look technically" with "how much should I risk" is exactly the kind of error this separation is designed to avoid.\n\n' +
          "## Missing inputs don't break it\n\n" +
          "If one input isn't available yet (e.g. a newly-tracked fund with under 200 days of history has no valid SMA200), that term is simply dropped and the remaining weights are re-normalized to still sum to 1 — the score degrades gracefully instead of failing outright.",
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'RSI = 30 (normalized term = 100−RSI = 70, weight 0.25); Bollinger %B = 0.2 (term = (1−0.2)×100 = 80, weight 0.30); MACD histogram positive (term = 100, weight 0.15); price ≥ SMA200 (term = 100, weight 0.15); momentum 12M negative (term = 30, weight 0.15). Compute the composite score.',
            correctAnswer: '76',
            explanation:
              '0.25×70 + 0.30×80 + 0.15×100 + 0.15×100 + 0.15×30 = 17.5 + 24 + 15 + 15 + 4.5 = **76**.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt: 'The composite score is used to:',
            options: [
              'Rank and gate candidates — never to size the trade or scale expected value',
              'Directly determine position size in dollars',
              'Multiply into the expected-value formula',
              'Replace the DIP/REVERSAL rules entirely'
            ],
            correctAnswer:
              'Rank and gate candidates — never to size the trade or scale expected value',
            explanation:
              'Position sizing and ranking-by-edge both come from expected value (Level 3), computed independently — the score is strictly a quality gate/ranker.'
          }
        ]
      },
      {
        id: 'l2-eligibility-gates',
        title: 'Eligibility gates: what a candidate must clear before ranking',
        glossaryRef: 'eligibility-gates',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The four-part AND\n\n' +
          '```\npass = score ≥ 45\n  AND (not downtrend OR confirmed REVERSAL)\n  AND not recently-exited (≤ 14 days)\n  AND annualVol ≤ 0.90\n```\n\n' +
          "A candidate must clear **all four** before it is even eligible to be ranked by expected value in the strategy builder. Note the score floor here (45) is *lower* than the DIP buy's own floor (55, Level 2 lesson 3) — the strategy builder is casting a slightly wider net for candidates worth considering, while the DIP trigger itself is stricter about what actually fires a notification.\n\n" +
          '## Why each gate exists\n\n' +
          '- **Downtrend exclusion** (with a REVERSAL escape hatch): the same "don\'t catch a falling knife" logic from Level 1, but here it is a hard eligibility filter, not just a scoring input.\n' +
          "- **Recently-exited cooldown**: if a position was just stopped out or sold, the engine won't immediately suggest buying it right back — avoiding a whipsaw where a single volatile stretch causes repeated in-and-out trades (and repeated fees).\n" +
          '- **Volatility cap**: excludes extremely wild or illiquid names where the band-based bands would be so wide as to be nearly meaningless, and where liquidity/execution risk is elevated.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'A stock has score = 50, is in a confirmed downtrend with no REVERSAL structure confirmed, annualVol = 0.5, and was not recently exited. Is it eligible for ranking?',
            options: [
              'No — it fails the downtrend gate',
              'Yes — score and volatility both pass',
              'Yes, but only for the Safe 80/20 strategy',
              'Cannot tell without RSI'
            ],
            correctAnswer: 'No — it fails the downtrend gate',
            explanation:
              'All four gates must pass. Being in a confirmed downtrend without a confirmed REVERSAL fails that gate regardless of the other three.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'A candidate has score = 60 (passes), is NOT in a downtrend (passes), was stopped out 9 days ago (the cooldown is 14 days), and has daily volatility σ = 3.5%. Compute its annualized volatility and determine whether it is eligible for ranking today, and if not, what specifically blocks it.',
            correctAnswer:
              '≈0.556, not eligible, fails recently-exited cooldown',
            explanation:
              '0.035 × √252 ≈ 0.035 × 15.87 ≈ **0.556** — comfortably under the 0.90 cap. But it was stopped out only 9 days ago, inside the 14-day recently-exited window, so despite passing score/downtrend/volatility, it still fails eligibility overall on that one gate alone — all four must pass simultaneously.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "Why is the strategy builder's score floor (45) deliberately set LOWER than the DIP buy trigger's own floor (55)?",
            options: [
              'The strategy builder is casting a slightly wider net over candidates worth considering for ranking, while the DIP trigger itself is stricter about what actually fires a live notification — different jobs, different bars',
              'It is an inconsistency/bug that should be fixed to use the same number',
              'Because the strategy builder never actually checks score at all',
              'Because 45 and 55 produce mathematically identical results'
            ],
            correctAnswer:
              'The strategy builder is casting a slightly wider net over candidates worth considering for ranking, while the DIP trigger itself is stricter about what actually fires a live notification — different jobs, different bars',
            explanation:
              'Being "eligible to be ranked and considered" is a lower bar than "good enough to actually notify a BUY right now" — the two floors serve genuinely different purposes in the pipeline.'
          }
        ]
      },
      {
        id: 'l2-buy-dip',
        title: 'BUY — DIP: the default, uptrend-only buy',
        glossaryRef: 'buy-dip',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The five-factor AND\n\n' +
          '```\nprice ≤ buyLevel AND not downtrend AND score ≥ 55\nAND up-day (price > prev close) AND newsScore ≥ −0.2\n```\n\n' +
          'This is the engine\'s default, "safe" buy path — every clause narrows toward the same idea: a temporary pullback *within* a healthy uptrend, not a stock actually breaking down. `buyLevel` itself is one of the adaptive, volatility-scaled levels from Level 3 (`recentHigh · (1 − max(dropPct, band))`) — so "how big a dip counts" automatically widens for more volatile names rather than using one fixed percentage for every stock.\n\n' +
          '## Why "up-day"?\n\n' +
          'Requiring `price > prev close` (an up-day) means the engine buys the **bounce**, not the knife — it waits for the first sign that selling has paused for the day, rather than buying into a name that is still actively falling in real time.\n\n' +
          '## Uptrend-only, by construction\n\n' +
          'This path is completely uptrend-gated: if `isDowntrend()` is true, DIP simply cannot fire, no matter how attractive the score looks otherwise. That is exactly why a separate REVERSAL path (next lesson) exists for the beaten-down case — DIP was never meant to handle it.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Can the DIP buy path fire while a stock is in a confirmed downtrend?',
            options: [
              'No, never — it is uptrend-only by construction',
              'Yes, if the score is high enough',
              'Yes, if news sentiment is very positive',
              'Only for ETFs'
            ],
            correctAnswer: 'No, never — it is uptrend-only by construction',
            explanation:
              'The `not downtrend` clause is a hard requirement, not one factor among several that can compensate for the others.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              "Price = 95, buyLevel = 96, stock is in an uptrend, score = 60, today's price (95) is above yesterday's close (93), newsScore = 0. Does the DIP buy fire?",
            correctAnswer: 'Yes',
            explanation:
              'price(95) ≤ buyLevel(96) ✓, not downtrend ✓, score(60) ≥ 55 ✓, up-day (95>93) ✓, newsScore(0) ≥ −0.2 ✓ — all five clauses pass, so DIP fires.'
          }
        ]
      },
      {
        id: 'l2-buy-reversal',
        title: 'BUY — REVERSAL: buying weakness only on a confirmed bottom',
        glossaryRef: 'buy-reversal',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The five-factor confirmation\n\n' +
          '```\nprice < SMA200 AND rsi rising AND rsi < 70\nAND higher-low AND price ≥ SMA20\nAND volume ≥ 1.3 × 20-day avg\n```\n\n' +
          'This is the flagged, higher-risk counterpart to DIP: it is the *only* path that will buy a name already below its 200-day average — but only once several independent signs of an actual bottom line up together, not just "it looks cheap."\n\n' +
          '## What each clause confirms\n\n' +
          "- **RSI rising, still < 70**: selling pressure is easing (Level 1's subtlety — this doesn't require RSI to still be oversold today).\n" +
          '- **Higher-low**: the recent low is above the prior low — the decline itself is losing downward force, structurally.\n' +
          '- **Reclaimed SMA20**: price has fought back above its short-term average — a real, not just intraday, sign of strength.\n' +
          '- **Volume ≥ 1.3× 20-day average**: capitulation-style volume confirms real buying interest is stepping in, not a thin, unconvincing bounce.\n\n' +
          'Even after all five confirm, a REVERSAL candidate is tagged `signalType: REVERSAL, bearMarket: true` and still has to clear the same EV ranking and volatility cap as everything else (Level 3/4) — a confirmed reversal earns the *chance* to be ranked, not an automatic buy.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'What does the REVERSAL path require that the DIP path does not?',
            options: [
              'A confirmed bottom structure (higher-low + reclaimed SMA20 + capitulation volume) while already below SMA200',
              'A higher composite score than DIP requires',
              'The stock must be a fund, not a stock',
              'Nothing — they use identical rules'
            ],
            correctAnswer:
              'A confirmed bottom structure (higher-low + reclaimed SMA20 + capitulation volume) while already below SMA200',
            explanation:
              'DIP only operates inside an uptrend; REVERSAL is the only path that operates on a name already below SMA200, and it demands much stronger structural confirmation in exchange.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              "A stock is below SMA200, RSI was 22 two days ago and is 35 today (rising, still under 70), the recent low is higher than the prior low, price has reclaimed SMA20, but today's volume is 1.1× the 20-day average (needs ≥ 1.3×). Does REVERSAL fire, and specifically why or why not?",
            correctAnswer: 'No — fails the volume-confirmation clause only',
            explanation:
              'Four of five clauses pass (below SMA200 ✓, RSI rising and <70 ✓, higher-low ✓, reclaimed SMA20 ✓), but 1.1 < 1.3 fails the capitulation-volume requirement — and since all five must hold simultaneously, REVERSAL does not fire even though the structural bottom pattern otherwise looks convincing.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why does REVERSAL specifically require capitulation-level VOLUME on top of the price-structure clues (higher-low, reclaimed SMA20), rather than trusting the price action alone?',
            options: [
              'Price structure alone can be a thin, low-conviction bounce with few real buyers behind it — a volume surge is independent evidence that real buying interest, not just noise, is driving the move',
              'Volume has no real purpose, it is just an arbitrary extra hurdle',
              'Because RSI is unreliable on its own for any stock',
              'Because the DIP path also requires the same volume check'
            ],
            correctAnswer:
              'Price structure alone can be a thin, low-conviction bounce with few real buyers behind it — a volume surge is independent evidence that real buying interest, not just noise, is driving the move',
            explanation:
              'This is the same "don\'t trust one signal alone" philosophy behind every multi-factor gate in this engine — each additional independent confirmation reduces the odds that what looks like a bottom is actually a fakeout.'
          }
        ]
      },
      {
        id: 'l2-exit-machine',
        title: 'The exit state machine: how owned trades are actually sold',
        glossaryRef: 'exit-machine',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## Two modes\n\n' +
          '```\nWATCHING: price ≤ stop → SELL; price ≥ target → enter TRAILING\nTRAILING: price ≤ peak·(1−band) → SELL\nhold-with-stop: price ≤ peak·(1 − 0.22) → SELL\n```\n\n' +
          "For a position tagged as an **active trade**, the engine runs one of two exit styles (configurable): the classic two-phase **WATCHING → TRAILING** machine, or a simpler single **hold-with-stop** (a wide 22% trailing stop from the peak, no separate take-profit phase — currently the default, `SIGNAL_EXIT_MODE = 'hold-with-stop'`).\n\n" +
          '## Why two phases in the classic mode\n\n' +
          "WATCHING is the entry phase: a hard stop-loss protects the downside, and hitting the take-profit target doesn't immediately sell — it promotes the position into TRAILING, where the exit now follows the price *up* (a trailing stop off the highest price seen since target was hit), so a continuing winner isn't cut short the moment it first reaches its original target.\n\n" +
          '## Core holdings are never touched\n\n' +
          'This entire machine only applies to positions explicitly tagged as active trades. Ordinary core holdings are never sold by the engine — the exit machine exists specifically for the subset of the portfolio being actively, tactically managed.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'In hold-with-stop mode, what is the sole trigger for a SELL?',
            options: [
              'Price falls to 78% of the peak price since entry (peak × (1 − 0.22))',
              'Price falls below the original entry price',
              'RSI crosses above 70',
              'A fixed 30-day holding period expires'
            ],
            correctAnswer:
              'Price falls to 78% of the peak price since entry (peak × (1 − 0.22))',
            explanation:
              'hold-with-stop uses one wide trailing stop (22% off the peak) — no separate take-profit phase.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'Classic WATCHING/TRAILING mode. Entry = 100, stop = 90, take-profit target = 120. Price path over several days: 105 → 118 → 122 → 119 → 108. Walk through the state machine: at which point (if any) does the position transition from WATCHING to TRAILING, and does it ever get SOLD along this path?',
            correctAnswer:
              'Transitions to TRAILING at 122; not sold (need the actual band to know the trailing stop level)',
            explanation:
              "Price stays in WATCHING (never touching stop=90) until it crosses the target=120 at the 122 print — that promotes it to TRAILING. Once trailing, the exit is peak×(1−band) off the highest price seen SINCE entering TRAILING (peak=122 here), not off the original entry — so whether 119 or 108 triggers a SELL depends on the specific band width, which isn't given here. The key conceptual point: once in TRAILING, the ORIGINAL stop (90) and ORIGINAL target (120) are no longer what matters — the trailing peak is the new reference."
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why does hitting the take-profit target promote a position to TRAILING instead of immediately selling it?',
            options: [
              "So a continuing winner isn't cut short the moment it first reaches its original target — the exit now follows the price up, giving room for further gains while still protecting against a real reversal",
              'Because take-profit targets are never actually reliable',
              'It is purely a technical limitation — the engine cannot execute a sell at the exact target price',
              'Because TRAILING mode uses a completely different, unrelated set of indicators'
            ],
            correctAnswer:
              "So a continuing winner isn't cut short the moment it first reaches its original target — the exit now follows the price up, giving room for further gains while still protecting against a real reversal",
            explanation:
              "Selling the instant a target is hit would cap the upside on exactly the trades that are working best — TRAILING is the engine's way of staying in a winner while still having a real, moving safety net underneath it."
          }
        ]
      },
      {
        id: 'l2-news-gate',
        title: 'The news risk gate: a filter, never a buy signal',
        glossaryRef: 'news-gate',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## What it does — and, critically, does not do\n\n' +
          '```\nBUY suppressed when newsScore < −0.2\n(skipped entirely when no news data is available)\n```\n\n' +
          "Research consistently shows news sentiment predicts **volatility** far more reliably than it predicts **direction** — good news doesn't reliably make a stock go up, but bad news reliably makes things more chaotic. The engine takes that finding seriously: sentiment is used **exclusively as a risk filter and size-shrink**, never to manufacture a directional buy signal on its own. A very positive news score does not, by itself, create a BUY.\n\n" +
          '## Age-decay and graceful absence\n\n' +
          'The sentiment score is age-decayed over a 3-day half-life, so stale news fades out of the calculation. When no news data is available at all (no API key configured, or the symbol has no coverage), the gate is simply skipped — a missing feed can never block a signal, avoiding a fragile dependency on an optional data source.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Can strongly positive news sentiment, by itself, create a BUY signal that would not otherwise fire?',
            options: [
              'No — it only suppresses or shrinks, never invents a buy',
              'Yes, if the score exceeds +0.5',
              'Yes, but only for REVERSAL buys',
              'Only during earnings season'
            ],
            correctAnswer:
              'No — it only suppresses or shrinks, never invents a buy',
            explanation:
              'The gate is one-directional by design: it can block or shrink a buy, never manufacture one.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              "A news article scoring −0.6 sentiment was published 6 days ago (half-life = 3 days, so 2 half-lives have elapsed). Using `weight = exp(−ln2/3 × ageDays)`, compute today's decayed weight for that article (2 decimal places), and explain what this means for whether it could still suppress a DIP buy today versus when it was fresh.",
            correctAnswer: '0.25',
            explanation:
              'weight = exp(−(ln2/3)×6) = exp(−1.386) ≈ **0.25** — down to a quarter of its original influence (matching "2 half-lives" intuition: 1.0 → 0.5 → 0.25). Combined with any OTHER, fresher articles in the weighted average, this one old negative article alone is now unlikely to still drag the blended score below the −0.2 suppression floor the way it would have on day 0 — decay is exactly what lets stale bad news stop blocking buys once its relevance has genuinely faded.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'A symbol has no news coverage at all today (no API key configured, or simply nothing published). What happens to its DIP-buy eligibility?',
            options: [
              'The news gate is skipped entirely for this symbol — a missing feed never blocks a signal',
              'The BUY is automatically suppressed, since missing data is treated as a worst-case negative score',
              'The engine refuses to evaluate the symbol at all until news data exists',
              'It defaults to the most negative possible score as a safety margin'
            ],
            correctAnswer:
              'The news gate is skipped entirely for this symbol — a missing feed never blocks a signal',
            explanation:
              'This is a deliberate design choice: an optional, sometimes-unavailable data source should never become a single point of failure that silently blocks otherwise-valid signals.'
          }
        ]
      }
    ]
  },
  {
    id: 'level-3',
    title: 'Level 3 — Forecasting & expected value',
    description:
      'How the engine turns volatility into a probability of reaching a target, and how expected value — not the composite score — actually ranks trade candidates.',
    lessons: [
      {
        id: 'l3-ewma-drift',
        title: 'EWMA volatility & drift',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## Why not just use plain historical volatility?\n\n' +
          "Level 1's close-to-close volatility weighs every day in the window equally. For forecasting a few weeks ahead, that is not ideal: a volatility spike from three months ago shouldn't carry the same weight as what happened last week. The forecast layer instead uses an **EWMA (exponentially weighted moving average)** of squared returns, the same technique behind RiskMetrics:\n\n" +
          '```\nσ²_t = λ·σ²_{t−1} + (1−λ)·r²_{t−1},  λ = 0.94\n```\n\n' +
          "Each new day's squared return updates yesterday's variance estimate, weighted 94%/6% — recent moves matter more, but nothing is thrown away outright. This gives a smoother, more responsive volatility estimate than a flat historical standard deviation for the specific job of forecasting the near future.\n\n" +
          '## Drift — and why it is handled so cautiously\n\n' +
          'Drift is the expected daily return baked into the forecast. The engine computes it as the mean daily log return, but **clamps it to ±0.2%/day** — a deliberate guardrail against extrapolating a short recent run (good or bad) indefinitely into the future. A stock that happened to average +1%/day over the last month almost certainly will not keep doing that for two more months; clamping prevents the forecast from being seduced by a small, noisy sample.',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "Yesterday's EWMA variance estimate σ²_{t−1} = 0.0004. Today's squared return r² = 0.0009. Using λ = 0.94, compute today's updated variance σ²_t (4 decimal places).",
            correctAnswer: '0.00043',
            explanation:
              '0.94 × 0.0004 + 0.06 × 0.0009 = 0.000376 + 0.000054 = **0.00043**.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why does the engine clamp daily drift to ±0.2%/day instead of using the raw historical average?',
            options: [
              'To avoid extrapolating a short, noisy recent run indefinitely into the future',
              'Because Yahoo Finance does not provide enough historical data',
              'Because drift is not actually used anywhere in the engine',
              'To make the math simpler to compute'
            ],
            correctAnswer:
              'To avoid extrapolating a short, noisy recent run indefinitely into the future',
            explanation:
              'A short sample can have an average return that is not representative of the future — clamping is a deliberate guardrail against over-trusting it.'
          }
        ]
      },
      {
        id: 'l3-expected-move',
        title: 'Expected-move band & Monte Carlo hit-probability',
        theory:
          '## The expected-move band\n\n' +
          '```\nexpected = price · e^(drift·h)\nupper/lower = expected · e^(±k·σ·√h)\n```\n\n' +
          "This is a geometric-Brownian-motion price band: given today's price, the EWMA volatility, and the (clamped) drift, where might the price plausibly be in *h* days? It is the same √time scaling from Level 1's horizon band, now applied to build an actual price range rather than just a single threshold distance.\n\n" +
          '## Monte Carlo hit-probability — a different question than "reach probability"\n\n' +
          'The engine also runs a **2,000-path Monte Carlo simulation** (simulated daily GBM price paths) to estimate the probability that price *touches* a target level at any point during the horizon — not just where it ends up. This is deliberately a different, complementary question from the analytic "reach probability" (Level 3, next lesson), which asks only about the **terminal** (end-of-horizon) price. A touch probability is always ≥ the terminal probability, since there are many more days on which price could briefly spike through a level than there are chances for it to still be there exactly at the end.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'The Monte Carlo hit-probability asks a different question than the analytic reach probability. What is that difference?',
            options: [
              'Hit-probability checks if price ever touches the target during the horizon; reach probability only checks the terminal (end-of-horizon) price',
              'They are exactly the same calculation, just computed with different code',
              'Hit-probability only applies to funds, reach probability only to stocks',
              'Reach probability is always higher than hit-probability'
            ],
            correctAnswer:
              'Hit-probability checks if price ever touches the target during the horizon; reach probability only checks the terminal (end-of-horizon) price',
            explanation:
              'Touching at any point during the horizon is an easier bar to clear than "still there exactly at the end," so hit-probability ≥ reach probability, not the other way around.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt: 'What does the expected-move band actually represent?',
            options: [
              "A plausible price range at the horizon, built from today's price, drift, and volatility scaled by √time",
              'A guarantee that price will end up within that range',
              'The exact stop-loss and take-profit levels used by the exit machine',
              'The historical trading range over the last year'
            ],
            correctAnswer:
              "A plausible price range at the horizon, built from today's price, drift, and volatility scaled by √time",
            explanation:
              'It is a statistical band (geometric Brownian motion), not a guarantee — wider for more volatile names and longer horizons.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Two stocks have identical current price and identical drift, but Stock A has twice the daily volatility of Stock B. How do their expected-move bands at the same horizon compare?',
            options: [
              'Stock A\'s band is wider — the ± term scales with σ, so higher volatility means a wider plausible range, even though the central "expected" price is the same for both',
              'They are identical, since expected-move only depends on drift, not volatility',
              "Stock B's band is wider, since lower volatility means more uncertainty about the exact path",
              'Volatility has no effect on the expected-move band, only on Monte Carlo hit-probability'
            ],
            correctAnswer:
              'Stock A\'s band is wider — the ± term scales with σ, so higher volatility means a wider plausible range, even though the central "expected" price is the same for both',
            explanation:
              "The center of the band (`expected = price · e^(drift·h)`) doesn't depend on σ at all — only the ± spread around it does, via `k·σ·√h`. Same expected value, different confidence width."
          }
        ]
      },
      {
        id: 'l3-reach-probability',
        title: 'Reach probability: honest, drift-free odds',
        glossaryRef: 'reach-probability',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The formula\n\n' +
          '```\nP = Φ( ( ln(target/price) − (−½σ²)·t ) / (σ·√t) )\nwith daily drift μ = 0;  Φ = standard-normal CDF (via erf)\n```\n\n' +
          'This is the analytic, terminal (end-of-horizon) probability that price ends at or above the upside target — the same lognormal math behind option pricing, computed via the error function rather than simulation, so it is fast enough to run on the entire watchlist every cycle.\n\n' +
          '## The single most important design choice in this whole layer\n\n' +
          'Notice the drift term: **μ = 0**, always — never the stock\'s own recent trend. This is a deliberate refusal to assume any stock has a "known" edge going forward. If the engine instead plugged in each stock\'s own historical drift, every single name would look artificially promising (recent winners would look like sure things, which is exactly the kind of overconfidence that wrecks trading systems). With drift forced to zero, the *only* thing separating one candidate from another is volatility and how far away the target is — an honest, comparable number across the whole universe. The consequence is that P(+13.4% in ~2 months) is usually small for any given name, and that is the correct, intended behavior: the engine would rather say "no compelling case" than manufacture a probability that flatters the trade.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              "Why does reach probability always use drift μ = 0, never the stock's own recent trend?",
            options: [
              'To avoid every stock looking artificially promising just because it happened to trend up recently — an honest, comparable baseline across the universe',
              'Because it is mathematically impossible to compute probability with a non-zero drift',
              'Because Yahoo Finance does not provide drift data',
              'It only applies to funds, not individual stocks'
            ],
            correctAnswer:
              'To avoid every stock looking artificially promising just because it happened to trend up recently — an honest, comparable baseline across the universe',
            explanation:
              'Assuming your own historical drift continues is exactly the kind of overconfidence that produces inflated, non-comparable probabilities.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'A stock needs to gain 13.4% in the next 2 months to hit its target, and the drift-0 reach probability comes back at 8%. What should you conclude?',
            options: [
              'This is expected/normal behavior — the honest, no-edge-assumed probability of a meaningful move over a short horizon is usually small',
              'The engine is broken — probability should be at least 50% for any stock',
              'This stock should be immediately sold',
              "The target must be recalculated using the stock's own historical return"
            ],
            correctAnswer:
              'This is expected/normal behavior — the honest, no-edge-assumed probability of a meaningful move over a short horizon is usually small',
            explanation:
              'By design, this is not a bug — a drift-free probability of a real move in a short window is supposed to look modest most of the time, which is exactly what keeps expected value honest.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Stock A needs a 5% gain to hit its target; Stock B needs a 25% gain to hit its. Both have identical volatility and horizon. Which one has the higher drift-0 reach probability, and why?',
            options: [
              "Stock A — a smaller required move is easier to clear at the same volatility, regardless of either stock's recent trend",
              'Stock B — bigger targets always have proportionally bigger probabilities',
              'They are identical, since drift is 0 for both',
              "Impossible to say without knowing each stock's actual historical returns"
            ],
            correctAnswer:
              "Stock A — a smaller required move is easier to clear at the same volatility, regardless of either stock's recent trend",
            explanation:
              'With drift forced to 0, reach probability is purely a function of how far away the target is relative to volatility and time (`ln(target/price)` in the numerator) — a nearer target is inherently more likely to be reached than a farther one, holding everything else constant.'
          }
        ]
      },
      {
        id: 'l3-expected-value',
        title: 'Expected value: what actually ranks a trade',
        glossaryRef: 'expected-value',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The formula\n\n' +
          '```\nEV = p · targetGainPct − (1 − p) · stopLossPct\nwhere p = reach probability\n```\n\n' +
          "Expected value is the probability-weighted payoff of a trade: the odds of winning times what you'd gain, minus the odds of losing times what you'd lose. This — **not the composite score** — is what actually ranks candidates against each other in the strategy builder, and it is the number shown in the EV column across the app.\n\n" +
          '## Why EV is often negative — and why that is correct\n\n' +
          'Because reach probability is deliberately conservative (Level 3, previous lesson) and stop-losses are real, a great many candidates will show a **negative** expected value even when their composite score looks attractive. This is not a bug: it is the system correctly saying "this looks technically interesting, but the honest odds times payoff don\'t clear the bar." The composite score and expected value are answering genuinely different questions — "does this look attractive" vs. "is the math actually in your favor" — and keeping them as two separate numbers (rather than one blended score) is what lets the engine reject a good-looking-but-bad-math trade instead of talking itself into it.',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'Reach probability p = 0.30, target gain = 15%, stop loss = 8%. Compute the expected value (as a percentage, one decimal place).',
            correctAnswer: '-1.1%',
            explanation:
              'EV = 0.30 × 0.15 − 0.70 × 0.08 = 0.045 − 0.056 = **−0.011** = −1.1%. Even a plausible-looking setup can have negative EV once the odds and both sides of the payoff are weighed.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'A candidate has target gain = 12% and stop loss = 6%. What reach probability would it need just to BREAK EVEN (EV = 0)? Give it as a percentage, one decimal place.',
            correctAnswer: '33.3%',
            explanation:
              'Set EV = 0: p·g = (1−p)·L, so p = L / (g + L) = 0.06 / (0.12 + 0.06) = **33.3%**. This is the single most useful thing to compute about any setup — it tells you the hit rate the payoff geometry demands, before you look at any probability estimate. The live engine risks 2σ to make 1.5σ, which needs 2 / (1.5 + 2) = **57.1%** regardless of volatility, while the honest zero-drift probability is far lower. That gap is exactly why EV is almost always negative.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'What actually ranks candidates against each other for the strategy builder?',
            options: [
              'Expected value (EV), not the composite score',
              'The composite score alone',
              'RSI alone',
              'Whichever stock has the lowest price'
            ],
            correctAnswer: 'Expected value (EV), not the composite score',
            explanation:
              'The score is a quality gate (Level 2); EV is the actual ranking metric, computed independently so the two questions are never conflated.'
          }
        ]
      },
      {
        id: 'l3-position-sizing',
        title: 'Volatility-targeted (fractional-Kelly-ish) position sizing',
        theory:
          '## The formula\n\n' +
          '```\nsuggestedAmount = min(0.25, 0.20 / annualVol) · budget\n```\n\n' +
          'When a BUY fires with cash available, the engine suggests an amount to deploy — but it does not simply split the cash evenly or bet the maximum. It scales the position **inversely to volatility**: a 20%-annual-vol stock gets close to the full 25% cap, while an 80%-annual-vol stock gets sized down to roughly a quarter of that. This is a simplified, capped relative of Kelly-criterion sizing: put more capital behind steadier bets, less behind wild ones, and never risk more than a fixed ceiling (25% of available cash) on any single idea regardless of how attractive it looks.\n\n' +
          '## Why cap it at all?\n\n' +
          'A true, uncapped Kelly formula can suggest very large position sizes when the estimated edge looks good — but estimated edges are just that, estimates, and a model that is confidently wrong is far more dangerous than one that is cautiously right. The hard 25% ceiling is a deliberate override: no single signal, however good it looks, gets to dominate the portfolio.',
        furtherReading: [
          {
            title: 'Kelly criterion — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Kelly_criterion'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'Annualized volatility = 40% (0.40), budget = $1,000. Compute the suggested amount.',
            correctAnswer: '$500',
            explanation:
              '0.20 / 0.40 = 0.50, and min(0.25, 0.50) = 0.25 (the cap binds). suggestedAmount = 0.25 × $1,000 = **$500**.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              "At exactly what annualized volatility does the 25% cap stop being the binding constraint (i.e. where does 0.20/annualVol first drop below 0.25)? Then, for a much wilder name at annualVol = 120% (1.2), compute the suggested amount for a $1,000 budget and confirm the vol-scaling term (not the cap) is what's actually driving the size now.",
            correctAnswer: '80%; ≈$166.67',
            explanation:
              '0.20/annualVol = 0.25 exactly when annualVol = 0.20/0.25 = **0.80 (80%)** — so for ANY volatility at or below 80%, the formula always resolves to a flat 25%, and the cap is doing all the work, not the volatility term. Only above 80% vol does 0.20/annualVol actually drop below 0.25 and start shrinking the size further: at 120% vol, 0.20/1.2 ≈ 0.1667, and min(0.25, 0.1667) = 0.1667 → suggestedAmount ≈ **$166.67**. This is the genuine "vol-targeted" behavior in action — it only bites for names wilder than 80% annualized vol.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why does the engine cap the suggested amount at 25% of budget even when volatility is very low?',
            options: [
              'To avoid over-concentrating the portfolio in any single idea, however attractive it looks',
              'Because Nordnet does not allow larger orders',
              'Because the formula is not meant to ever exceed 25%',
              '25% is simply the historical average position size'
            ],
            correctAnswer:
              'To avoid over-concentrating the portfolio in any single idea, however attractive it looks',
            explanation:
              'A hard ceiling protects against a confidently-wrong estimate dominating the portfolio.'
          }
        ]
      }
    ]
  },
  {
    id: 'level-4',
    title: 'Level 4 — Portfolio construction',
    description:
      'The 60/40 funds/stocks philosophy, the four budget strategies, fee-aware whole-share sizing, and how fund-sleeve redundancy is avoided.',
    lessons: [
      {
        id: 'l4-portfolio-philosophy',
        title: 'Why 60% funds / 40% stocks',
        theory:
          '## The split\n\n' +
          "The portfolio's target shape is **60% low-fee, diversified funds** and **40% individually-picked stocks/ETFs** (`SIGNAL_PORTFOLIO_FUNDS_RATIO = 0.6`). The funds sleeve is the reliable core — broad, cheap, diversified exposure that does not depend on any single stock pick going right. The stock sleeve is where the whole technical-signal machinery (Levels 1–3) actually gets to do its work: individual EV-ranked picks, sized and timed by the engine.\n\n" +
          '## The honest reason for the split\n\n' +
          "This is not just a diversification platitude — it is a direct response to the engine's own backtest evidence (Level 5): across roughly 150 evaluated names, only a minority of individually-traded rules actually beat simply holding. Leaning most of the portfolio on a cheap, diversified core and treating individual stock signals as a smaller, higher-conviction satellite is the engine's way of taking its own honest evidence seriously, rather than assuming every signal it generates is a good idea to bet the whole portfolio on.",
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Suppose the Level 5 backtest evidence had instead shown that MOST individually-traded rules reliably beat buy-and-hold. Would a 60% funds / 40% stocks split still make the same sense, and why?',
            options: [
              'No — the 60/40 split is a direct response to the actual evidence that trading usually loses to holding; if the evidence flipped, the honest, consistent response would be to lean the split the other way, toward the stock sleeve',
              'Yes — the split is fixed by regulation and has nothing to do with backtest evidence',
              'Yes — 60/40 is simply the mathematically optimal ratio regardless of any evidence',
              'The split would become irrelevant, since funds and stocks would perform identically either way'
            ],
            correctAnswer:
              'No — the 60/40 split is a direct response to the actual evidence that trading usually loses to holding; if the evidence flipped, the honest, consistent response would be to lean the split the other way, toward the stock sleeve',
            explanation:
              'The whole point of grounding the split in real backtest evidence (rather than a fixed rule-of-thumb) is that the split should track what the evidence actually says — a system that ignored contradicting evidence to keep an arbitrary ratio would be exactly the kind of "built-in optimism" this engine is designed to avoid.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'What is the main reason the portfolio leans 60% toward funds rather than individual stock picks?',
            options: [
              "The engine's own backtest evidence shows most individual trading rules do not reliably beat simply holding — a cheap diversified core is the honest response",
              'Funds have higher expected returns than stocks in every scenario',
              'Nordnet charges lower fees for funds specifically to encourage this split',
              'It is an arbitrary historical default with no particular reasoning'
            ],
            correctAnswer:
              "The engine's own backtest evidence shows most individual trading rules do not reliably beat simply holding — a cheap diversified core is the honest response",
            explanation:
              'The split is a direct, honest consequence of what the backtest layer (Level 5) actually found.'
          }
        ]
      },
      {
        id: 'l4-rebalance-mechanics',
        title: 'Rebalance mechanics & cash triggers',
        theory:
          '## When does a strategy actually get generated?\n\n' +
          'The engine does not propose a new allocation on every cycle — only when there is meaningful cash to deploy: `cashBalance ≥ SIGNAL_STRATEGY_MIN_CASH` (a minimum floor), and only re-fires when cash has grown by at least `SIGNAL_STRATEGY_CASH_DELTA` since the last suggestion. This avoids spamming a new "here\'s what to buy" recommendation every time a single dollar of dividend lands.\n\n' +
          '## Steering fresh cash toward the under-weighted sleeve\n\n' +
          'Once a strategy is triggered, the split isn\'t simply "60% of *this* deposit" in isolation — it looks at the *current* actual funds/stocks balance across the whole portfolio and steers fresh cash toward whichever sleeve is currently under its 60/40 target, gradually pulling the real portfolio back toward the target shape over time rather than assuming every past deposit was allocated perfectly.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'If the stock sleeve is currently over-weighted relative to its 40% target, where does the engine steer the next deposit of fresh cash?',
            options: [
              'Toward the funds sleeve, to pull the overall portfolio back toward the 60/40 target',
              'Toward the stock sleeve, to double down on the winning side',
              'Split exactly 50/50 regardless of current weights',
              'It ignores current weights entirely and always uses a flat 60/40 split on the new cash alone'
            ],
            correctAnswer:
              'Toward the funds sleeve, to pull the overall portfolio back toward the 60/40 target',
            explanation:
              "The rebalance mechanism looks at the whole portfolio's current shape, not just the new deposit in isolation, and corrects toward the target over time."
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why does the engine require cash to grow by a minimum delta before re-firing a new strategy suggestion?',
            options: [
              'To avoid generating a new recommendation for every trivial cash change (e.g. a small dividend)',
              'Because Nordnet limits how often orders can be placed',
              'Because the strategy calculation is too slow to run often',
              'It does not — it fires on every single cycle regardless of cash'
            ],
            correctAnswer:
              'To avoid generating a new recommendation for every trivial cash change (e.g. a small dividend)',
            explanation:
              'The minimum floor and delta both exist purely to keep suggestions meaningful rather than constant noise.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'The portfolio is currently 70% funds / 30% stocks (funds slightly over target, stocks slightly under). $500 of fresh cash arrives, clearing both the minimum-cash and cash-delta thresholds. How would the engine split this $500?',
            options: [
              'Skewed more toward stocks than a flat 60/40 split, since stocks are the currently under-weighted sleeve',
              'Exactly $300 to funds / $200 to stocks (a flat 60/40 split), regardless of current weights',
              'Skewed more toward funds, to reinforce the sleeve that is already ahead',
              'Split 50/50, ignoring both the target and the current weights'
            ],
            correctAnswer:
              'Skewed more toward stocks than a flat 60/40 split, since stocks are the currently under-weighted sleeve',
            explanation:
              'Because the rebalance logic looks at the CURRENT actual weights (70/30) versus the target (60/40), it steers disproportionately toward whichever sleeve is under-weighted — here, stocks — rather than blindly applying 60/40 to every fresh deposit regardless of where the portfolio already stands. Over repeated deposits, this pulls the real portfolio back toward target instead of just perpetuating whatever drift has already happened.'
          }
        ]
      },
      {
        id: 'l4-recent-signal-control',
        title: 'Recent-signal control: the 14-day cooldown',
        theory:
          '## The rule\n\n' +
          '`SIGNAL_RECENT_SIGNAL_WINDOW` is a 14-day window: if a name already had a BUY signal fire recently, it is treated differently on subsequent strategy runs — flagged and re-confirmed (noted in the rationale as still valid) rather than presented as if freshly discovered. Combined with the eligibility gate\'s separate "recently-exited" cooldown (Level 2), this keeps the strategy output stable and readable run to run, instead of a shuffled top-5 list every 30 minutes as tiny score fluctuations move names in and out of the ranking.\n\n' +
          '## Why this matters for trust in the system\n\n' +
          'A recommendation engine that changes its mind every half hour is not trustworthy, even if each individual recalculation is technically correct. Recognizing "this is the same idea I told you about yesterday, and it still holds up" versus silently replacing it with a superficially different name is what makes the output usable for actually making decisions, not just a stream of numbers.\n\n' +
          '## Two different cooldowns, easy to confuse\n\n' +
          "This 14-day *recent-signal* window (re-confirms a still-valid idea) is a completely different mechanism from the eligibility gate's *recently-exited* cooldown (Level 2) — one is about a still-open BUY opportunity staying stable in the rankings, the other is about not immediately re-buying something that was just sold or stopped out. They happen to share a similar shape (both are time windows keyed off a past event) but serve opposite purposes.",
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'A stock had a BUY signal fire 5 days ago and still qualifies today. What does the engine do?',
            options: [
              'Flags it as a re-confirmed recent BUY that is still valid, rather than presenting it as newly discovered',
              'Ignores it completely for 14 days',
              'Automatically doubles the position size',
              'Removes it from the watchlist'
            ],
            correctAnswer:
              'Flags it as a re-confirmed recent BUY that is still valid, rather than presenting it as newly discovered',
            explanation:
              'The recent-signal window recognizes continuity rather than treating every run as a blank slate.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'What is the key difference between the 14-day "recent-signal" window (this lesson) and the "recently-exited" cooldown (Level 2\'s eligibility gates)?',
            options: [
              'Recent-signal re-confirms and stabilizes a STILL-OPEN buy opportunity; recently-exited prevents immediately re-buying something that was just SOLD or stopped out — opposite directions, same-shaped time window',
              'They are the exact same mechanism referenced under two different names',
              'Recent-signal only applies to funds; recently-exited only applies to stocks',
              'Recent-signal blocks a buy; recently-exited encourages one'
            ],
            correctAnswer:
              'Recent-signal re-confirms and stabilizes a STILL-OPEN buy opportunity; recently-exited prevents immediately re-buying something that was just SOLD or stopped out — opposite directions, same-shaped time window',
            explanation:
              'Easy to conflate since both are "cooldown-shaped," but one stabilizes an ongoing opportunity and the other prevents a whipsaw re-entry — genuinely different jobs.'
          }
        ]
      },
      {
        id: 'l4-four-strategies',
        title: 'The four strategies: Aggressive, Balanced, Spread, Safe 80/20',
        theory:
          '## Four shapes, same underlying candidates\n\n' +
          'All four strategies draw from the same EV-ranked, eligibility-gated candidate list (Levels 2–3) — they differ only in how concentrated or spread the resulting basket is:\n\n' +
          '- **Aggressive**: 100% of the budget on the single top-EV pick. Maximum concentration, maximum exposure to being wrong about one name.\n' +
          '- **Balanced**: the top 2 picks from *distinct* categories/sectors, roughly split ~50/50 — some concentration, but not "all eggs in one basket."\n' +
          '- **Spread**: 3–5 picks across distinct categories, evenly split — the most diversified of the four active-picking strategies.\n' +
          '- **Safe 80/20**: 80% into the core index fund (`NORDNET_GLOBAL_INDEX`), 20% into the single top-EV stock — a way to still participate in the best current idea without materially risking the "safe" allocation.\n\n' +
          '## Why "distinct categories" matters for Balanced/Spread\n\n' +
          'Picking the top 3 candidates by raw EV alone could easily mean 3 semiconductor stocks that all move together — diversified in name only. Requiring distinct categories forces genuine risk spread, not just a longer list of correlated names.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Given the SAME candidate list every time, what actually changes between the four strategies — the underlying ranked candidates themselves, or just how many of them get used and in what proportion?',
            options: [
              'Only the concentration/proportion changes — all four draw from the exact same EV-ranked, eligibility-gated candidate list',
              'Each strategy re-ranks the candidates using a completely different formula',
              'Aggressive and Spread use different eligibility gates than Balanced and Safe 80/20',
              'The candidate list is randomly reshuffled for each strategy'
            ],
            correctAnswer:
              'Only the concentration/proportion changes — all four draw from the exact same EV-ranked, eligibility-gated candidate list',
            explanation:
              'From least to most diversified: **Aggressive** (1 pick) < **Safe 80/20** (1 stock pick + a fixed fund anchor, still just one "active" bet) < **Balanced** (2 distinct-category picks) < **Spread** (3-5 distinct-category picks). Crucially, all four are built from the exact same EV-ranked, eligibility-gated candidate list (Levels 2-3) — nothing about the underlying ranking changes between strategies, only how many of the top candidates get used and in what proportion. This is why the same signal cycle can produce all four strategies simultaneously without recomputing anything from scratch.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why do Balanced and Spread require picks from distinct categories, rather than just the top-N by raw EV?',
            options: [
              'To avoid "diversification in name only" — e.g. picking 3 correlated semiconductor stocks that all move together',
              'Because Nordnet requires a minimum number of sectors per order',
              'Distinct categories always have higher expected value',
              'It is a regulatory requirement'
            ],
            correctAnswer:
              'To avoid "diversification in name only" — e.g. picking 3 correlated semiconductor stocks that all move together',
            explanation:
              'A longer list of highly-correlated names does not actually spread risk the way distinct categories do.'
          }
        ]
      },
      {
        id: 'l4-fee-aware-sizing',
        title: 'Fee-aware whole-share sizing & remainder minimization',
        theory:
          '## The two problems per-order fees create\n\n' +
          "Nordnet charges a fixed 9 SEK (~$0.95) plus 0.25% on every order. Two practical problems fall out of that: (1) each extra leg is another order and therefore another fixed fee, so splitting a small budget across many tiny legs lets fees eat an unreasonable share of the total, and (2) since you can only buy whole shares, an even split across legs almost always leaves some cash unspent (whichever leg's price doesn't divide evenly into its share).\n\n" +
          'Note that the percentage part is indifferent to how you split: N orders of `cash/N` each pay `0.25% × cash/N`, summing to `0.25% × cash` no matter what N is. **Only the fixed part cares about leg count** — and it cares a lot.\n\n' +
          '## Fee-aware trimming\n\n' +
          '```\nfeeRatio = Σ commission(cash / legs) / cash\n```\n\n' +
          'If the fee ratio would exceed `SIGNAL_STRATEGY_MAX_FEE_RATIO` (10%), the engine drops the lowest-ranked leg and rechecks — repeating until the ratio clears or only one ticker remains. A $45 budget split five ways spends about $4.87 (10.8%) on fees; trimming to four brings it to 8.7%. The engine would rather hold fewer, larger legs than let fees quietly erode more than a tenth of the deployment.\n\n' +
          '## Remainder minimization\n\n' +
          'After an even split and whole-share rounding down, there is almost always leftover cash (e.g. a $100 leg buying a $37 stock leaves $26 unspent). Rather than letting that cash sit idle, the engine greedily hands pooled leftovers to the highest-EV leg that can afford one more whole share, repeating until no leg can absorb any more — charging that leg one commission on its final value, never one per share.',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'A basket has 4 legs and $40 of cash, split evenly. Nordnet charges 9 SEK (~$0.95) plus 0.25% per order. Compute the fee ratio and state whether it passes the 10% cap.',
            correctAnswer: '9.8%, passes',
            explanation:
              'Each leg is $10, so each order costs $0.95 + 0.25% × $10 ($0.025) = $0.976. Four legs = $3.90; $3.90/$40 ≈ 0.098 = **9.8%**, just inside the cap. Push it to five legs and it becomes $4.86/$40 = 12.1%, which fails — the fixed fee is what breaks it, since the percentage part contributes the same $0.10 in total however you split.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt: 'What problem does "remainder minimization" solve?',
            options: [
              'Leftover cash from whole-share rounding sitting idle instead of being put to work',
              'The per-order commission being charged twice on the same share',
              'Stocks trading at fractional prices',
              'Currency conversion losses'
            ],
            correctAnswer:
              'Leftover cash from whole-share rounding sitting idle instead of being put to work',
            explanation:
              'An even split plus whole-share rounding leaves cash on the table; greedily reallocating it (highest-EV leg first) puts more of the budget to work.'
          }
        ]
      },
      {
        id: 'l4-redundancy',
        title: 'Fund-sleeve redundancy de-prioritization',
        theory:
          '## The problem\n\n' +
          'If the funds sleeve is already, say, 50% invested in US-large-cap exposure, and the stock-picking engine independently suggests buying a US tech stock, the *effective* portfolio ends up far more US-concentrated than the 60/40 split suggests on paper — the two sleeves were built without awareness of each other.\n\n' +
          '## The fix\n\n' +
          'For every stock/ETF candidate, the engine computes `categoryShare = fundValueByCategory[candidate.category] / totalFundValue`. If that share exceeds `SIGNAL_STRATEGY_REDUNDANCY_THRESHOLD` (40% of the tracked fund sleeve), the candidate is flagged `isRedundant` and its ranking key is multiplied by `SIGNAL_STRATEGY_REDUNDANCY_PENALTY` (0.5) — **de-prioritized, never excluded**. A redundant pick can still win if its edge is strong enough to overcome the penalty; the goal is nudging toward genuine diversification, not enforcing a rigid quota.',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'The fund sleeve\'s "usa" category is worth $4,000 out of a $9,000 total fund sleeve (category share 44.4%, above the 40% threshold). Candidate A (a "usa"-category stock) has a ranking key of 80; Candidate B (an "em"-category stock, fund sleeve share only 12%) has a ranking key of 45. After redundancy de-prioritization (0.5× penalty applied to flagged candidates), which one ranks higher?',
            correctAnswer: 'Candidate A (40 vs 45) — B now ranks higher',
            explanation:
              'A is flagged redundant (44.4% > 40%): its effective key becomes 80 × 0.5 = **40**. B is not flagged (12% is well under 40%): its key stays **45**. So despite A having the higher RAW ranking key (80 vs 45), after the redundancy penalty B (45) actually outranks A (40) — this is the mechanism doing real work, not just a label.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Can a redundancy-flagged candidate still be picked by a strategy?',
            options: [
              'Yes — it is de-prioritized (ranking penalized), not excluded; a strong enough edge can still win',
              'No — redundancy flags are a hard exclusion',
              'Only in the Aggressive strategy',
              'Only if the user manually overrides it'
            ],
            correctAnswer:
              'Yes — it is de-prioritized (ranking penalized), not excluded; a strong enough edge can still win',
            explanation:
              'The 0.5× penalty on the ranking key nudges away from redundancy without ever hard-blocking a genuinely compelling candidate.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why does the engine use a soft 0.5× ranking penalty for redundancy instead of a hard rule like "never pick a candidate whose category exceeds 40% of the fund sleeve"?',
            options: [
              'A hard exclusion could reject a genuinely exceptional opportunity purely for being in an already-common category, while a penalty still lets a strong enough edge win — nudging toward diversification without a rigid quota',
              'A hard rule would be mathematically impossible to implement',
              'The penalty and a hard rule produce identical results in every case',
              'Hard rules are illegal under financial regulation'
            ],
            correctAnswer:
              'A hard exclusion could reject a genuinely exceptional opportunity purely for being in an already-common category, while a penalty still lets a strong enough edge win — nudging toward diversification without a rigid quota',
            explanation:
              "This mirrors the broader philosophy across the engine (e.g. the eligibility gates, Level 2) — softly discourage, don't rigidly forbid, unless there's a genuinely hard constraint (like a volatility cap) that must never be crossed."
          }
        ]
      }
    ]
  },
  {
    id: 'level-5',
    title: 'Level 5 — Backtesting & performance evaluation',
    description:
      'How a trading rule is honestly evaluated against simply holding: Sharpe, Sortino, Calmar, profit factor, CAGR, max drawdown, exposure, out-of-sample testing, and slippage.',
    lessons: [
      {
        id: 'l5-sharpe-sortino',
        title: 'Sharpe & Sortino ratios',
        glossaryRef: 'backtest-metrics',
        theory:
          '## Risk-adjusted return, two ways\n\n' +
          '```\nSharpe = mean(r) / stdev(r) · √252\nSortino = mean(r) / downsideStdev(r) · √252\n```\n\n' +
          'Both measure return per unit of risk (annualized), but they define "risk" differently. **Sharpe** penalizes *all* volatility — a strategy that occasionally jumps sharply upward gets penalized by that upside volatility just as much as by downside swings. **Sortino** only penalizes *downside* deviation (volatility from returns below a target, usually zero) — a strategy with big upside spikes and calm downside behavior looks better on Sortino than on Sharpe, which arguably matches most investors\' actual preferences (nobody minds "volatility" that only ever goes up).\n\n' +
          '## Reading the numbers\n\n' +
          'Higher is better for both. As a rough industry convention: below 1.0 is considered weak, 1.0–2.0 decent, above 2.0 very good for a systematic strategy — though these thresholds are heuristics, not hard cutoffs, and depend heavily on the asset class and time period being measured.',
        furtherReading: [
          {
            title: 'Sharpe ratio — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Sharpe_ratio'
          },
          {
            title: 'Sortino ratio — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Sortino_ratio'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'What is the key difference between Sharpe and Sortino ratios?',
            options: [
              'Sharpe penalizes all volatility (up and down); Sortino only penalizes downside volatility',
              'Sortino is only used for bonds, Sharpe only for stocks',
              'They are identical formulas with different names',
              'Sharpe uses daily returns, Sortino uses monthly returns'
            ],
            correctAnswer:
              'Sharpe penalizes all volatility (up and down); Sortino only penalizes downside volatility',
            explanation:
              'A strategy with strong upside spikes and calm downside will show a notably higher Sortino than Sharpe.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'Daily mean return = 0.0008 (0.08%), daily stdev of returns = 0.015 (1.5%). Compute the annualized Sharpe ratio (round to 2 decimal places).',
            correctAnswer: '0.85',
            explanation: '(0.0008 / 0.015) × √252 = 0.0533 × 15.87 ≈ **0.85**.'
          }
        ]
      },
      {
        id: 'l5-calmar-drawdown',
        title: 'Calmar ratio, CAGR & max drawdown',
        glossaryRef: 'backtest-metrics',
        theory:
          '## Max drawdown: the worst peak-to-trough decline\n\n' +
          '```\nmaxDrawdown = max over t of (peakValue_t − value_t) / peakValue_t\n```\n\n' +
          'This tracks the running peak of the equity curve and measures the worst percentage decline from any peak to a subsequent trough. It answers a very concrete, painful question: "at the worst possible moment, how much of my money would I have watched disappear before it recovered?"\n\n' +
          '## CAGR: return, annualized honestly\n\n' +
          '```\nCAGR = (endValue / startValue) ^ (252 / tradingDays) − 1\n```\n\n' +
          'CAGR (Compound Annual Growth Rate) converts a total return over an arbitrary backtest window into a single "as if this ran for exactly one year, compounding" number — the only fair way to compare a 3-month backtest against a 3-year one.\n\n' +
          '## Calmar: return per unit of drawdown pain\n\n' +
          '```\nCalmar = CAGR / maxDrawdown\n```\n\n' +
          'Where Sharpe/Sortino measure return against day-to-day volatility, Calmar measures it against the single worst drawdown — arguably the number that matters most for whether a real person can actually stick with a strategy through its worst stretch.',
        furtherReading: [
          {
            title: 'Compound annual growth rate — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Compound_annual_growth_rate'
          },
          {
            title: 'Drawdown (economics) — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Drawdown_(economics)'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'An equity curve goes: $10,000 → $12,000 (new peak) → $9,000 (trough) → $11,000 (new peak) → $8,000 (trough). Compute the max drawdown over the WHOLE path — not just the first decline.',
            correctAnswer: '27.3%',
            explanation:
              "First decline: (12,000−9,000)/12,000 = 25%. Second decline: (11,000−8,000)/11,000 ≈ 27.27%. Max drawdown takes the WORST decline from ANY peak to a LATER trough across the whole path, not just the first one you notice — here that's the second decline, **≈27.3%**, even though the first peak ($12,000) was numerically higher than the second ($11,000)."
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'A backtest starts at $10,000 and ends at $11,000 after 126 trading days (half a year). Compute the CAGR (round to 1 decimal place, as a %).',
            correctAnswer: '21.0%',
            explanation:
              "(11,000/10,000)^(252/126) − 1 = 1.1^2 − 1 = 1.21 − 1 = 0.21 = **21.0%** — note how compounding a half-year's +10% into an annualized figure roughly doubles it, which is exactly why comparing raw (non-annualized) returns across different-length backtests is misleading."
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Strategy A: CAGR 15%, max drawdown 10% (Calmar = 1.5). Strategy B: CAGR 30%, max drawdown 35% (Calmar ≈ 0.86). Which strategy would most investors find easier to actually stick with through a bad stretch, and does the higher raw CAGR (Strategy B) tell the full story?',
            correctAnswer:
              "Strategy A — despite B's higher CAGR, its much deeper drawdown (35% vs 10%) makes it far more likely an investor abandons it at the worst possible moment",
            options: [
              "Strategy A — despite B's higher CAGR, its much deeper drawdown (35% vs 10%) makes it far more likely an investor abandons it at the worst possible moment",
              'Strategy B, since a higher CAGR is always better regardless of drawdown',
              "They are equally easy to stick with, since Calmar doesn't actually reflect real investor behavior",
              'Impossible to compare without knowing the exposure percentage'
            ],
            explanation:
              'This is exactly why Calmar exists as a separate metric from raw CAGR — a strategy with a bigger headline return but a much rockier ride (deep drawdowns) is often, in practice, the one that gets abandoned right before it would have recovered. Calmar (1.5 vs 0.86) captures that tradeoff directly; CAGR alone hides it.'
          }
        ]
      },
      {
        id: 'l5-profit-factor-exposure',
        title: 'Profit factor & exposure',
        theory:
          '## Profit factor\n\n' +
          '```\nprofitFactor = Σ gains / Σ losses\n```\n\n' +
          'The ratio of total dollars won on winning trades to total dollars lost on losing trades. A profit factor of 1.0 is exact break-even (before considering win rate — you can have a low win rate and still be profitable if wins are much bigger than losses, or vice versa). Above 1.0 means the strategy is net profitable on a gross basis (before other costs); the higher above 1.0, the more cushion there is against a run of bad luck.\n\n' +
          '## Exposure\n\n' +
          '```\nexposure = barsInPosition / totalTradableBars\n```\n\n' +
          'What fraction of the available time was the strategy actually holding a position, versus sitting in cash waiting for a setup? This matters for interpreting every other metric: a strategy with a great Sharpe ratio but only 10% exposure is a very different animal from one with the same Sharpe at 90% exposure — the first is mostly *not* exposed to the market\'s own risk/return most of the time, so its numbers say less about "is this a good way to be invested" than they might first appear.',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'Strategy A: 10 trades, 3 winners averaging $400 gain each, 7 losers averaging $100 loss each (30% win rate). Strategy B: 10 trades, 7 winners averaging $150 gain each, 3 losers averaging $200 loss each (70% win rate). Compute the profit factor for both. Is the strategy with the much lower win rate (A) still profitable?',
            correctAnswer: 'A: 1.71, B: 1.75, yes A is still profitable',
            explanation:
              'A: gains = 3×$400 = $1,200, losses = 7×$100 = $700, PF = 1,200/700 ≈ **1.71**. B: gains = 7×$150 = $1,050, losses = 3×$200 = $600, PF = 1,050/600 = **1.75**. Despite A having only a 30% win rate versus B\'s 70%, A is still solidly profitable (PF > 1) because its average winner is 4x its average loser — this is exactly the "low win rate can still be profitable if wins are much bigger than losses" case the theory calls out. Win rate alone, without size-of-win/loss, tells you very little.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'A strategy shows an excellent Sharpe ratio but only 8% exposure. What should you keep in mind?',
            options: [
              'The strategy was rarely actually in the market, so the impressive risk-adjusted number reflects only a small, possibly lucky slice of time, not sustained market exposure',
              'Exposure has no bearing on interpreting Sharpe',
              'Low exposure always means the strategy is broken',
              'This automatically means the max drawdown must also be very low'
            ],
            correctAnswer:
              'The strategy was rarely actually in the market, so the impressive risk-adjusted number reflects only a small, possibly lucky slice of time, not sustained market exposure',
            explanation:
              'Exposure is the context needed to correctly interpret every other risk/return metric alongside it.'
          },
          {
            id: 'q3',
            type: 'calculation',
            prompt:
              'A backtest ran for 200 tradable bars (days), and the strategy held an open position for 50 of them. Compute the exposure percentage, and explain in one sentence what it would mean if this same strategy also reported a very high Sharpe ratio.',
            correctAnswer:
              '25%; a high Sharpe on only 25% exposure is based on a small slice of time and says less about full-time investing than the number alone suggests',
            explanation:
              "exposure = 50/200 = **25%**. A strategy only in the market a quarter of the time producing an impressive Sharpe ratio is a real but narrower claim than it might first appear — three-quarters of the time, the strategy's risk/return properties simply don't apply, since there's no position at all."
          }
        ]
      },
      {
        id: 'l5-out-of-sample',
        title: 'Out-of-sample testing & slippage',
        theory:
          '## Why in-sample results alone are not trustworthy\n\n' +
          "Any backtest can be quietly overfit to its own historical window — tuning until the numbers on that exact data look great tells you very little about how a rule performs on data it hasn't seen. The engine addresses this directly by holding out the **last 30% of the backtest window** as out-of-sample: metrics are computed separately on the first 70% (in-sample) and the last 30% (out-of-sample, re-based to its own starting equity), and comparing the two windows is far more honest than reporting a single blended number.\n\n" +
          '## Slippage\n\n' +
          'A backtest assumes fills happen at exactly the last known close, but real trades never execute at a perfectly clean price — the bid/ask spread and market impact mean the real fill is always slightly worse than the theoretical one. The engine bakes in a **10 basis points (0.10%) slippage per side** by default (configurable via `?slippageBps=`), applied to both entry and exit, so the reported edge already accounts for at least a baseline amount of real-world friction rather than an idealized, frictionless fill.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Why does the engine hold out the last 30% of a backtest window as "out-of-sample"?',
            options: [
              "To check whether the strategy's edge holds up on data the rule wasn't effectively tuned against, guarding against overfitting",
              'Because Yahoo Finance only provides 70% of the requested history',
              'To make the backtest run faster',
              'It is a regulatory requirement for backtesting'
            ],
            correctAnswer:
              "To check whether the strategy's edge holds up on data the rule wasn't effectively tuned against, guarding against overfitting",
            explanation:
              'Comparing in-sample vs. out-of-sample results is one of the most basic, important honesty checks against a backtest that just looks good by chance.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'A trade enters at $100 and exits at $110, with 10 bps (0.10%) slippage applied per side. Approximate the effective entry and exit prices after slippage (round to 2 decimals).',
            correctAnswer: 'entry ≈ 100.10, exit ≈ 109.89',
            explanation:
              'Slippage works against you on both sides: entry gets slightly worse (higher) at 100 × 1.001 ≈ **100.10**, exit gets slightly worse (lower) at 110 × 0.999 ≈ **109.89** — a small but real drag on the reported edge.'
          }
        ]
      },
      {
        id: 'l5-honest-evidence',
        title: 'The honest evidence: does trading actually beat holding?',
        theory:
          '## The whole-watchlist finding\n\n' +
          "The engine has been backtested across roughly 150 names in the watchlist, comparing the *actual trading rule* (DIP/REVERSAL entries, the exit machine) against simply buying and holding the same name for the same window. The honest result: only a **minority — well under a third** — of names showed the trading rule actually beating buy-and-hold, with a meaningfully negative average edge across the whole set. Some of the market's biggest winners over the period were **completely missed** by the active rule, because a rule designed to buy dips and manage risk will, by construction, sometimes sit out a name that simply never dipped and just kept climbing.\n\n" +
          '## Why the engine reports this instead of hiding it\n\n' +
          'This finding is not a bug to be quietly fixed — it is the honest reason the portfolio leans 60% toward a diversified fund core (Level 4) rather than assuming every signal is worth betting the whole portfolio on. A system that only ever reports its wins would be far more dangerous to actually rely on than one that tells you, plainly, "trading usually loses to holding — treat individual stock signals as a smaller, higher-conviction satellite, not the main event."',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'What did the whole-watchlist backtest find, comparing the active trading rule to simple buy-and-hold?',
            options: [
              'Only a minority of names had the trading rule beat buy-and-hold, with a meaningfully negative average edge — some big winners were missed entirely',
              'The trading rule beat buy-and-hold on every single name tested',
              'Buy-and-hold and the trading rule performed identically on every name',
              'The backtest was inconclusive and produced no usable result'
            ],
            correctAnswer:
              'Only a minority of names had the trading rule beat buy-and-hold, with a meaningfully negative average edge — some big winners were missed entirely',
            explanation:
              'This is the documented, honest empirical finding behind the whole design — not an assumption, an actual measured result.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'How does this finding directly connect to the 60/40 funds/stocks philosophy (Level 4)?',
            options: [
              'It is the empirical evidence behind leaning most of the portfolio on a cheap diversified core, since individual trading rules do not reliably outperform holding',
              'It has no connection — the split was chosen for unrelated reasons',
              'It suggests the stock sleeve should actually be larger than the fund sleeve',
              'It proves the fund sleeve should be eliminated entirely'
            ],
            correctAnswer:
              'It is the empirical evidence behind leaning most of the portfolio on a cheap diversified core, since individual trading rules do not reliably outperform holding',
            explanation:
              'The 60/40 split is a direct, honest response to this exact backtest finding, not an arbitrary default.'
          }
        ]
      }
    ]
  },
  {
    id: 'level-6',
    title: 'Level 6 — Funds & ETFs as instruments',
    description:
      'What a fund and an ETF concretely are in this portfolio, how each is priced, and why ETFs sit in the 40% stock sleeve rather than the fund sleeve.',
    lessons: [
      {
        id: 'l6-fund-data-model',
        title: 'The fund data model: fee, category, NAV, holdings',
        theory:
          '## What a "fund" is in this system\n\n' +
          'A fund is a `MANUAL`-datasource instrument (not Yahoo-priced) with: a stable symbol slug, a `category` (exposure bucket like `global`, `usa`, `europe`, `em`, `sweden`, or a thematic one like `nuclear-energy`), a `currency`, and a `feePct` — the fund\'s ongoing annual fee, the fund-world analogue of an ETF\'s TER (next lesson). Anything above 0.40% fee needs an explicit justification for why the higher cost is worth it (or is covered by an explicit screening criterion, like "fee < 0.5% and 1-year return > 15%").\n\n' +
          '## Holdings\n\n' +
          'Real top-10 holdings (the individual companies a fund actually owns, with their weight) are stored directly on the fund\'s `SymbolProfile` database row as a JSON field — sourced from the fund provider\'s own published fact sheet or fund-platform page, not fabricated. This is what lets the engine reason about actual exposure (e.g. "this fund is 12% Nvidia") rather than just a category label.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt: 'What data source is a fund priced from in this system?',
            options: [
              'A MANUAL data source (scraped NAV), not Yahoo Finance',
              'Yahoo Finance, exactly like a stock',
              'It is never priced — only stocks have prices',
              'Bloomberg Terminal'
            ],
            correctAnswer:
              'A MANUAL data source (scraped NAV), not Yahoo Finance',
            explanation:
              'Funds (especially Nordic broker house funds) generally are not covered by Yahoo Finance, so they use a MANUAL scraper-based pricing mechanism instead.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'What fee threshold requires an explicit justification for a fund to be added to the catalog?',
            options: [
              'Above 0.40%',
              'Above 1.0%',
              'Above 2.0%',
              'There is no such threshold'
            ],
            correctAnswer: 'Above 0.40%',
            explanation:
              'Any fund fee above 0.40% needs either a written justification or to be covered by an explicit screening criterion.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'A fund\'s holdings show "12% Nvidia." Why does storing this real, sourced holdings breakdown (rather than just a category label like "usa" or "tech") matter for portfolio-level reasoning?',
            options: [
              'It lets the engine (and the user) see actual company-level exposure — e.g. realizing that both a "usa" fund and a separately-picked Nvidia stock position are both concentrated in the same single company, which a category label alone would hide',
              'It has no practical use beyond satisfying curiosity',
              "It is only used to compute the fund's fee",
              'Category labels are always more accurate than real holdings data'
            ],
            correctAnswer:
              'It lets the engine (and the user) see actual company-level exposure — e.g. realizing that both a "usa" fund and a separately-picked Nvidia stock position are both concentrated in the same single company, which a category label alone would hide',
            explanation:
              'A category label like "usa" or "tech" is a coarse bucket; real holdings data is what lets genuine concentration risk (the same handful of mega-cap names showing up across multiple "different" funds) actually be visible, not just assumed away.'
          }
        ]
      },
      {
        id: 'l6-fund-pricing',
        title: 'How fund NAV is priced',
        theory:
          '## Two mechanisms, one goal: daily-updating NAV without manual work\n\n' +
          'Ghostfolio has a built-in generic mechanism for MANUAL-datasource symbols: a `scraperConfiguration` (a URL + a selector) that the existing hourly data-gathering job automatically uses to fetch and record a fresh price every day — no bespoke cron needed, just configuration. Two live sources currently feed this:\n\n' +
          "- **Avanza's public JSON API** (`fund-guide/guide/{orderBookId}`) — works for most Nordic funds.\n" +
          "- **Nordnet's own public fund pages** (scraped via a CSS selector matching the NAV label) — used for Nordnet's own house funds, which a competitor platform like Avanza structurally cannot list.\n\n" +
          '## The lesson in the fallback\n\n' +
          'Before the Nordnet-direct mechanism existed, a handful of Nordnet-only funds fell back to a **static seed price** — a one-time snapshot that a person had to update manually, exactly the kind of "manual work" a good system should eliminate. Recognizing and fixing that gap (preferring a real live scrape over a frozen fallback whenever one is available) is a concrete example of the broader principle: any manually-maintained number is a liability waiting to go stale.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              "Why does Nordnet's own fund page need to be scraped directly, rather than relying only on Avanza?",
            options: [
              "Avanza, a competing broker, does not list Nordnet's own house funds",
              'Nordnet funds are illegal to price via Avanza',
              'Avanza charges for its fund NAV API',
              'There is no difference — either source works identically for every fund'
            ],
            correctAnswer:
              "Avanza, a competing broker, does not list Nordnet's own house funds",
            explanation:
              "A competitor platform structurally has no reason to list another broker's proprietary fund products, so a direct source was needed."
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'What is the practical downside of a "static seed" NAV fallback?',
            options: [
              'It never updates on its own — it goes stale until a person manually refreshes it',
              'It updates too frequently, causing rate-limit issues',
              'It only works for stocks, not funds',
              'It requires a paid API subscription'
            ],
            correctAnswer:
              'It never updates on its own — it goes stale until a person manually refreshes it',
            explanation:
              'A frozen snapshot is exactly the kind of manual dependency a live scraper mechanism is meant to eliminate.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "Ghostfolio's generic MANUAL scraperConfiguration mechanism (a URL + a selector) is reused as-is for fund pricing, rather than building a brand-new fund-specific pricing pipeline. What does this illustrate about good engineering practice?",
            options: [
              'Reusing an existing, already-tested generic mechanism for a new use case is preferable to building bespoke new infrastructure, when the existing one genuinely fits the job',
              'Generic mechanisms are always worse than purpose-built ones',
              'It illustrates a shortcut that will need to be replaced later',
              'It only works because funds and stocks are priced identically in every respect'
            ],
            correctAnswer:
              'Reusing an existing, already-tested generic mechanism for a new use case is preferable to building bespoke new infrastructure, when the existing one genuinely fits the job',
            explanation:
              'The URL+selector scraper mechanism was already built into Ghostfolio for MANUAL assets generally — recognizing that Nordnet fund pages are just another scrapeable target for that SAME mechanism avoided writing an entirely new, redundant pricing pipeline from scratch.'
          }
        ]
      },
      {
        id: 'l6-etf-ter',
        title: 'ETFs and TER (total expense ratio)',
        theory:
          "## TER — the ETF world's fee%\n\n" +
          "An ETF's **Total Expense Ratio** is the annual cost of holding it, expressed as a fraction (e.g. `0.0018` = 18 basis points = 0.18%/year) — deducted continuously from the fund's own returns, not billed separately. Unlike the MANUAL fund catalog's `feePct`, ETF TER is hand-curated in a small separate table (`etf-ter-catalog.ts`) sourced from issuer/exchange fact sheets, since ETFs are priced normally through Yahoo Finance (next lesson) and don't need a scraper of their own — TER is the one extra piece of data Yahoo doesn't reliably provide.\n\n" +
          '## Why this number matters over long holding periods\n\n' +
          'An 18bps TER sounds negligible day to day, but compounded over years it is a real, guaranteed drag on returns — unlike a stock-picking edge (uncertain), the fee is certain. Two ETFs tracking the same index with different TERs will, all else equal, diverge in exactly the amount of that TER difference over time — which is exactly why the strategy layer\'s `terPct` field exists (currently plumbed through for future ranking use, per Level 4\'s "not yet used" precedent).',
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'Two ETFs track the identical index. ETF X has a TER of 0.07% (7bps); ETF Y has a TER of 0.65% (65bps). Assuming both otherwise track the index perfectly and you hold $10,000 in each for exactly 10 years with no other trading, approximate the cumulative fee drag difference between them over that decade (ignore compounding for simplicity — just the flat annual difference × years).',
            correctAnswer: '≈$580',
            explanation:
              'Annual fee difference = 0.65% − 0.07% = 0.58% of $10,000 = $58/year. Over 10 years (simple, non-compounded): 10 × $58 = **≈$580** — real money lost purely to fee drag on two products tracking the exact same index, with zero difference in actual market exposure. (The real compounded difference would be somewhat larger still, since the higher-fee fund also has slightly less capital compounding each year.)'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why is TER a more "certain" cost than a stock-picking edge?',
            options: [
              'The fee is deducted continuously regardless of performance, while any trading edge is only an estimate that may or may not materialize',
              'TER only applies in years the fund loses money',
              'TER is refunded if the ETF underperforms its benchmark',
              'They are equally uncertain'
            ],
            correctAnswer:
              'The fee is deducted continuously regardless of performance, while any trading edge is only an estimate that may or may not materialize',
            explanation:
              'A guaranteed cost compounding over years is a much more reliable number to reason about than an uncertain future edge.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why does the strategy layer plumb `terPct` onto candidates without yet using it in the EV ranking (Level 3)?',
            options: [
              'A deliberately cautious rollout — compute and expose the data first, decide later (with real numbers in hand) whether/how to fold it into ranking, rather than guessing at a formula up front',
              'TER data is not reliable enough to ever be used',
              'It is a bug that was never finished',
              'Because ETFs are never actually ranked by the strategy engine'
            ],
            correctAnswer:
              'A deliberately cautious rollout — compute and expose the data first, decide later (with real numbers in hand) whether/how to fold it into ranking, rather than guessing at a formula up front',
            explanation:
              'The same pattern used for the fundamentals score (Level 7) — plumb the data through and observe it first, before committing to exactly how it should weigh into a ranking formula.'
          }
        ]
      },
      {
        id: 'l6-etf-vs-fund',
        title: 'Why ETFs live in the stock sleeve, not the fund sleeve',
        theory:
          '## The key distinction: data availability, not just legal structure\n\n' +
          "Both funds and ETFs are diversified baskets, but they are treated completely differently by this engine because of one practical fact: an ETF trades on an exchange with a **full daily OHLC price history via Yahoo Finance**, exactly like a stock — so every technical indicator, the composite score, EV ranking, and even backtesting all work on an ETF exactly as they do on AAPL or any other stock. A MANUAL-priced fund, by contrast, has no such history (Level 3 of the previous session's work confirmed Nordnet's own NAV history isn't even retrievable without a live login) — so it structurally cannot be evaluated the same way.\n\n" +
          '## The practical consequence\n\n' +
          'This is why an ETF like a semiconductor-theme or clean-energy-theme basket sits in the **40% stock sleeve**, ranked and possibly bought/sold by the exact same EV-ranking engine as an individual stock — while a fund sits in the **60% core sleeve**, valued for its category share but never technically traded by the engine. The theme-category taxonomy for ETFs (`etf-semiconductors`, `etf-ai`, etc.) exists specifically to avoid stacking several ETFs that all bet on the same underlying theme without realizing it.',
        furtherReading: [
          {
            title: 'Exchange-traded fund — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Exchange-traded_fund'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'What is the core practical reason ETFs sit in the stock sleeve while funds sit in the fund sleeve?',
            options: [
              'ETFs have full daily OHLC history via Yahoo Finance, so the entire technical/EV/backtest machinery works on them exactly like a stock; MANUAL-priced funds do not have this history',
              'ETFs are legally required to be treated as stocks',
              'Funds are more expensive than ETFs in every case',
              'It is an arbitrary categorization with no technical basis'
            ],
            correctAnswer:
              'ETFs have full daily OHLC history via Yahoo Finance, so the entire technical/EV/backtest machinery works on them exactly like a stock; MANUAL-priced funds do not have this history',
            explanation:
              'The data-availability difference, not the legal wrapper, is what actually drives which sleeve an instrument belongs to in this engine.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why does the ETF catalog use theme categories like `etf-semiconductors` or `etf-ai`?',
            options: [
              'To avoid unknowingly stacking several ETFs that all bet on the same underlying theme',
              'Because Yahoo Finance requires a category field',
              'To determine the TER automatically',
              'Purely for alphabetical sorting in the UI'
            ],
            correctAnswer:
              'To avoid unknowingly stacking several ETFs that all bet on the same underlying theme',
            explanation:
              'The same redundancy-avoidance logic from Level 4 applies here — knowing the theme lets the system (and the user) spot accidental over-concentration.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "Suppose Nordnet's fund-history API suddenly became retrievable without login, giving MANUAL funds a full daily OHLC history just like ETFs. Would that alone be enough to move funds into the stock sleeve and start technically trading them the same way as ETFs?",
            options: [
              'Plausibly yes for the DATA side of the argument — the stated reason funds are excluded is the lack of history, so real history would remove that specific blocker (though other design decisions, like the 60/40 philosophy itself, might still argue for keeping some funds in the core sleeve regardless)',
              'No — funds could never be traded the same way as ETFs no matter what data becomes available, for legal reasons',
              'It would make no difference since the engine ignores price history entirely for ranking',
              'Only stocks, never any fund, can ever have OHLC history by definition'
            ],
            correctAnswer:
              'Plausibly yes for the DATA side of the argument — the stated reason funds are excluded is the lack of history, so real history would remove that specific blocker (though other design decisions, like the 60/40 philosophy itself, might still argue for keeping some funds in the core sleeve regardless)',
            explanation:
              "This tests whether you understand WHY the current split exists (a genuine data limitation) versus treating it as an arbitrary, permanent rule — the reasoning in this lesson is conditional on today's data constraints, not a claim that funds could never in principle be evaluated the same way."
          }
        ]
      }
    ]
  },
  {
    id: 'level-7',
    title: 'Level 7 — The fundamentals overlay',
    description:
      'The newest, independent signal: a valuation/quality/growth score built from free Yahoo fundamentals data, kept deliberately separate from the technical composite score.',
    lessons: [
      {
        id: 'l7-fundamentals-score',
        title: 'The fundamentals score: P/E, ROE, growth, analyst consensus',
        glossaryRef: 'fundamentals-score',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## Four inputs, one 0-100 score\n\n' +
          '| Input | Weight | Scoring |\n|---|---|---|\n| Forward P/E | 0.30 | `100 − 2·P/E` (clamped); 20 flat if unprofitable |\n| Return on equity | 0.25 | `50 + 100·ROE` (clamped) |\n| Earnings growth | 0.25 | `50 + 100·growth` (clamped) |\n| Analyst consensus | 0.20 | net buy-lean ratio `(2·strongBuy + buy − sell − 2·strongSell) / total` → `50 + 25·ratio` |\n\n' +
          'Every input is null-guarded and the weights re-normalize over whichever are actually available (the identical pattern used by the technical composite score, Level 2) — a stock with only ROE data available still gets a meaningful, fully-weighted quality-only score rather than a diluted or missing one.\n\n' +
          '## The data source\n\n' +
          "This all comes from Yahoo Finance's free `quoteSummary` fundamentals modules (`defaultKeyStatistics`, `financialData`, `recommendationTrend`) — the same npm package already used for prices, just previously untapped for fundamentals data. No paid subscription, no new integration risk.",
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'A stock has: Forward P/E = 15 (valuation term = 100−2×15 = 70, weight 0.30), ROE = 0.18 (quality term = 50+100×0.18 = 68, weight 0.25), earnings growth = 0.10 (growth term = 50+100×0.10 = 60, weight 0.25), and analyst net-buy ratio = 0.5 (analyst term = 50+25×0.5 = 62.5, weight 0.20). Compute the full weighted fundamentals score.',
            correctAnswer: '65.25',
            explanation:
              '0.30×70 + 0.25×68 + 0.25×60 + 0.20×62.5 = 21 + 17 + 15 + 12.5 = **65.25** — a genuinely blended score across all four independent inputs, the same mechanic as the technical composite score (Level 2) applied to fundamentals data instead.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'Forward P/E = -8 (the company is currently unprofitable on a forward basis). What is the valuation term, and why is it NOT computed as 100 − 2×(−8) = 116?',
            correctAnswer: '20 (flat penalty, not the formula)',
            explanation:
              'When forward P/E is negative or zero, the formula flatly assigns **20** rather than running the `100 − 2·P/E` formula through — plugging a negative P/E into that formula would nonsensically REWARD unprofitability with a high score (116, clamped to 100), which is the opposite of the intended signal. The flat 20 explicitly treats "currently unprofitable" as a real penalty, not an edge case the formula happens to get backwards.'
          },
          {
            id: 'q3',
            type: 'calculation',
            prompt:
              'Analyst recommendations: strongBuy=8, buy=5, hold=3, sell=1, strongSell=0 (total=17). Compute the net buy-lean ratio and the resulting analyst term (round to nearest whole number).',
            correctAnswer: 'ratio ≈ 1.18, term ≈ 79',
            explanation:
              '(2×8 + 5 − 1 − 2×0) / 17 = (16+5−1)/17 = 20/17 ≈ 1.176. term = 50 + 25×1.176 ≈ 50 + 29.4 ≈ **79** — a strongly buy-leaning consensus produces a term well above 50.'
          },
          {
            id: 'q4',
            type: 'multiple-choice',
            prompt:
              'A small-cap stock has no analyst coverage at all (no recommendations exist), but does have forward P/E, ROE, and earnings-growth data. What happens to its fundamentals score?',
            options: [
              'The analyst term is dropped and the remaining three weights (0.30+0.25+0.25=0.80) are re-normalized to sum to 1, so the score is still fully meaningful using just those three inputs',
              'The score cannot be computed at all without analyst coverage',
              'The missing analyst term defaults to 0, dragging the score down artificially',
              'The stock is automatically excluded from the watchlist'
            ],
            correctAnswer:
              'The analyst term is dropped and the remaining three weights (0.30+0.25+0.25=0.80) are re-normalized to sum to 1, so the score is still fully meaningful using just those three inputs',
            explanation:
              'This is the exact same null-guarding/re-normalization pattern as the technical composite score (Level 2) — a missing input is excluded and the rest re-weighted to still sum to 100%, rather than defaulting to a value that would silently bias the result.'
          }
        ]
      },
      {
        id: 'l7-why-independent',
        title: 'Why it is not blended into the technical score',
        theory:
          '## Two different questions, deliberately kept separate\n\n' +
          'The technical composite score (Level 2) answers "is this technically oversold right now" — pure price/volume behavior, with zero awareness of whether the underlying business is actually any good. The fundamentals score answers a completely different question: "is this a cheap, profitable, growing business that analysts like." A stock can score high on one and low on the other — a fundamentally excellent company can be technically overbought, and a fundamentally mediocre one can be technically oversold. Blending the two into one number would hide exactly the information a user most needs: *which* kind of attractive (or unattractive) a name currently is.\n\n' +
          '## The rollout precedent\n\n' +
          'Just like the ETF TER field when it was first added (Level 6), the fundamentals score is deliberately "plumbing only for now" — computed, cached, and shown alongside the technical score, but **not yet folded into the EV ranking**. This is a considered, cautious rollout: see how the real numbers behave across real symbols first, then decide later (with actual data in hand) whether and how to combine it with everything else — rather than guessing at a blending formula up front.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Why are the technical and fundamentals scores kept as two separate numbers instead of one blended score?',
            options: [
              'They answer genuinely different questions ("is this oversold right now" vs. "is this a good business at a fair price"), and blending them would hide which kind of attractive a name currently is',
              'They use incompatible units and cannot mathematically be combined',
              'The fundamentals score is less accurate, so it is kept separate to avoid contaminating the technical score',
              'Regulatory rules require them to be reported separately'
            ],
            correctAnswer:
              'They answer genuinely different questions ("is this oversold right now" vs. "is this a good business at a fair price"), and blending them would hide which kind of attractive a name currently is',
            explanation:
              'A stock can be fundamentally excellent but technically overbought, or vice versa — collapsing that distinction into one number destroys real information.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'What is the current role of the fundamentals score in the EV ranking (Level 3)?',
            options: [
              'It is not yet used in ranking at all — shown for context only, following the same cautious rollout precedent as the ETF TER field',
              'It fully replaces the technical score in ranking',
              'It is averaged 50/50 with the composite score',
              'It only affects the exit machine, never the buy decision'
            ],
            correctAnswer:
              'It is not yet used in ranking at all — shown for context only, following the same cautious rollout precedent as the ETF TER field',
            explanation:
              'A deliberate "compute and observe before deciding how to use it" rollout, consistent with how TER was introduced.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'A stock has technical composite score = 78 (strongly oversold, technically attractive) but fundamentals score = 25 (expensive, unprofitable, poor analyst consensus). If the two scores were naively averaged into one number (≈51.5), what real information would be lost compared to seeing both separately?',
            options: [
              'The distinction between "technically cheap but a genuinely bad business" and "moderately attractive on both dimensions" — both scenarios could produce the same ~51.5 blended number',
              'Nothing would be lost — averaging always preserves the same information as two separate numbers',
              "Only the technical score's information would be lost, never the fundamentals score's",
              'The blended number would actually be MORE informative than either score alone'
            ],
            correctAnswer:
              'The distinction between "technically cheap but a genuinely bad business" and "moderately attractive on both dimensions" — both scenarios could produce the same ~51.5 blended number',
            explanation:
              'A single blended number of ~51.5 is indistinguishable from a stock that scores ~51.5 on both dimensions individually — a completely different, much less informative situation. Keeping the two numbers separate is precisely what preserves the ability to tell these two very different stories apart.'
          }
        ]
      }
    ]
  },
  {
    id: 'level-8',
    title: 'Level 8 — Certification track: complex instruments',
    description:
      "Educational preparation for the real knowledge/appropriateness tests Nordic brokers require before trading leveraged ETFs, certificates, warrants, and mini-futures — real regulatory grounding (MiFID II, ESMA), not a copy of any broker's actual quiz.",
    lessons: [
      {
        id: 'l8-disclaimer',
        title: 'What this track is (and is not)',
        theory:
          '## What this is\n\n' +
          "A conceptual introduction to the real mechanics behind leveraged ETFs, mini-futures/turbo warrants, certificates, and options/warrants — the categories of instrument that Nordic brokers (Nordnet, Avanza, Nordea and others) legally must gate behind a knowledge/appropriateness test before you can trade them. The material here is grounded in real, cited sources: Nordnet's own public FAQ on its knowledge tests, the EU's MiFID II framework (Article 25 appropriateness assessment), ESMA's published guidance on why leverage is treated as inherent complexity, and Nordnet's own Academy page on mini futures.\n\n" +
          '## What this is *not*\n\n' +
          "- **Not** a copy of Nordnet's, Avanza's, or any broker's actual test — those exact questions are not public, and this track does not pretend otherwise.\n" +
          "- **Not** official certification — passing these lessons/quizzes does not certify you with Nordnet or satisfy any broker's actual appropriateness test. Nothing here is submitted anywhere.\n" +
          '- **Not** investment advice on whether you *should* trade these instruments — only an explanation of how they actually work, so that if/when you do encounter a real test (or these instruments themselves), you understand the mechanics rather than guessing.',
        furtherReading: [
          {
            title: 'Nordnet — FAQ on knowledge tests (kunskapstest)',
            url: 'https://www.nordnet.se/faq/handel-vardepapper/handelsinformation/svar-pa-fragor-om-de-nya-kunskapstesten'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Does completing this Level 8 track officially certify you to trade complex instruments on Nordnet?',
            options: [
              'No — this is independent educational preparation, not an official test, and nothing here is submitted to Nordnet',
              'Yes — it automatically unlocks trading permissions',
              'Yes, but only for leveraged ETFs specifically',
              'It replaces the need for any broker-side test'
            ],
            correctAnswer:
              'No — this is independent educational preparation, not an official test, and nothing here is submitted to Nordnet',
            explanation:
              'This track exists purely to build real understanding — any actual broker certification process is separate and unaffected by this content.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'You pass every quiz in this Level 8 track with 100%. You then try to place a real order for a mini future on Nordnet for the first time. What should you actually expect?',
            correctAnswer:
              'Nordnet will still require you to pass ITS OWN real knowledge test on its platform before the order can go through — this Academy track does not bypass that',
            options: [
              'Nordnet will still require you to pass ITS OWN real knowledge test on its platform before the order can go through — this Academy track does not bypass that',
              'Nordnet will automatically detect your Academy score and skip its own test',
              'The order will be blocked permanently regardless of any test',
              'Mini futures never require any test on Nordnet'
            ],
            explanation:
              "This track and Nordnet's actual, official kunskapstest are completely separate systems — understanding the real mechanics here is valuable preparation, but it has no technical or contractual link to Nordnet's own gatekeeping process."
          }
        ]
      },
      {
        id: 'l8-mifid-appropriateness',
        title: 'Why these tests exist: MiFID II appropriateness assessment',
        theory:
          '## The legal basis\n\n' +
          'Nordic brokers gate complex instruments behind a knowledge test because of **MiFID II Article 25(3)** (implemented in Sweden via the Securities Market Act) — for "execution-only" (non-advised) trading, an investment firm must assess whether a client has sufficient knowledge and experience to understand the risks of a given product before allowing the trade, and must warn the client if it appears the product may not be appropriate for them.\n\n' +
          '## Why leverage specifically triggers this\n\n' +
          "ESMA (the EU's securities regulator) has explicitly stated that leveraged structures should be regarded as complex \"by virtue of the leverage effect, since the average retail investor would find this feature challenging to understand.\" The regulatory concern isn't that these products are exotic for its own sake — it's that retail investors systematically underestimate how leverage interacts with volatility and time (Level 8, next lesson makes this concrete with real numbers).\n\n" +
          "## What is and isn't covered\n\n" +
          'Plain shares and standard UCITS funds can be traded execution-only without this test — it applies specifically to instruments regulators classify as complex: leveraged ETFs, certificates, warrants, mini-futures, standardized options, and similar. This is not a Nordnet-specific invention — Avanza and Nordea implement functionally equivalent tests for the same categories, since all three are executing the same EU-wide regulatory requirement.',
        furtherReading: [
          {
            title:
              'ESMA — Article 25, Assessment of suitability and appropriateness',
            url: 'https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mifid-ii/article-25-assessment-suitability-and'
          },
          {
            title:
              'Markets in Financial Instruments Directive 2014 (MiFID II) — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Markets_in_Financial_Instruments_Directive_2014'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              "What EU regulation requires brokers to assess a client's knowledge before allowing them to trade complex instruments execution-only?",
            options: [
              'MiFID II, Article 25(3) (the appropriateness assessment)',
              'GDPR',
              'PRIIPs Regulation only',
              'There is no such requirement — it is purely a Nordnet policy'
            ],
            correctAnswer:
              'MiFID II, Article 25(3) (the appropriateness assessment)',
            explanation:
              'This is the actual legal basis Nordnet itself cites, implemented into Swedish law via the Securities Market Act.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'According to ESMA, what specifically makes leveraged products "complex" enough to require this test?',
            options: [
              'The leverage effect itself — the average retail investor is considered likely to find how leverage interacts with volatility and time genuinely hard to understand',
              'Their price is too high for retail investors',
              'They are only sold to institutional clients',
              'They have no regulatory oversight at all'
            ],
            correctAnswer:
              'The leverage effect itself — the average retail investor is considered likely to find how leverage interacts with volatility and time genuinely hard to understand',
            explanation:
              "This is ESMA's own stated reasoning — leverage, not exoticism for its own sake, is the trigger for complex-instrument treatment."
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt: 'Is the knowledge-test requirement unique to Nordnet?',
            options: [
              'No — Avanza and Nordea implement functionally equivalent tests for the same categories, since all three follow the same EU-wide MiFID II requirement',
              'Yes — it is a Nordnet-only competitive feature',
              'No other Nordic broker has any equivalent process',
              'It only applies to Swedish citizens, not other Nordic residents'
            ],
            correctAnswer:
              'No — Avanza and Nordea implement functionally equivalent tests for the same categories, since all three follow the same EU-wide MiFID II requirement',
            explanation:
              'This is standard Nordic-market MiFID II implementation, not a broker-specific policy.'
          }
        ]
      },
      {
        id: 'l8-leveraged-etf-decay',
        title: 'Leveraged ETFs: daily rebalancing & volatility decay',
        theory:
          '## The mechanic: daily reset, not "multiply the whole-period return"\n\n' +
          'A "2x" leveraged ETF targets 2× the index\'s **daily** return — and rebalances its exposure back to exactly 2× at the close of every single trading day. It does **not** target 2× the return over any longer holding period, and this distinction is the single most important (and most commonly misunderstood) fact about these products.\n\n' +
          '## A concrete worked example\n\n' +
          'Suppose an index goes: 100 → 90 (−10%) → 100 (+11.11%), ending back exactly flat over two days. A 2x leveraged ETF over the same two days: 100 → 80 (−20%, i.e. 2×−10%) → 97.78 (+22.22%, i.e. 2×+11.11%). The index ended **completely flat**, but the 2x fund ended **down about 2.2%** — pure "volatility decay," created entirely by the daily reset compounding losses and gains asymmetrically. The more volatile and choppy (sideways) the underlying, and the higher the leverage multiple, the worse this decay becomes — in a genuinely choppy, flat market, a 3x fund can lose a large fraction of its value over time even while the underlying index goes precisely nowhere.\n\n' +
          '## The practical implication\n\n' +
          "This is exactly why these products are explicitly designed and marketed for **short-term, often intraday-to-few-day** directional trades — not buy-and-hold. Holding one through an extended choppy or sideways stretch is one of the most reliable ways to lose money on a position where the underlying asset itself didn't even move against you.",
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "An index goes 100 → 90 (Day 1) → 100 (Day 2), ending flat. Compute the 2x leveraged ETF's value after Day 1 and Day 2 (2 decimal places), and its total % change over the two days.",
            correctAnswer: 'Day 1: 80.00, Day 2: 97.78, total change: -2.22%',
            explanation:
              'Day 1: index −10% → ETF −20% → 100×0.80 = **80.00**. Day 2: index +11.11% → ETF +22.22% → 80×1.2222 ≈ **97.78**. Total change: 97.78/100 − 1 = **−2.22%**, even though the index itself ended perfectly flat.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why can a 2x leveraged ETF lose money over a period where its underlying index ends completely flat?',
            options: [
              'Daily rebalancing means gains and losses compound asymmetrically day over day — this "volatility decay" accumulates in choppy/sideways markets independent of the index\'s net move',
              'The fund manager charges an unusually high fee that erases the leveraged gains',
              'This cannot actually happen — a flat index always produces a flat leveraged ETF',
              'It only happens when the index is trending strongly in one direction'
            ],
            correctAnswer:
              'Daily rebalancing means gains and losses compound asymmetrically day over day — this "volatility decay" accumulates in choppy/sideways markets independent of the index\'s net move',
            explanation:
              'This is precisely the mechanism the worked example demonstrates — it is a structural feature of daily-reset leverage, not a fee or a special/rare case.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'What holding period are leveraged ETFs generally designed and marketed for?',
            options: [
              'Short-term (often intraday to a few days), not buy-and-hold',
              'Multi-year buy-and-hold, exactly like a standard index fund',
              'Retirement-account holding periods of 10+ years',
              'There is no recommended holding period — all periods behave identically'
            ],
            correctAnswer:
              'Short-term (often intraday to a few days), not buy-and-hold',
            explanation:
              'The daily-reset decay mechanic makes them structurally unsuited to long holding periods through choppy markets.'
          }
        ]
      },
      {
        id: 'l8-mini-futures',
        title: 'Mini futures & turbo warrants: knock-out and financing level',
        theory:
          '## The structure\n\n' +
          'A mini future gives leveraged exposure to an underlying (index, stock, commodity, FX) via a **financing level** (the "borrowed" portion of the notional exposure funded by the issuer) plus a **knock-out/stop-loss level** set near that financing level. Unlike a leveraged ETF, leverage here is **not fixed** — it changes continuously as the underlying moves (leverage falls as your equity stake in the position grows, and rises as it shrinks), and per Nordnet\'s own Academy material, mini futures/Unlimited Turbos are specifically structured to avoid the same daily-rebalancing erosion effect that hits leveraged ETFs and Bull & Bear certificates — a real structural difference worth knowing.\n\n' +
          '## The knock-out risk\n\n' +
          'If the underlying touches the knock-out/stop-loss barrier, the product is **automatically terminated** — and depending on the issuer\'s execution of the closing trade, you may receive a small residual value or, in some cases, **zero**. Total loss of the invested capital is a real, explicit possibility, notwithstanding the "built-in stop-loss" framing.\n\n' +
          '## The financing cost\n\n' +
          'A **daily financing cost** (effectively an implicit interest charge on the leveraged/borrowed portion) is deducted continuously by nudging the financing level upward each day — an ongoing carrying cost, separate from and in addition to any decay-type effect.',
        furtherReading: [
          {
            title: 'Nordnet Academy — What are Mini Futures?',
            url: 'https://www.nordnet.se/academy/mini-futures'
          },
          {
            title: 'Turbo warrant — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Turbo_warrant'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "A Mini Long on an underlying trading at 100 has a financing level of 80. Using the simplified parity relationship `miniFutureValue = underlyingPrice − financingLevel` and `effectiveLeverage = underlyingPrice / miniFutureValue`, compute today's mini future value and effective leverage. Then the underlying rises to 115 (financing level unchanged for this exercise). Recompute the mini future value and effective leverage, and state whether leverage rose or fell as the position gained value.",
            correctAnswer: 'Value 20→35, leverage 5.0x→3.29x, leverage fell',
            explanation:
              'Today: value = 100−80 = **20**, leverage = 100/20 = **5.0x**. After the rise: value = 115−80 = **35**, leverage = 115/35 ≈ **3.29x**. Leverage **fell** as the position gained value — exactly the "leverage changes continuously, decreasing as the position gains value" mechanic from the theory above, concretely demonstrated with real numbers rather than just asserted.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "What happens if the underlying asset touches a mini future's knock-out/stop-loss barrier?",
            options: [
              'The product is automatically terminated, and the holder may receive a small residual value or, in some cases, zero — total loss is a real possibility',
              'Nothing — the position simply continues at reduced leverage',
              'The broker automatically extends the financing level to prevent termination',
              'The position converts into a regular share'
            ],
            correctAnswer:
              'The product is automatically terminated, and the holder may receive a small residual value or, in some cases, zero — total loss is a real possibility',
            explanation:
              'The "built-in stop-loss" framing should not be mistaken for a guarantee of meaningful recovered value.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "How does a mini future's leverage behave as the underlying moves, compared to a leveraged ETF's fixed daily-reset multiple?",
            options: [
              'It changes continuously — decreasing as the position gains value, increasing as it loses value — rather than being reset to a fixed multiple each day',
              "It is identical to a leveraged ETF's mechanic",
              'It is always fixed at exactly 2x for the life of the product',
              'Leverage only changes once per year'
            ],
            correctAnswer:
              'It changes continuously — decreasing as the position gains value, increasing as it loses value — rather than being reset to a fixed multiple each day',
            explanation:
              "This is a genuinely different mechanic from the leveraged-ETF daily reset covered in the previous lesson — and exactly what q1's worked example just demonstrated numerically."
          },
          {
            id: 'q4',
            type: 'multiple-choice',
            prompt:
              'What ongoing cost is specific to mini futures, separate from any decay-type effect?',
            options: [
              'A daily financing cost on the leveraged/borrowed portion, deducted by nudging the financing level upward each day',
              'A one-time upfront commission only',
              'A currency conversion fee charged only at knock-out',
              'There is no ongoing cost beyond the initial purchase'
            ],
            correctAnswer:
              'A daily financing cost on the leveraged/borrowed portion, deducted by nudging the financing level upward each day',
            explanation:
              'This is effectively an implicit interest charge for the borrowed exposure, distinct from the knock-out risk itself.'
          }
        ]
      },
      {
        id: 'l8-certificates',
        title: 'Certificates vs. funds: issuer/counterparty risk',
        theory:
          '## A structural distinction that matters more than it sounds\n\n' +
          "A certificate (a tracker, a Bull & Bear certificate, a credit certificate) is a **debt instrument — a bond-like note issued by a bank or issuer** — that promises a payout linked to an underlying asset's performance. It is fundamentally *not* a fund that actually holds the underlying assets in a legally segregated, ring-fenced structure the way a regulated UCITS fund does.\n\n" +
          '## Why this matters: issuer/counterparty credit risk\n\n' +
          "Because a certificate is really just a promise from the issuing bank, if that issuer becomes insolvent, a holder can lose the **entire invested amount regardless of how the underlying asset actually performed** — even if the underlying index went up the whole time, an insolvent issuer can still mean a total loss. This risk simply does not exist in the same form for a genuine fund, where the fund's assets are legally separated from the fund manager's own balance sheet and are not exposed to the manager's own solvency.\n\n" +
          '## The practical takeaway\n\n' +
          'When evaluating a certificate, "which underlying does this track" is only half the picture — "which bank issued this, and do I trust their solvency" is the other half, and it is a question that simply doesn\'t apply in the same way to an ordinary fund.',
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt: 'What is a certificate structurally, as opposed to a fund?',
            options: [
              'A debt instrument (a bond-like note) issued by a bank, promising a payout linked to an underlying — not a fund holding the actual assets in a segregated structure',
              'Exactly the same legal structure as a UCITS fund, just with a different name',
              'A type of insurance product',
              'A physical share certificate for direct stock ownership'
            ],
            correctAnswer:
              'A debt instrument (a bond-like note) issued by a bank, promising a payout linked to an underlying — not a fund holding the actual assets in a segregated structure',
            explanation:
              'This is the key structural fact that drives the issuer-risk difference from a genuine fund.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "If a certificate's underlying index rose 20% over its holding period, but the issuing bank became insolvent, what can happen to the holder?",
            options: [
              "The holder can still lose the entire invested amount, because the payout depended on the issuer's own solvency, not directly on holding the underlying assets",
              "The holder is fully protected regardless of the issuer's solvency, since the underlying performed well",
              'This scenario is impossible by regulation',
              'The holder automatically receives the underlying assets directly instead of cash'
            ],
            correctAnswer:
              "The holder can still lose the entire invested amount, because the payout depended on the issuer's own solvency, not directly on holding the underlying assets",
            explanation:
              'This is exactly the issuer/counterparty risk that distinguishes a certificate from a real fund holding segregated assets.'
          },
          {
            id: 'q3',
            type: 'calculation',
            prompt:
              'You hold a $10,000 certificate tracking an index that ends up 15% at maturity (nominal payout would be $11,500). The issuing bank has since entered insolvency proceedings, with bondholders (which is effectively what you are) expected to recover 30 cents per dollar of claim. Approximately how much would you actually receive, and how does this compare to holding the same index gain via a genuine segregated-assets fund instead?',
            correctAnswer: '≈$3,450 vs the full $11,500 in a genuine fund',
            explanation:
              '$11,500 × 0.30 ≈ **$3,450** — a huge shortfall versus the full $11,500 a genuine fund would have delivered, PURELY because of issuer insolvency, with the underlying index performance being completely irrelevant to this outcome. This is the concrete, numeric version of "which bank issued this, and do I trust their solvency" mattering as much as the underlying itself.'
          }
        ]
      },
      {
        id: 'l8-warrants-options',
        title: 'Warrants & options basics',
        theory:
          '## The right, not the obligation\n\n' +
          'A warrant (or option) gives the holder the **right, but not the obligation**, to buy or sell an underlying asset at a predetermined ("strike") price by or on a set maturity date. A **turbo warrant** adds a knock-out barrier feature similar to a mini future (Level 8, previous lesson) — Nordnet itself describes these as "very high risk, specifically developed for active short-term trading," not an instrument category meant for passive holding.\n\n' +
          '## Why pricing is genuinely harder to reason about\n\n' +
          "Unlike a share, a warrant/option's price is driven not just by the underlying's price but by **time decay** (the closer to maturity with no favorable move, the less time value remains) and **implied volatility** (the market's expectation of future price swings) — both of which behave in ways that are not intuitive to most retail investors. This is exactly why ESMA and MiFID II treat any leverage/optionality-based structure as inherently complex (Level 8, earlier lesson): the core issue is not that the products are exotic for its own sake, but that the *interaction* of leverage, time, and volatility routinely produces outcomes that diverge sharply from what a simple \"the underlying went up/down by X%, so I should have made/lost roughly X%\" intuition would predict.",
        furtherReading: [
          {
            title: 'Option (finance) — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Option_(finance)'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt: 'What does a warrant give its holder?',
            options: [
              'The right, but not the obligation, to buy or sell the underlying at a predetermined strike price by a set maturity date',
              'Direct, immediate ownership of the underlying shares',
              "A guaranteed fixed return regardless of the underlying's price",
              'Voting rights in the issuing company'
            ],
            correctAnswer:
              'The right, but not the obligation, to buy or sell the underlying at a predetermined strike price by a set maturity date',
            explanation:
              'This "right, not obligation" framing is the core definition shared by warrants and options.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "Beyond the underlying's price, what two factors make warrant/option pricing behave in non-intuitive ways?",
            options: [
              'Time decay and implied volatility',
              'Currency exchange rates and dividend dates only',
              "The broker's own commission schedule",
              'Nothing else — price moves exactly proportional to the underlying'
            ],
            correctAnswer: 'Time decay and implied volatility',
            explanation:
              'These two forces are exactly why regulators treat leverage/optionality-based products as inherently complex — the simple "underlying moved X%, so I made/lost X%" intuition breaks down.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "A call warrant has only 2 trading days left before maturity. The underlying then genuinely rises 5% in a single day — a real, favorable move in the right direction. Is it guaranteed that the warrant's price rises by a proportional (leveraged) amount?",
            options: [
              'No — with so little time left, rapid time decay and/or a drop in implied volatility could partly or fully offset the favorable underlying move, so the warrant could underperform, and could even fall in price despite the "right" move happening',
              'Yes — a favorable underlying move always translates into a proportional warrant gain, guaranteed',
              'No — the warrant automatically expires worthless the instant there are 2 days left, regardless of price action',
              'Time decay and implied volatility only matter for put warrants, never for calls'
            ],
            correctAnswer:
              'No — with so little time left, rapid time decay and/or a drop in implied volatility could partly or fully offset the favorable underlying move, so the warrant could underperform, and could even fall in price despite the "right" move happening',
            explanation:
              'This is precisely the "interaction of leverage, time, and volatility routinely produces outcomes that diverge sharply from intuition" point from the theory above — near maturity, time decay accelerates, and a simultaneous drop in implied volatility can eat into or even overwhelm gains from a genuinely correct directional call. This counterintuitive possibility is exactly the kind of thing a real appropriateness test is trying to confirm you understand.'
          }
        ]
      }
    ]
  },
  {
    id: 'level-9',
    title: 'Level 9 — Reading charts & screening with TradingView',
    description:
      "The manual counterpart to the engine: how to read a candle, what TradingView actually gives you, how to read a financials page, and how a trend-following screen like Minervini's works — including an honest account of where it disagrees with this engine.",
    lessons: [
      {
        id: 'l9-candles',
        title: 'Reading candlesticks',
        glossaryRef: 'yang-zhang',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## Four numbers per bar\n\n' +
          'Every candle encodes one period as four numbers — **open, high, low, close** (OHLC):\n\n' +
          '```\n' +
          '        │  ← upper wick: high\n' +
          '      ┌─┴─┐\n' +
          '      │   │ ← body: open to close\n' +
          '      └─┬─┘   (filled/red = close < open,\n' +
          '        │      hollow/green = close > open)\n' +
          '        │  ← lower wick: low\n' +
          '```\n\n' +
          'The **body** is where the period started and finished; the **wicks** are where price went but did not stay. That distinction is the whole point — a close tells you the outcome, a wick tells you what was attempted and rejected.\n\n' +
          '## What a wick actually says\n\n' +
          '| Shape | Reading |\n' +
          '| --- | --- |\n' +
          '| Long upper wick, small body | Buyers pushed up and were sold into — supply above |\n' +
          '| Long lower wick, small body | Sellers pushed down and were bought — demand below |\n' +
          '| Tiny body, wicks both sides (**doji**) | Genuine indecision; open ≈ close |\n' +
          '| Large body, negligible wicks (**marubozu**) | One side controlled the whole period |\n\n' +
          "Two-bar shapes worth knowing: a **bullish engulfing** (a down bar entirely covered by the next up bar's body), a **hammer** (long lower wick after a decline), a **shooting star** (long upper wick after an advance), an **inside bar** (range contained within the prior bar — a pause), and an **outside bar** (range covering it — an expansion).\n\n" +
          '## The honest caveat\n\n' +
          'Single-candle patterns are **weak standalone signals**. Their published hit rates barely differ from chance once you account for how many patterns you could have looked for. What they are genuinely good for is *context at a level you already care about*: a hammer at the 200-day average means something; the same hammer in the middle of nowhere does not. Treat a candle as evidence about who won a fight at a specific price, never as a reason to trade on its own.\n\n' +
          '## Where this engine uses OHLC\n\n' +
          'The indicators in Level 1 all run on **closes only** — SMA, RSI, MACD, Bollinger. But `OhlcService` does fetch full bars, for one specific job: volatility. `garmanKlass` and `yangZhang` estimate daily σ from the *whole bar* rather than close-to-close, and are roughly **7–8× more statistically efficient** as a result — precisely because the high and low carry information the close throws away. Yang-Zhang additionally handles the overnight gap (`ln(open / previous close)`), which is why it is the estimator used for the stop, target and trailing bands on owned positions.\n\n' +
          'So when you look at a wick and think "the close hid what happened there", you are having exactly the insight that makes those estimators work.',
        furtherReading: [
          {
            title: 'Candlestick chart — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Candlestick_chart'
          },
          {
            title: 'Candlestick analysis on TradingView',
            url: 'https://www.tradingview.com/education/candlestick/'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'A daily bar has open 100, high 112, low 98, close 102. Compute the upper wick as a percentage of the full high-to-low range, rounded to the nearest whole percent.',
            correctAnswer: '71',
            explanation:
              "Upper wick = high − max(open, close) = 112 − 102 = 10. Full range = high − low = 112 − 98 = 14. 10/14 = 0.714 → **71%**. Nearly three-quarters of the day's range was territory price visited and gave back — the close alone (102, a modest gain) tells you none of that. This is the information the close discards and Garman-Klass/Yang-Zhang recover."
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why are the Garman-Klass and Yang-Zhang estimators more efficient than close-to-close volatility?',
            options: [
              'They use the intraday range (high/low, and for Yang-Zhang the overnight gap), so each bar contributes far more information than a single close-to-close difference',
              'They use a longer lookback window than close-to-close does',
              'They apply a smoothing filter that removes outliers',
              'They are computed on weekly rather than daily bars'
            ],
            correctAnswer:
              'They use the intraday range (high/low, and for Yang-Zhang the overnight gap), so each bar contributes far more information than a single close-to-close difference',
            explanation:
              'Efficiency here means "less estimation error for the same number of bars". Close-to-close uses one number per day; the OHLC estimators use four, including the extremes that define how much the price actually moved.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'A stock prints a textbook hammer (long lower wick, small body) in the middle of a range, at no notable level. How much weight should that carry on its own?',
            options: [
              'Very little — candle patterns are weak standalone signals; they matter as context at a level that already means something, not as reasons to trade',
              'A great deal — a hammer is a reliable reversal signal wherever it appears',
              'It should be treated as a confirmed buy once the next bar opens higher',
              'It is meaningless in all contexts and should always be ignored'
            ],
            correctAnswer:
              'Very little — candle patterns are weak standalone signals; they matter as context at a level that already means something, not as reasons to trade',
            explanation:
              'The pattern describes who won a fight at a price. If the price is not one you already cared about, the fight was not about anything. This is why the engine gates its own REVERSAL path on structure *plus* location (below the 200-day) *plus* capitulation volume, rather than on a shape alone.'
          }
        ]
      },
      {
        id: 'l9-tradingview-features',
        title: 'TradingView: the features and metrics that matter here',
        practiceSymbolDefault: 'APH',
        theory:
          '## Addressing a symbol: `EXCHANGE-TICKER`\n\n' +
          'Every TradingView instrument lives at `tradingview.com/symbols/EXCHANGE-TICKER/`, and it is **strict** about the exchange. `NASDAQ-AAL` resolves; `NYSE-AAL` is a 404 — American Airlines lists on Nasdaq. Dropping the exchange is not a safe shortcut either: a bare ticker resolves to whichever listing TradingView treats as primary, so bare `AIR` lands on **Airbus in Paris**, not the US-listed AAR Corp this watchlist tracks.\n\n' +
          "The share-class separator differs by region too — Yahoo's `BRK-B` is TradingView's `BRK.B`, but Yahoo's `ASSA-B.ST` is TradingView's `ASSA_B`. This is why the \"View on TradingView ↗\" link in an asset's **Style** tab is *built* from a mapping table rather than string-concatenated.\n\n" +
          '| Yahoo | TradingView |\n' +
          '| --- | --- |\n' +
          '| `AAPL` | `NASDAQ-AAPL` |\n' +
          '| `APH` | `NYSE-APH` |\n' +
          '| `BRK-B` | `NYSE-BRK.B` |\n' +
          '| `ASSA-B.ST` | `OMXSTO-ASSA_B` |\n' +
          '| `EXV1.DE` | `XETR-EXV1` |\n' +
          '| `NOVO-B.CO` | `OMXCOP-NOVO_B` |\n\n' +
          '## The features worth your time\n\n' +
          '- **Timeframes.** Daily is what this engine stores. Switch to **weekly** when you want trend rather than noise — a 30-week weekly average is the classic stage-analysis reference, and it is far harder to fake with one good day.\n' +
          '- **Built-in indicators.** RSI, MACD, Bollinger Bands and moving averages are all there. See the parameter warning below.\n' +
          '- **Alerts.** Price or indicator conditions that notify you. Useful for the levels this engine already computes: a stop, a target, a 200-day cross.\n' +
          '- **Bar replay.** Rewinds the chart and steps forward bar by bar, hiding the future. The only honest way to practise reading a setup — a chart you have already seen the outcome of teaches you nothing.\n' +
          "- **Screener.** Cross-sectional filtering across the market. Level 9's last lesson uses this.\n" +
          '- **Pine Script.** The escape hatch when a built-in cannot express your rule.\n\n' +
          '## Warning: the same indicator name is not the same number\n\n' +
          "To compare a TradingView reading with this engine's, you must set the parameters to match:\n\n" +
          '| Engine | Setting |\n' +
          '| --- | --- |\n' +
          '| RSI | period **14**, Wilder smoothing |\n' +
          '| MACD | **12 / 26 / 9** on EMA |\n' +
          '| Bollinger | period **20**, **2** standard deviations |\n' +
          '| Trend | SMA **50** and SMA **200** |\n\n' +
          'Defaults usually match, but not always, and a length-9 RSI against a length-14 RSI will simply disagree — that is not a bug in either.\n\n' +
          '## Where definitions genuinely differ\n\n' +
          'TradingView\'s **"Perf %"** columns and this engine\'s `return1yPct` are not computed the same way. The engine walks its stored history to the last point on or before the cutoff date (a calendar-anchored lookup, which is what fixed the Eli Lilly discrepancy), and it uses close prices without dividends. Vendors vary on both the anchor and whether distributions are included. Expect small disagreements, and when they are large, check the anchor date before assuming a bug.',
        furtherReading: [
          {
            title: 'TradingView Help Center',
            url: 'https://www.tradingview.com/support/'
          },
          {
            title: 'TradingView charts',
            url: 'https://www.tradingview.com/chart/'
          },
          {
            title: 'Pine Script documentation',
            url: 'https://www.tradingview.com/pine-script-docs/welcome/'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt:
              'Why does the app build TradingView URLs from a mapping table rather than just appending the ticker?',
            options: [
              'TradingView 404s on a wrong exchange prefix, and a bare ticker silently resolves to whichever listing it considers primary — so bare `AIR` opens Airbus in Paris rather than the US-listed AAR Corp',
              'TradingView requires an API key embedded in the URL',
              'The mapping table is needed to translate company names into tickers',
              'Ticker symbols change too frequently to be used directly'
            ],
            correctAnswer:
              'TradingView 404s on a wrong exchange prefix, and a bare ticker silently resolves to whichever listing it considers primary — so bare `AIR` opens Airbus in Paris rather than the US-listed AAR Corp',
            explanation:
              'The silent-wrong-symbol case is the dangerous one: a 404 is obvious, but a chart of the wrong company looks completely normal. The watchlist holds `AIR`, `AIR.DE` and `AIR.PA` simultaneously, which is exactly when this bites.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "You add RSI on TradingView and it reads 41, while this app's watchlist shows RSI 47 for the same symbol on the same day. What should you check first?",
            options: [
              'The indicator parameters — the engine uses period 14 with Wilder smoothing, and a different length or smoothing method will legitimately produce a different number',
              'Whether the engine has a calculation bug, since RSI is unambiguous',
              'Whether the stock split recently, which is the only cause of RSI disagreement',
              'Nothing — RSI is a proprietary metric and the two are not comparable'
            ],
            correctAnswer:
              'The indicator parameters — the engine uses period 14 with Wilder smoothing, and a different length or smoothing method will legitimately produce a different number',
            explanation:
              'Indicator names are not standards. Matching parameters is the precondition for any comparison — only once they match is a disagreement worth investigating.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'What makes bar replay more useful for practice than simply scrolling back on a chart?',
            options: [
              'It hides the future and steps forward bar by bar, so you decide without already knowing the outcome',
              'It uses higher-resolution data than the normal chart',
              'It automatically labels the correct entry and exit points',
              "It applies the engine's indicators automatically"
            ],
            correctAnswer:
              'It hides the future and steps forward bar by bar, so you decide without already knowing the outcome',
            explanation:
              "Reading a chart whose outcome you already know is the discretionary version of an in-sample backtest: it will make almost any method look obvious. Level 5's out-of-sample lesson makes the same argument in numbers."
          }
        ]
      },
      {
        id: 'l9-financials',
        title: 'Reading the Financials tab',
        glossaryRef: 'fundamentals-score',
        practiceSymbolDefault: 'APH',
        theory:
          '## Four panels, four questions\n\n' +
          "A symbol's **Financials** page condenses the statements into four charts. Each answers a different question, and each has an **Annual / Quarterly** toggle that matters more than it looks.\n\n" +
          '### 1. Performance — is the business growing, and does growth reach the bottom line?\n\n' +
          "Revenue and net income as bars, with **net margin %** as a line on its own axis. The line is the part people skip and shouldn't:\n\n" +
          '- Revenue up, **margin flat** → growth is being bought with proportional cost. Fine, but not leverage.\n' +
          '- Revenue up, **margin rising** → each new dollar of sales is more profitable than the last. This is operating leverage, and it is what compounds.\n' +
          '- Revenue up, **margin falling** → discounting, cost inflation, or a mix shift into worse business.\n\n' +
          '### 2. Revenue to profit conversion — where does the money go?\n\n' +
          'A waterfall from the top line down:\n\n' +
          '```\n' +
          'Revenue → (−COGS) → Gross profit → (−Op expenses) → Op income\n' +
          '        → (±Non-op income/expenses) → (−Taxes) → Net income\n' +
          '```\n\n' +
          'Read the *step sizes*, not just the endpoint. A large COGS step is a low-gross-margin business; a large Op-expenses step means heavy R&D or SG&A. Comparing the same waterfall year over year shows whether operating expenses are growing slower than gross profit — the mechanical source of margin expansion.\n\n' +
          '### 3. Debt level and coverage — can they carry it?\n\n' +
          'Three series: **debt**, **free cash flow**, and **cash & equivalents**. Debt on its own says almost nothing — a large, stable, cash-generative business can carry a lot. The question is coverage: roughly *how many years of current free cash flow would repay the debt*, and is that ratio improving or deteriorating. Rising debt alongside rising FCF is very different from rising debt with flat FCF.\n\n' +
          '### 4. Earnings — is the company beating what was expected?\n\n' +
          'Actual EPS against consensus estimate per period, plus the **next report date**. Two things matter: the pattern of beats and misses, and the fact that a report is imminent. A position entered days before earnings is a bet on an announcement, not on the setup you analysed.\n\n' +
          '## Annual vs Quarterly\n\n' +
          "Annual is for judging the business; **quarterly is for spotting acceleration**. Growth screens in the O'Neil/Minervini tradition are built on *recent quarterly* earnings and sales growth versus the year-ago quarter, precisely because an annual figure smooths away the inflection you are looking for.\n\n" +
          '## What the engine does and does not do with this\n\n' +
          '`FundamentalsService` fetches a small snapshot from Yahoo — **forward P/E, return on equity, debt-to-equity, trailing earnings growth, analyst net-buy ratio** — and reduces it to a 0–100 score (weights: valuation 0.30, quality 0.25, growth 0.25, analyst 0.20; Level 7 covers the math).\n\n' +
          'Be clear about its status: that score is **carried on every candidate but is not used in ranking**. The code says so — `StrategyCandidate.fundamentalsScore` is annotated *"Plumbing only for now — not yet used in ranking."* The expected-value ordering that produces the strategies is purely technical: reach probability, target gain, stop distance.\n\n' +
          'So the Financials tab is not a nicer view of something the engine already decides. It is where the fundamental judgement happens **manually**, today. The engine will happily rank a deteriorating business highly if its price geometry looks good.',
        furtherReading: [
          {
            title: 'Example: Amphenol financial statements on TradingView',
            url: 'https://www.tradingview.com/symbols/NYSE-APH/financials-overview/'
          },
          {
            title: 'Investing basics — Investor.gov (SEC)',
            url: 'https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "A company reports revenue 24.0B and net income 4.5B. The prior year it reported revenue 18.0B and net income 3.06B. Compute this year's net margin as a percentage, rounded to one decimal.",
            correctAnswer: '18.8',
            explanation:
              'Net margin = net income / revenue = 4.5 / 24.0 = 0.1875 → **18.8%**. The prior year was 3.06/18.0 = 17.0%, so revenue grew 33% *and* margin expanded ~1.8 points — the "each new dollar of sales is more profitable" case. Revenue growth alone would not have told you that.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "A company's debt rose 40% year over year. What does the Debt level and coverage panel need to show before you can judge whether that is a problem?",
            options: [
              'Free cash flow and cash alongside it — coverage is debt relative to the cash flow available to service it, and rising debt with rising FCF is a different situation from rising debt with flat FCF',
              'Nothing else — a 40% debt increase is always a red flag',
              'Only the interest rate on the debt',
              'The share price over the same period'
            ],
            correctAnswer:
              'Free cash flow and cash alongside it — coverage is debt relative to the cash flow available to service it, and rising debt with rising FCF is a different situation from rising debt with flat FCF',
            explanation:
              'That is why the panel plots all three series together. Debt is a number; coverage is a ratio, and only the ratio is a judgement.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "The engine's fundamentals score reads 78/100 for a stock and the strategies list ranks it first by expected value. What is the actual relationship between those two facts?",
            options: [
              'None — the fundamentals score is computed and stored but explicitly not used in ranking ("plumbing only"); the EV ordering is purely technical, so the two happened to agree by coincidence',
              'The fundamentals score is the dominant input to the EV ranking, so a high score directly caused the top rank',
              'The fundamentals score acts as a gate: nothing below 50 can be ranked at all',
              'The EV ranking is computed first and then multiplied by the fundamentals score'
            ],
            correctAnswer:
              'None — the fundamentals score is computed and stored but explicitly not used in ranking ("plumbing only"); the EV ordering is purely technical, so the two happened to agree by coincidence',
            explanation:
              'Worth internalising, because it is easy to assume a number shown on screen is feeding the decision. It is not. Fundamental judgement on a candidate is currently yours to make, which is exactly what the Financials tab is for.'
          }
        ]
      },
      {
        id: 'l9-minervini-screen',
        title: 'Screening for strength: the Minervini-style workflow',
        practiceSymbolDefault: 'NVDA',
        theory:
          '## A different question from the one this engine asks\n\n' +
          'The engine asks *"is something I already follow temporarily cheap?"*. A trend-following screen asks *"which stocks are strong enough to be worth owning at all?"*. These are not the same question, and — importantly — they point in **opposite directions**. More on that below.\n\n' +
          '## The Trend Template\n\n' +
          "Mark Minervini's screen (in the O'Neil/CAN SLIM tradition) filters on a set of moving-average and 52-week-range conditions. All must hold:\n\n" +
          '1. Price above both the **150-day** and **200-day** moving averages\n' +
          '2. The 150-day average is **above** the 200-day\n' +
          '3. The 200-day average is **trending up** (typically for at least a month)\n' +
          '4. The **50-day** is above both the 150-day and the 200-day\n' +
          '5. Price is above the 50-day\n' +
          '6. Price is at least **30% above** its 52-week low\n' +
          '7. Price is within **25% of** its 52-week high\n' +
          '8. **Relative strength rank is high** — Minervini prefers 90 or better, i.e. outperforming 90% of the market\n\n' +
          'Criteria 1–5 are one idea stated carefully: the averages should be *stacked* (50 > 150 > 200) with price on top, and the slowest one should be rising. Criteria 6–7 place the stock in the upper part of its own yearly range. Criterion 8 is the only **cross-sectional** one — it compares the stock to every other stock.\n\n' +
          '## Doing it in the screener\n\n' +
          "TradingView's stock screener expresses criteria 1, 2, 4, 5 directly (price and moving-average columns with comparison filters). Criteria 6 and 7 come from the 52-week high/low columns. Two honest gaps:\n\n" +
          "- **The 200-day slope (criterion 3)** is not a native column. The workable substitute is comparing today's 200-day average to its value a month ago, which needs a Pine Script indicator rather than a screener filter.\n" +
          '- **Relative strength *rank* (criterion 8)** is cross-sectional — a percentile against the whole universe. The screener\'s "Performance %" columns give you *absolute* return, which is a proxy, not a rank. Sorting by 6-month performance and taking the top decile approximates it; community Pine scripts implement the real thing. Do not mistake one for the other.\n\n' +
          'The **VCP** (volatility contraction pattern) Minervini pairs with this — a sequence of progressively shallower pullbacks on drying-up volume, bought at the pivot — is genuinely discretionary. It is read off a chart, not filtered for. Treat the template as the mechanical part and the pattern as judgement.\n\n' +
          '## Why this contradicts the engine, and why that is fine\n\n' +
          'Look at what the composite score in Level 2 rewards: **low RSI** (oversold) and **low Bollinger %B** (near the lower band). It scores *weakness* as attractive, then gates it on not being in a confirmed downtrend. The trend template demands the opposite — strength, near the highs, outperforming the market.\n\n' +
          'This is not a parameter you can tune. It is the **opposite sign**. So a screening workflow is a *second* workflow that lives beside the engine, not a replacement for it, and blending the two scores would produce something that means nothing.\n\n' +
          '## Why bother, given the engine works?\n\n' +
          "Because the engine's own evidence says the **entry** is the weak link:\n\n" +
          '- Across 153 watchlist names, only **29% beat simply holding**, with a mean edge of **−23.5 percentage points**. The rule wins on names that fell (by cutting losses) and misses the big winners entirely.\n' +
          '- A sweep of the trailing-stop width across 331 symbols changed time-in-market only from **30.6% to 35.4%** — a 5× change in the exit parameter barely moved anything, and the share of names beating buy-and-hold stayed pinned around 23–25%.\n\n' +
          'No exit fixes a trade that never happens. Selection is the lever.\n\n' +
          '## The cost constraint — read this before adopting the method\n\n' +
          'Nordnet charges **9 SEK plus 0.25%** per order on a non-Nordic venue, and a round trip is two orders. On a ~$300 stock order that is about **$3.40 round trip, or 1.1%** before the position does anything — and on a ~$100 order it is **2.4%**, because the fixed 9 SEK is the same either way.\n\n' +
          "Set against risk management that cuts losers at **5–8%**, the cost is a real but survivable drag, and the method's relatively high turnover multiplies it.\n\n" +
          'The arithmetic does not forbid the approach; it constrains the size. Because the fixed component is charged whatever you trade, fewer and larger positions genuinely lower the cost ratio — sharply up to a few hundred dollars, then with diminishing returns as the 0.25% starts to dominate.',
        furtherReading: [
          {
            title: 'TradingView stock screener',
            url: 'https://www.tradingview.com/screener/'
          },
          {
            title: 'CAN SLIM — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/CAN_SLIM'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'A stock has a 52-week low of 40 and a 52-week high of 100, and trades at 74. Compute how far it is below its 52-week high, as a percentage rounded to one decimal. Then decide: does it satisfy the "within 25% of the 52-week high" criterion? Answer with just the percentage.',
            correctAnswer: '26.0',
            explanation:
              '(100 − 74)/100 = 0.26 → **26.0%** below the high, so it **fails** criterion 7 by one point. (It comfortably passes criterion 6: 74 is 85% above the 40 low, well over the 30% required.) Note how a single borderline criterion rejects the name — the template is deliberately a conjunction, and Minervini reports it eliminating roughly 95% of the market.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "Why can the trend template not simply be merged into the engine's existing composite score?",
            options: [
              'They point in opposite directions — the composite score rewards low RSI and low %B (weakness), while the template requires strength near 52-week highs, so averaging them produces a number that means nothing',
              'The template uses moving averages the engine does not compute',
              'The template requires intraday data the engine does not store',
              'They are fully compatible and merging them is the recommended approach'
            ],
            correctAnswer:
              'They point in opposite directions — the composite score rewards low RSI and low %B (weakness), while the template requires strength near 52-week highs, so averaging them produces a number that means nothing',
            explanation:
              'This is the key structural point of the lesson. Two coherent methods with opposite signs must be run as separate workflows with separate positions; blended, they cancel into noise.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'You sort the TradingView screener by 6-month performance and take the top 20 names. Have you implemented criterion 8, relative strength rank ≥ 90?',
            options: [
              'Only approximately — "Performance %" is an absolute return, whereas RS rank is a percentile against the whole universe; sorting the filtered subset is a proxy, and the real rank needs a Pine script or a data source that computes it',
              'Yes — sorting by performance is exactly how RS rank is defined',
              'No, and there is no way to approximate RS rank on TradingView at all',
              'Yes, provided the screener is set to a 12-month rather than 6-month window'
            ],
            correctAnswer:
              'Only approximately — "Performance %" is an absolute return, whereas RS rank is a percentile against the whole universe; sorting the filtered subset is a proxy, and the real rank needs a Pine script or a data source that computes it',
            explanation:
              'The distinction matters because a percentile is relative to everything, while a sort is relative to whatever survived your other filters. It was also, until 2026-08-21, the one criterion this engine could not express at all: every other metric it computes (RSI, MACD, Bollinger, the composite score) is absolute and per-symbol. `CrossSectionalService` now supplies a real 1-99 percentile across the watchlist — see Level 10.'
          }
        ]
      }
    ]
  },
  {
    id: 'level-10',
    title:
      'Level 10 — Buying strength: the Minervini playbook (and what it measured)',
    description:
      "The opposite sign to the dip engine: buy confirmed leaders near highs instead of oversold names. Covers the Trend Template, the Volatility Contraction Pattern, and Minervini's risk arithmetic — plus the honest result when this engine actually tested the method on its own universe.",
    lessons: [
      {
        id: 'l10-why-strength',
        title: 'Why we tested buying strength',
        glossaryRef: 'composite-score',
        practiceSymbolDefault: 'MRK',
        theory:
          '## The engine has a sign\n\n' +
          'The composite score in `IndicatorsService.computeScore` weights two of its five terms like this:\n\n' +
          '```\n' +
          'score += 0.25 × (100 − RSI)        // low RSI scores HIGH\n' +
          'score += 0.30 × (1 − %B) × 100     // low %B  scores HIGH\n' +
          '```\n\n' +
          '55% of the score therefore rewards **weakness**. That is not a bug — it is a mean-reversion engine answering "is this temporarily cheap?" But it means the engine is structurally incapable of liking a stock making new highs, which is precisely what every trend-following method wants to buy.\n\n' +
          '## The hypothesis\n\n' +
          '§0.3 of the engine docs records a hard result: **153 names, only 44 (29%) beat buy-and-hold, mean edge −23.5pp.** The intuitive explanation was that the score picks bad tickers because it rewards weakness — and that switching to Minervini-style leadership screening would fix it.\n\n' +
          'That hypothesis was testable, so it was tested. Two things had to be built first: full daily OHLCV history (the `OhlcBar` table — the old `MarketData` stores closes only, so ATR, volume and pattern rules were literally uncomputable over history), and cross-sectional relative-strength ranking.\n\n' +
          '## What the test found\n\n' +
          'Forward returns after each signal, measured against the base rate of every symbol-day in the universe:\n\n' +
          '| Signal | 21d | 63d | 126d |\n' +
          '| --- | --- | --- | --- |\n' +
          '| **DIP (this engine)** | **+1.22pp** (t=3.07) | **+3.00pp** (t=4.66) | **+4.35pp** (t=4.24) |\n' +
          '| Trend Template 8/8 | −0.18pp | −0.26pp | **+1.45pp** (t=4.11) |\n' +
          '| Leader breakout | −0.86pp | −0.26pp | +1.90pp (t=0.90) |\n' +
          '| Leader at pivot | −0.51pp | **−1.57pp** (t=−3.25) | −1.20pp |\n\n' +
          '**The hypothesis was wrong.** The dip entry beats the base rate at every horizon and by a wide statistical margin. The breakout entry does not beat it at any horizon, and buying *at* the pivot is significantly worse at three months.\n\n' +
          '## So why did §0.3 look so bad?\n\n' +
          '**Exposure.** The dip engine is in the market ~31% of the time; the leader strategy ~8%. Buy-and-hold is in 100% of the time. In a rising market, comparing total return against a permanently-invested benchmark punishes any strategy that sits in cash — regardless of how good its picks are. The −23.5pp is mostly that, not bad selection.\n\n' +
          'The lesson generalises well beyond this engine: **a backtest number means nothing until you know what it is being compared against, and whether that comparison is fair.**\n\n' +
          '## What survived\n\n' +
          'The Trend Template alone shows a genuine **126-day** edge (+1.45pp, t=4.11) even though it is useless at 21 days. That is a real finding with a clear reading: it is a *quality filter measured in months*, not an entry trigger measured in weeks. That is exactly how it now appears in the product — as watchlist columns and a research shortlist at `GET /signals/leaders`, explicitly not as a buy signal.',
        furtherReading: [
          {
            title: 'Momentum investing — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Momentum_investing'
          },
          {
            title: '3 key lessons from Trade Like a Stock Market Wizard',
            url: 'https://www.finermarketpoints.com/post/3-key-lessons-from-trade-like-a-stock-market-wizard'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'The composite score gives Bollinger %B a weight of 0.30 and RSI a weight of 0.25, and both reward LOW readings. What percentage of the total score therefore rewards weakness? Answer as a whole number.',
            correctAnswer: '55',
            explanation:
              '0.30 + 0.25 = 0.55, i.e. **55%**. Momentum (0.15), MACD (0.15) and trend (0.15) make up the rest. This is why the engine and a trend-following screen are not two settings of one dial — they point in opposite directions by construction, and no amount of parameter tuning reconciles them.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              "The leader strategy showed a mean edge of −174.8pp against buy-and-hold, worse than the dip engine's −23.5pp. What does this most likely indicate?",
            options: [
              'The leader entry picks much worse tickers than the dip entry',
              'The leader strategy was in the market only ~8% of the time versus 100% for buy-and-hold, so the comparison mostly measures exposure rather than pick quality',
              'The exit rules were wrong and a better exit would make it positive',
              'The backtest had a look-ahead bug'
            ],
            correctAnswer:
              'The leader strategy was in the market only ~8% of the time versus 100% for buy-and-hold, so the comparison mostly measures exposure rather than pick quality',
            explanation:
              'Exposure dominates. Over a window where one holding returned +2072%, a strategy sitting in cash 92% of the time cannot compete on total return however good its entries are. The event study — comparing forward returns after a signal against the base rate — is the metric that isolates pick quality, and it is the one that showed the dip entry winning and the breakout entry not.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why can the DIP entry not simply be gated on the Trend Template ("buy dips, but only in confirmed leaders")?',
            options: [
              'It would be too slow to compute on every evaluation',
              'The Trend Template needs 200 days of history that the watchlist does not have',
              'They are mutually exclusive: a dip is ≥10% below the 30-day high, which puts price under the 50-day average on 99.7% of dip days, so the combination produced zero signals in four years',
              'Minervini does not permit buying pullbacks'
            ],
            correctAnswer:
              'They are mutually exclusive: a dip is ≥10% below the 30-day high, which puts price under the 50-day average on 99.7% of dip days, so the combination produced zero signals in four years',
            explanation:
              'Measured over 632 real dip days, the criterion "price > SMA50" passed 0.3% of the time and the maximum pass count was 6/8 — 7 and 8 never occurred. The two entries are not differently tuned, they are structurally incompatible. Gating one on the other silences the engine, which is why the plan changed once the numbers arrived.'
          }
        ]
      },
      {
        id: 'l10-trend-template',
        title: 'The Trend Template',
        practiceSymbolDefault: 'LLY',
        theory:
          '## Eight criteria, one question\n\n' +
          "Minervini's Trend Template asks: *is this stock in a confirmed Stage 2 uptrend?* It is a gate, not a score — the doctrinal reading is that all eight must pass.\n\n" +
          '| # | Criterion |\n' +
          '| --- | --- |\n' +
          '| 1 | Price above the 50-, 150- and 200-day moving averages |\n' +
          '| 2 | SMA150 above SMA200 |\n' +
          '| 3 | SMA200 trending up for at least 1 month (prefer 4–5) |\n' +
          '| 4 | SMA50 > SMA150 > SMA200 — the full stack, in order |\n' +
          '| 5 | Price above the SMA50 |\n' +
          '| 6 | At least **30% above** the 52-week low |\n' +
          '| 7 | Within **25% of** the 52-week high |\n' +
          '| 8 | Relative strength percentile **≥ 70** (prefer ≥ 90) |\n\n' +
          "Criteria 1 and 5 overlap; both appear in Minervini's published list and `LeaderScreenService.trendTemplate` keeps both, so the pass count matches the canonical 8.\n\n" +
          '## Criterion 3 is a duration, not a comparison\n\n' +
          'A tempting shortcut is `SMA200 today > SMA200 a month ago`. That passes for a stock that collapsed for a year and ticked up once. The engine instead uses `slopeUpDuration` — how many *consecutive* days the average has been non-decreasing — because "trending up for a month" is a statement about persistence.\n\n' +
          '## Criterion 8 is the one that needs the whole market\n\n' +
          'Criteria 1–7 are computable from a single symbol\'s own history. Criterion 8 is **cross-sectional**: a percentile only exists relative to every other stock. This is why `CrossSectionalService` had to be built — RSI, MACD, Bollinger and the composite score are all absolute and per-symbol, and none of them can answer "how does this compare with everything else right now?"\n\n' +
          'The rank uses IBD-style weighting — the most recent quarter counted double the other three — then converted to a 1–99 percentile across the universe.\n\n' +
          '## A percentile is only as good as the universe behind it\n\n' +
          'This part is easy to miss: RS rank is **not a property of the stock**. It is a property of the stock *and* the list it is compared against. Rank the same name against 300 stocks and against 750 and you get two different numbers, neither of them wrong.\n\n' +
          'Two consequences. First, a small universe makes the percentile coarse — across 334 names each rank step covers roughly 0.3% of the list, so "RS 79" and "RS 82" are nearly the same statement. Second, and more subtly, **the universe defines what "strong" means**: a hand-curated list of quality large caps contains no genuinely weak names, so sitting in its bottom decile is not the same as being weak in the market. `SIGNAL_RS_MIN_UNIVERSE = 30` is a floor below which the number is arithmetic theatre — it is not a target.\n\n' +
          'That is why the tracked universe was widened to full S&P 500 and EURO STOXX 50 membership (~750 names): not to have more to look at, but to make this one number mean more.\n\n' +
          '## Point-in-time, or it is worthless\n\n' +
          'A cross-sectional rank computed from the full price series and then applied to a past date silently encodes the future. The backtest looks healthy and means nothing. `CrossSectionalService.rank` therefore takes an `asOf` date and filters to bars at or before it, and a regression test asserts that appending future bars leaves a past ranking byte-identical.\n\n' +
          '## How selective is it, really?\n\n' +
          "Minervini says the template eliminates ~95% of stocks. On this watchlist it passes **47 of 331 (14%)** — noticeably looser, and the reason is that the universe is a hand-curated list of quality large-caps rather than the whole market. A filter's selectivity is a property of what you point it at, not of the filter alone.",
        furtherReading: [
          {
            title: 'Relative strength — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Relative_strength'
          },
          {
            title: '3 key lessons from Trade Like a Stock Market Wizard',
            url: 'https://www.finermarketpoints.com/post/3-key-lessons-from-trade-like-a-stock-market-wizard'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'A stock trades at 96. Its 52-week high is 120. What percentage below the 52-week high is it, to one decimal place?',
            correctAnswer: '20.0',
            explanation:
              '(120 − 96) / 120 = 0.20 → **20.0%**. That is inside the 25% limit, so criterion 7 passes. Note the denominator is the high, not the current price — anchoring to the high is what makes it a statement about how much of the advance has been given back.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'Why does the engine measure criterion 3 as a consecutive-day count rather than comparing the SMA200 with its value a month ago?',
            options: [
              'It is faster to compute',
              'A single sharp uptick after a long decline would pass a simple comparison, but "trending up for a month" is a claim about persistence',
              'The SMA200 is too noisy to compare directly',
              'Minervini specifies the calculation that way'
            ],
            correctAnswer:
              'A single sharp uptick after a long decline would pass a simple comparison, but "trending up for a month" is a claim about persistence',
            explanation:
              'A stock down 60% over a year can easily have its 200-day average higher than it was 21 days ago during a bounce. `slopeUpDuration` counts backwards from today and stops at the first down-tick, so it measures the thing the criterion actually describes.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "Which Trend Template criterion cannot be computed from a single stock's own price history?",
            options: [
              'Criterion 3 — SMA200 rising for a month',
              'Criterion 6 — at least 30% above the 52-week low',
              'Criterion 8 — relative strength percentile ≥ 70',
              'Criterion 4 — SMA50 > SMA150 > SMA200'
            ],
            correctAnswer: 'Criterion 8 — relative strength percentile ≥ 70',
            explanation:
              'A percentile is by definition relative to a population. The other seven are self-contained. This is the one criterion the engine could not express at all before `CrossSectionalService` existed — every prior metric (RSI, MACD, Bollinger, the composite score) is absolute and per-symbol.'
          }
        ]
      },
      {
        id: 'l10-vcp',
        title: 'The Volatility Contraction Pattern',
        practiceSymbolDefault: 'EQNR.OL',
        theory:
          '## What the pattern claims\n\n' +
          'A VCP is a base in which each pullback is **shallower than the one before**, on **progressively lighter volume**. The story is supply being absorbed: each wave of sellers is smaller than the last, until almost none remain and the stock can move on modest demand.\n\n' +
          'Minervini\'s own description: *"the first correction might be 20%, 25%, 33%, and then it\'ll contract usually the contractions are about half of the previous correction. So maybe it contracts to 10 or 15 and then contracts to 3, 4 or 5 or 8%."*\n\n' +
          '| Element | Rule |\n' +
          '| --- | --- |\n' +
          '| Contractions | 3–4 typical, 3 the practical minimum |\n' +
          '| Depth sequence | each roughly **half** the prior; never wider (e.g. 18% → 12% → 6%) |\n' +
          '| Volume | falls through the base, lowest in the final contraction |\n' +
          '| Base duration | 4–12 weeks |\n' +
          '| Final tightness | typically 3–5% |\n' +
          '| **Pivot** | the **high of the final, tightest contraction** |\n' +
          '| Breakout | through the pivot on **40–50% above average volume** |\n\n' +
          'Note that volume appears **twice** in that table, and the engine tests it twice: once for the dry-up through the base (`dryUpRatio ≤ 0.85`, a hard gate on whether a base qualifies as a VCP at all) and again for expansion on the breakout (`breakoutRatio ≥ 1.40`, which separates a confirmed BREAKOUT from an unconfirmed AT_PIVOT). The two are independent, and passing one says nothing about the other — the next lesson works through a name that aced the first and failed the second.\n\n' +
          '## Detecting it is harder than describing it\n\n' +
          'The first implementation of `vcpStructure` used a 2% swing filter and then required the resulting pullbacks to shrink monotonically. On real charts it rejected **every single name**, reporting 9–16 "contractions" each.\n\n' +
          'The tension is fundamental: a filter loose enough to see the final 3–5% contraction also sees every intermediate wiggle, and a filter tight enough to ignore wiggles is blind to the final contraction — the one that defines the pivot.\n\n' +
          '**The resolution:** detect *every* swing, then extract the longest chain of pullbacks that both shrink in depth and make **higher lows**, ending at the most recent one. The skipped swings are the wiggles *inside* a larger contraction — which is exactly how a chartist reads a base by eye. After that change the same universe produced 21 valid VCPs among 47 leaders.\n\n' +
          '## Be honest about what this is\n\n' +
          'The VCP is a **discretionary** pattern. `vcpStructure` is a quantitative proxy for it and will disagree with a trained eye in both directions. It is a shortlist generator, not a verdict — which is why the engine reports the contraction sequence, the pivot, the volume ratio and the *rejection reason* rather than a bare yes/no.\n\n' +
          '## And be honest about the result\n\n' +
          'Buying the breakout did not beat the universe base rate at 21, 63 or 126 days on this watchlist, and buying *at* the pivot was significantly worse at 63 days (t = −3.25). The pattern is real and worth being able to see; the evidence here does not support trading it mechanically. Level 10 lesson 1 covers why.',
        furtherReading: [
          {
            title:
              "What is a VCP pattern — Minervini's Volatility Contraction Pattern explained",
            url: 'https://www.finermarketpoints.com/post/what-is-a-vcp-pattern-mark-minervini-s-volatility-contraction-pattern-explained'
          },
          {
            title: 'Average true range — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Average_true_range'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'A base contracts from a peak of 98 down to a trough of 86.24. What is the contraction depth as a percentage, to one decimal place?',
            correctAnswer: '12.0',
            explanation:
              '(98 − 86.24) / 98 = 0.12 → **12.0%**. If the previous contraction was 18% and the next is 6%, that is the canonical 18 → 12 → 6 sequence: each roughly half the last, none wider than its predecessor.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt: 'Where is the pivot in a VCP?',
            options: [
              'The lowest low of the base',
              'The high of the first, deepest contraction',
              'The high of the final, tightest contraction',
              'The midpoint between the base high and base low'
            ],
            correctAnswer: 'The high of the final, tightest contraction',
            explanation:
              'The pivot is the last remaining overhead supply. Clearing it on expanding volume means the final holders willing to sell at that price are gone. Anchoring to the *first* peak instead would put the trigger far above where the setup actually resolves.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              'Why does a naive 2% swing filter fail to find VCPs on real charts?',
            options: [
              'It is too tight to detect the first, deepest contraction',
              'Real stocks wiggle more than 2% constantly, so it reports 9–16 noisy swings that never form a shrinking sequence',
              'Volume data is unavailable at that resolution',
              'It cannot handle gaps between sessions'
            ],
            correctAnswer:
              'Real stocks wiggle more than 2% constantly, so it reports 9–16 noisy swings that never form a shrinking sequence',
            explanation:
              'And simply raising the threshold does not help — it would hide the final 3–5% contraction that defines the pivot. The fix is to detect every swing and then extract the dominant chain of shrinking pullbacks with rising lows, treating the rest as noise inside a larger contraction.'
          }
        ]
      },
      {
        id: 'l10-volume',
        title: 'Volume: the confirmation half of the pattern',
        practiceSymbolDefault: 'UNP',
        theory:
          '## Why volume carries information at all\n\n' +
          'Price tells you *where* a stock traded. Volume tells you **how many shares had to change hands to put it there** — and that second number is what separates a move with something behind it from a move that simply drifted.\n\n' +
          "The usual reading: most of a large cap's float is held by funds, and a retail-sized order cannot move it. So when price rises on unusually light volume, few shares traded — the move happened because nobody was offering stock, not because anyone was buying it aggressively. When price rises on heavy volume, someone large had to be accumulating.\n\n" +
          '> **Mark this as interpretation, not measurement.** The thresholds and formulas below are exactly what the engine computes. "Volume is a proxy for institutional participation" is the conventional reading of those numbers, widely used and reasonable — but this engine does not observe who is trading, only how much. Hold it as a working model, not a fact.\n\n' +
          '## The signature has two phases, and the engine tests both\n\n' +
          '```\n' +
          'dryUpRatio    = meanVolume(final contraction) / avgVolume₅₀   must be ≤ 0.85\n' +
          'breakoutRatio = volume(latest bar)            / avgVolume₅₀   must be ≥ 1.40\n' +
          '```\n\n' +
          '**Phase 1 — dry-up, before the breakout.** Through successive contractions volume should decline, and be lowest in the final, tightest one. The reading is supply exhaustion: everyone who wanted out has gone. Note what this ratio measures — the *mean daily volume across the final contraction*, not a single day, and not a total.\n\n' +
          'This is a **hard gate**. A base whose final contraction trades above 0.85× average is rejected outright, so any VCP you are shown has already passed it.\n\n' +
          '**Phase 2 — expansion, at the breakout.** Then demand has to actually show up. Minervini\'s "40–50% above average" is where the 1.40× threshold comes from.\n\n' +
          '## They are a matched pair — and that is the whole lesson\n\n' +
          'On 2026-08-20 two names on this watchlist passed all 8 Trend Template criteria with near-identical bases:\n\n' +
          '| | UNP | JNJ |\n' +
          '| --- | --- | --- |\n' +
          '| Trend Template | 8/8 | 8/8 |\n' +
          '| RS rank | 79 | 81 |\n' +
          '| Contractions | 7.5% → 3.5% → 2.6% | 5.2% → 4.0% → 3.4% |\n' +
          '| Price vs pivot | +1.95% | +1.22% |\n' +
          '| **Dry-up** | 0.73× | **0.65×** |\n' +
          '| **Breakout volume** | **1.45×** | **0.80×** |\n' +
          '| Status | **BREAKOUT** | **AT_PIVOT** |\n\n' +
          "Read the dry-up row carefully: **JNJ's supply dried up more thoroughly than UNP's** — 0.65× against 0.73×. By the first test JNJ was the better setup.\n\n" +
          'It still did not confirm. JNJ crossed its pivot on 0.80× volume — *below* an ordinary day. Fewer shares traded on the day it broke out than on a random Tuesday. Nothing had to be bought to get it there; it floated up through a thin order book. There is no accumulated position defending that level, so there is nothing to stop it falling back through.\n\n' +
          'UNP crossed on 1.45×. Same structure, opposite meaning.\n\n' +
          '## Why AT_PIVOT is a watch state, not a trigger\n\n' +
          'AT_PIVOT means price is within 2% of the pivot. It tests **price only** and says nothing whatsoever about volume. A stock can sit at its pivot for weeks and never confirm.\n\n' +
          'That is what makes it useful to *see* rather than to act on: it tells you which names to read about now, so that if one does break out on real volume you already know the business and are not researching under time pressure. That is the whole purpose of the evening alert.\n\n' +
          '## The honest caveat, again\n\n' +
          'Being able to read this does not mean trading it works. On this watchlist, buying confirmed breakouts did not beat the universe base rate at 21, 63 or 126 days. The volume tests tell you what the chart is saying; they do not promise the chart is right.',
        furtherReading: [
          {
            title: 'Volume (finance) — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Volume_(finance)'
          },
          {
            title: 'Market depth — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Market_depth'
          },
          {
            title:
              "What is a VCP pattern — Minervini's Volatility Contraction Pattern explained",
            url: 'https://www.finermarketpoints.com/post/what-is-a-vcp-pattern-mark-minervini-s-volatility-contraction-pattern-explained'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              "A base's final contraction averages 1,479,000 shares a day while the 50-day average volume is 2,220,000. What is the dry-up ratio, to two decimal places?",
            correctAnswer: '0.67',
            explanation:
              '1,479,000 / 2,220,000 = **0.67**. That is comfortably below the 0.85 ceiling, so the base passes the dry-up gate — roughly a third less trading than normal while price coiled. Note this is the *mean daily* volume across the contraction, not one quiet session.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt:
              'A stock has 8/8 on the Trend Template, three clean contractions, a dry-up ratio of 0.65, and has just closed 1.2% above its pivot on 0.80× average volume. What does the engine call it, and why?',
            options: [
              'BREAKOUT — it cleared the pivot and dried up beautifully',
              'AT_PIVOT — the structure and dry-up are ideal, but the breakout needs ≥ 1.40× volume and got 0.80×',
              'No valid VCP — a dry-up ratio of 0.65 is too low to be credible',
              'BREAKOUT — dry-up below 0.70 overrides the volume requirement'
            ],
            correctAnswer:
              'AT_PIVOT — the structure and dry-up are ideal, but the breakout needs ≥ 1.40× volume and got 0.80×',
            explanation:
              'This is JNJ on 2026-08-20 exactly. The two volume tests are independent and both required — passing the first well does not compensate for failing the second. Below-average volume on the breakout day means almost nothing had to be bought to lift it through the pivot, so no position is defending that level.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt: 'Which statement about the dry-up test is accurate?',
            options: [
              'It is one input to a score, so a weak reading can be offset by strong criteria elsewhere',
              'It is a hard gate — a base failing it is rejected outright, so every VCP shown has already passed',
              'It is only checked once price has already cleared the pivot',
              'It compares the single quietest day of the base against the 50-day average'
            ],
            correctAnswer:
              'It is a hard gate — a base failing it is rejected outright, so every VCP shown has already passed',
            explanation:
              'A dryUpRatio above 0.85 returns no valid structure at all, with the reason recorded so the near-miss stays legible. Nothing about the Trend Template can compensate: a base where sellers never went quiet is not a VCP, regardless of how strong the trend looks.'
          }
        ]
      },
      {
        id: 'l10-risk',
        title: 'Risk management and the arithmetic of fees',
        practiceSymbolDefault: 'AAPL',
        theory:
          '## The rule that matters more than the entry\n\n' +
          "Minervini's core claim is that **strict stop-losses matter more than win rates**. The published thresholds:\n\n" +
          '- Maximum loss per position: **7–8%** below entry\n' +
          '- Target win size: **20–30%+**\n' +
          '- Expected win rate: **45–60%** — you lose on nearly half your trades\n\n' +
          'Five winners at +25% against five losers at −7.5% is +125% − 37.5% = **+87.5%**, with a 50% win rate. The asymmetry does the work, not the accuracy.\n\n' +
          '## Why losses compound against you\n\n' +
          'Recovery is not symmetric with loss:\n\n' +
          '| Loss | Gain needed to break even |\n' +
          '| --- | --- |\n' +
          '| 7% | 7.5% |\n' +
          '| 25% | 33% |\n' +
          '| 50% | 100% |\n' +
          '| 75% | 300% |\n\n' +
          'A 7% loss is an inconvenience. A 50% loss requires a double just to return to where you started. This is the entire argument for cutting quickly.\n\n' +
          '## The fee arithmetic, and why the answer changed twice\n\n' +
          'Nordnet charges **per order**: `fee = fixed fee + commission% × trade value`. Both terms always apply — the fixed fee is not a floor the percentage replaces. Buying and selling are separate orders, so a round trip is charged twice. On the **Mini** class that is 0.25% plus 9 SEK on non-Nordic venues, or 1 SEK on Nordic ones.\n\n' +
          'At USDSEK 9.46:\n\n' +
          '| Position | Per order | Round trip | Round trip as % of position |\n' +
          '| --- | --- | --- | --- |\n' +
          '| $100 | $1.20 | $2.40 | **2.40%** |\n' +
          '| $250 | $1.58 | $3.15 | 1.26% |\n' +
          '| $550 | $2.33 | $4.65 | 0.85% |\n' +
          '| $1000 | $3.45 | $6.90 | 0.69% |\n' +
          '| $5000 | $13.45 | $26.90 | 0.54% |\n\n' +
          '## Why the rate falls, and where it stops falling\n\n' +
          'The fixed 9 SEK is charged whatever you trade, so it spreads over a larger base as the position grows — the rate falls from 2.40% at $100 toward an asymptote of **0.50%** (two lots of 0.25%). It never reaches it.\n\n' +
          '**"Trade bigger to amortise the fee" is therefore true here**, but only for the fixed half, and with sharply diminishing returns. The useful reference point is where the two components cost the same: **9 / 0.0025 = 3,600 SEK ≈ $380**. Below it most of your bill is the fixed fee and size helps a lot; above it the percentage dominates and size barely moves the rate.\n\n' +
          'This engine has had the model wrong twice, in opposite directions — first a flat $10 round trip, then `max(pct × value, minimum)`, which made the rate look constant above $380 and led it to teach that size buys nothing. Both were corrected against the published card.\n\n' +
          'The transferable lesson is about **fee shape, not fee level**: a flat fee, a pure percentage, and `fixed + percentage` reward completely different position sizing, and getting the shape wrong quietly changes what the engine recommends.\n\n' +
          '## Sizing the stop with ATR, not a fixed percentage\n\n' +
          "A fixed 7.5% stop assumes every stock has the same daily noise. It does not. The backtest here makes the point sharply: the same leader entries produced a **73% win rate** with the engine's volatility-scaled exit and only **~30%** with a fixed 7.5% stop — the fixed stop sat inside the names' ordinary daily range and got hit by noise rather than by being wrong.\n\n" +
          "`IndicatorsService.atr` gives Wilder's Average True Range, which counts overnight gaps as well as intraday range — the thing a stop actually has to survive. Treat 7–8% as a *maximum*, and place the actual stop at whichever is tighter: the maximum, or a volatility-appropriate distance below a real structural level.",
        furtherReading: [
          {
            title: 'Stop-loss order — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Stop-loss_order'
          },
          {
            title: 'Average true range — Wikipedia',
            url: 'https://en.wikipedia.org/wiki/Average_true_range'
          }
        ],
        quiz: [
          {
            id: 'q1',
            type: 'calculation',
            prompt:
              'Nordnet Mini charges 9 SEK plus 0.25% per order on a non-Nordic venue, and a round trip is two orders. At USDSEK 9.46, what does a round trip on a $250 position cost as a percentage of the position? Round to one decimal place.',
            correctAnswer: '1.3%',
            explanation:
              'One order = 9 SEK ($0.95) + 0.25% × $250 ($0.63) = $1.58. Round trip = $3.15, which is **1.3%** of $250. The same calculation at $1,000 gives 0.69% — the fixed 9 SEK is identical in both, so it weighs four times as heavily on the smaller position. That is the whole reason size affects the rate at all.'
          },
          {
            id: 'q2',
            type: 'calculation',
            prompt:
              'A position falls 25%. What percentage gain is needed to get back to break-even? Round to the nearest whole percent.',
            correctAnswer: '33',
            explanation:
              '1 / (1 − 0.25) − 1 = 0.333 → **33%**. Recovery grows faster than the loss: 50% down needs 100% up, 75% down needs 300%. Cutting at 7% needs only 7.5% back, which is why the rule is a maximum rather than a guideline.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt:
              "In this engine's backtest, the same leader entries produced a 73% win rate with the volatility-scaled exit but only ~30% with a fixed 7.5% stop. What is the most likely reason?",
            options: [
              'The fixed stop was applied at the wrong price',
              'A fixed 7.5% stop sits inside the ordinary daily range of many of these stocks, so it is hit by noise rather than by the thesis failing',
              'The volatility-scaled exit takes profit earlier and so wins more often by definition',
              'The fixed stop version traded different symbols'
            ],
            correctAnswer:
              'A fixed 7.5% stop sits inside the ordinary daily range of many of these stocks, so it is hit by noise rather than by the thesis failing',
            explanation:
              "The entries were identical across all four exit variants — only the exit changed. A stop must sit outside the noise it is meant to ignore, which is what ATR measures. Minervini's 7–8% is a maximum acceptable loss, not a claim that every stock has the same volatility."
          }
        ]
      }
    ]
  }
];

const LESSON_BY_ID = new Map<string, AcademyLesson>(
  ACADEMY_LEVELS.flatMap((level) => level.lessons).map((lesson) => [
    lesson.id,
    lesson
  ])
);

export function findAcademyLesson(lessonId: string): AcademyLesson | null {
  return LESSON_BY_ID.get(lessonId) ?? null;
}
