/**
 * Single source of truth for the trading-signal metric definitions, surfaced in
 * the in-app Analytics glossary (rendered as markdown) and mirrored by
 * `docs/TRADING_SIGNALS.md`. Each entry's `id` is the in-page anchor
 * (`#metric-<id>`) that dashboard metrics link to. Keep formulas in plain
 * monospace/markdown (no KaTeX) so they match the docs exactly.
 */
export interface SignalMetricDefinition {
  /** Anchor id (kebab-case): the dashboard links to `#metric-<id>`. */
  id: string;
  /** Display name. */
  label: string;
  /** One-line plain-English meaning. */
  summary: string;
  /** The exact formula in monospace markdown. */
  formula: string;
  /** Interpretation / how it is used in the engine. */
  notes: string;
}

export const SIGNAL_METRIC_DEFINITIONS: SignalMetricDefinition[] = [
  {
    id: 'composite-score',
    label: 'Composite score (0–100)',
    summary:
      'Hand-weighted blend of the normalized technical indicators — a buy-attractiveness rank, used as an eligibility gate (not a multiplier).',
    formula:
      'score = 100 · Σ wᵢ·nᵢ\n' +
      'where each nᵢ ∈ [0,1] is a normalized indicator and Σ wᵢ = 1\n' +
      '(RSI, MACD histogram, Bollinger %B, SMA50/200 trend, momentum 3M/12M).',
    notes:
      'Higher = a more attractive entry. A DIP buy requires score ≥ 55; the strategy builder gates candidates at score ≥ 45. The score ranks, the expected value decides.'
  },
  {
    id: 'rsi',
    label: 'RSI (14)',
    summary:
      "Wilder's Relative Strength Index over 14 periods — momentum oscillator in [0, 100].",
    formula:
      'RS = avgGain₁₄ / avgLoss₁₄   (Wilder-smoothed)\n' +
      'RSI = 100 − 100 / (1 + RS)',
    notes:
      '< 30 oversold, > 70 overbought. The REVERSAL path wants RSI rising but still < 70 (the oversold washout happened during the decline, not necessarily today).'
  },
  {
    id: 'macd',
    label: 'MACD (12/26/9)',
    summary:
      'Moving-Average Convergence/Divergence — trend & momentum via the gap between two EMAs and its signal line.',
    formula:
      'MACD = EMA₁₂(close) − EMA₂₆(close)\n' +
      'signal = EMA₉(MACD)\n' +
      'histogram = MACD − signal',
    notes:
      'A positive, rising histogram indicates strengthening upward momentum; it contributes to the composite score.'
  },
  {
    id: 'bollinger-pctb',
    label: 'Bollinger %B (20)',
    summary:
      'Where the price sits inside its 20-day Bollinger Band (2σ): 0 = lower band, 1 = upper band.',
    formula:
      'mid = SMA₂₀(close);  σ = stdev₂₀(close)\n' +
      'upper = mid + 2σ;  lower = mid − 2σ\n' +
      '%B = (price − lower) / (upper − lower)',
    notes:
      'Low %B = price stretched toward the lower band (a dip); high %B = stretched up. Clamped to [0, 1] for the score.'
  },
  {
    id: 'sma',
    label: 'SMA 50 / 200 (trend)',
    summary:
      'Simple moving averages over 50 and 200 days — the medium- and long-term trend reference.',
    formula:
      'SMAₙ = (1/n) · Σ closeᵢ  for the last n closes',
    notes:
      'price > SMA200 = long-term uptrend. A confirmed downtrend is SMA50 < SMA200 AND price < SMA200 (suppresses the DIP buy / "falling knife").'
  },
  {
    id: 'momentum',
    label: 'Momentum (3M / 12M)',
    summary:
      'Trailing price return over ~63 (3M) and ~252 (12M) trading days.',
    formula:
      'momentumₙ = price_today / price_{t−n} − 1',
    notes:
      'Positive long-horizon momentum is a tailwind in the composite score; deeply negative 12M momentum is what keeps beaten-down names out of the DIP path.'
  },
  {
    id: 'volatility',
    label: 'Volatility (daily σ)',
    summary:
      'Standard deviation of daily returns — the unit that scales every threshold band.',
    formula:
      'close-to-close: σ = stdev( ln(closeₜ / closeₜ₋₁) )\n' +
      'annualised: σ_annual = σ · √252',
    notes:
      'EWMA-weighted for the forecast. Owned active trades use the OHLC Yang-Zhang estimator (below) when available.'
  },
  {
    id: 'yang-zhang',
    label: 'Yang-Zhang / Garman-Klass volatility',
    summary:
      'Drift-independent OHLC volatility estimator — uses open/high/low/close, so it is far less noisy than close-to-close.',
    formula:
      'σ²_GK = (1/N) Σ [ ½(ln(H/L))² − (2ln2−1)(ln(C/O))² ]\n' +
      'σ²_YZ = σ²_overnight + k·σ²_open + σ²_GK',
    notes:
      'Drives the real stop/target/trail bands for owned active trades; falls back to close-to-close when OHLC is unavailable.'
  },
  {
    id: 'horizon-band',
    label: 'Horizon band (σ·√t)',
    summary:
      'The volatility scaled to the signal horizon (42 trading days) — the building block for every adaptive level.',
    formula:
      'band = σ_daily · √(SIGNAL_HORIZON_DAYS)   (SIGNAL_HORIZON_DAYS = 42)',
    notes:
      'A higher-volatility name gets wider buy/stop/target bands, so thresholds are reachable within the ~2-month horizon. This only sizes the price bands — there is no day-count exit, so a position can still stay open past the horizon if price never crosses a level.'
  },
  {
    id: 'adaptive-levels',
    label: 'Adaptive buy / stop / target / trail',
    summary:
      'The volatility-scaled price thresholds, in the asset’s native currency, with the per-share fee folded into the cost basis.',
    formula:
      'buy   = recentHigh · (1 − max(dropPct, k·band))\n' +
      'stop  = avgBuy · (1 − 2·band)\n' +
      'target = (avgBuy + fee/share) · (1 + max(13.4%, 1.5·band))\n' +
      'trail = peak · (1 − 1·band)',
    notes:
      'Stop/target/trail apply to owned active trades (the exit state machine). The buy level is the DIP entry trigger. Stocks use dropPct = 10% and k = 1.5; ETFs are calibrated shallower (dropPct = 5%, k = 1.0) because diversified ETFs essentially never fall 10% off a 30-day high outside a crash, and the 1.5σ band pushed volatile thematic ETFs to 20-40% required drops.'
  },
  {
    id: 'reach-probability',
    label: 'Reach probability (terminal, drift 0)',
    summary:
      'Analytic probability the price ends at or above the upside target over the horizon — drift set to 0 so it is honest and comparable across the universe.',
    formula:
      'P = Φ( ( ln(target/price) − (−½σ²)·t ) / (σ·√t) )\n' +
      'with daily drift μ = 0;  Φ = standard-normal CDF (via erf)',
    notes:
      'Terminal (end-of-horizon), not touch probability. With drift 0 the honest P(+13.4% in ~2mo) is usually small — by design the engine says "no compelling buy" rather than inventing edge.'
  },
  {
    id: 'expected-value',
    label: 'Expected value (EV)',
    summary:
      'The probability-weighted payoff of a trade — the ranking metric for strategy candidates.',
    formula:
      'EV = p · targetGainPct − (1 − p) · stopLossPct\n' +
      'where p = reach probability',
    notes:
      'Replaces score×probability (no double-count). Score is only an eligibility gate; EV decides the ranking. Often negative — which correctly suppresses weak buys.'
  },
  {
    id: 'conviction',
    label: 'Conviction (display)',
    summary:
      'A 0–100 rendering of expected value for the UI, plus small situational bonuses.',
    formula:
      'conviction = 50 + EV · 1000\n' +
      '(+ buy-zone and recent-re-confirmation bonuses)',
    notes:
      '50 = break-even EV; > 50 = positive edge. A presentation of EV, not a separate model.'
  },
  {
    id: 'eligibility-gates',
    label: 'Eligibility gates',
    summary:
      'The filters a candidate must pass before it can be ranked by EV.',
    formula:
      'pass = score ≥ 45\n' +
      '  AND (not downtrend OR confirmed REVERSAL)\n' +
      '  AND not recently-exited (≤ 14 days)\n' +
      '  AND annualVol ≤ 0.90',
    notes:
      'The volatility cap excludes wild/illiquid names; the recently-exited window avoids re-buying what just stopped out.'
  },
  {
    id: 'news-gate',
    label: 'News risk gate',
    summary:
      'A sentiment score in [−1, 1] used only as a risk filter and size shrink — never to invent a directional buy.',
    formula:
      'BUY suppressed when newsScore < −0.2\n' +
      '(skipped entirely when no news data is available)',
    notes:
      'Age-decayed over 3 days, cached 6h. "news n/a" is shown for uncovered names (parity), so a missing feed never blocks a signal.'
  },
  {
    id: 'fundamentals-score',
    label: 'Fundamentals score (0–100)',
    summary:
      'A valuation/quality/growth score from free Yahoo fundamentals data (forward P/E, ROE, earnings growth, analyst consensus) — independent of the technical composite score.',
    formula:
      'score = 100 · Σ wᵢ·nᵢ  (re-normalized over whichever of the 4 inputs are available)\n' +
      'valuation (P/E) 0.30, quality (ROE) 0.25, growth (earnings) 0.25, analyst consensus 0.20',
    notes:
      'Answers "is this a fundamentally sound business at a reasonable price," never "is this technically oversold right now" (that is the composite score). Not a BUY gate and not yet folded into conviction ranking — shown alongside the technical score for context. Fetched lazily (same population as the news gate) and cached 24h, since fundamentals move on an earnings cadence, not daily. Absent for most funds/ETFs and any name outside Yahoo coverage.'
  },
  {
    id: 'buy-dip',
    label: 'BUY — DIP (uptrend)',
    summary:
      'The default buy: a confirmed dip inside an uptrend.',
    formula:
      'price ≤ buyLevel AND not downtrend AND score ≥ 55\n' +
      'AND up-day (price > prev close) AND newsScore ≥ −0.2',
    notes:
      'Tagged signalType = DIP, bearMarket = false. Uptrend-only by construction.'
  },
  {
    id: 'buy-reversal',
    label: 'BUY — REVERSAL (bear-market)',
    summary:
      'The flagged, higher-risk path that buys a beaten-down name only on a *confirmed* bottom.',
    formula:
      'price < SMA200 AND rsi rising AND rsi < 70\n' +
      'AND higher-low AND price ≥ SMA20\n' +
      'AND volume ≥ 1.3 × 20-day avg',
    notes:
      'Tagged signalType = REVERSAL, bearMarket = true, labelled "⚠️ REVERSAL BUY". Still must clear EV/conviction + the vol cap — never auto-promoted for being cheap.'
  },
  {
    id: 'exit-machine',
    label: 'Exit state machine',
    summary:
      'How owned active trades are sold: a two-phase WATCHING → TRAILING machine (or a single wide hold-with-stop).',
    formula:
      'WATCHING: price ≤ stop → SELL; price ≥ target → enter TRAILING\n' +
      'TRAILING: price ≤ peak·(1−band) → SELL\n' +
      'hold-with-stop: price ≤ peak·(1 − 0.22) → SELL',
    notes:
      'Core (non-active-trade) holdings are never sold by the engine. SELL reasons report net gain after the $10 round-trip fee.'
  },
  {
    id: 'backtest-metrics',
    label: 'Backtest metrics',
    summary:
      'The credible, slippage-aware evaluation of a rule vs simply holding.',
    formula:
      'Sharpe = mean(r) / stdev(r) · √252\n' +
      'Sortino = mean(r) / downsideStdev(r) · √252\n' +
      'Calmar = CAGR / maxDrawdown\n' +
      'profitFactor = Σ gains / Σ losses\n' +
      'edge = netReturn − benchmark(buy-and-hold)',
    notes:
      'Includes 10 bps/side slippage, an out-of-sample (last 30%) check, and a buy-and-hold benchmark. Honest finding: trading usually loses to holding — lean on the fund core.'
  }
];
