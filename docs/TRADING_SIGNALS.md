# Trading Signals — Operations & Reference Guide

Your self-hosted active-trading assistant, built on a Ghostfolio fork. This document is the single source of truth for **how to run it**, **what every metric means**, **how the signal engine decides BUY/SELL/HOLD/REINVEST**, **how live data and rate limits are handled**, and **what's needed for production**.

---

## 0. Philosophy, the numbers, and the honest evidence (read this first)

### 0.1 The allocation philosophy — 60/40
The portfolio targets **60% funds / 40% stocks-and-ETFs** (changed from 67/33 on 2026-07-09 — a deliberate, slightly more aggressive tilt for the 750 USD/month plan while quality names trade at a discount). The two sleeves play different roles:
- **Funds (60%) — the safe, diversified core.** Broad low-fee index funds (global, USA, EM, Sweden, Europe…). Bought and *held*. They are not traded on signals; the only "signal" is a **weekly recommendation** of which fund to add to keep the mix diversified and on-target. This is where most of the money lives and compounds quietly.
- **Stocks + ETFs (40%) — the risk sleeve, where you "pick winners".** Individual companies and thematic ETF baskets carry higher single-name risk and higher potential reward. This sleeve is where the conviction/expected-value engine operates.

Every month's contribution is split to **steer the actual mix back toward 60/40** (the under-weight sleeve gets the cash first). The 60/40 ratio, the safe-core idea, and the "concentrate risk in a small sleeve" discipline are the backbone — everything else is in service of it.

### 0.1b Monthly deployment playbook (750 USD/month, adopted 2026-07-09)
- **~450 USD → the fund sleeve.** Commission-free at Nordnet; follow the weekly fund recommendation for which fund(s) keep the mix diversified. No timing — this buys automatically cheaper units in drawdowns.
- **~300 USD → the stock/ETF sleeve, at most ONE stock order per month** (the $5 Nordnet fee ≈ 1.7% of the order) **or up to TWO ETF orders** (2 × $150, only when two distinct ETF dip signals are genuinely live — the doubled fee ≈ 3.3% must be worth the diversification).
- **Picks come from the conviction/EV ranking** (`GET /signals/strategies`), never from enthusiasm. While bear-market flags are up, prefer **REVERSAL-confirmed** entries over raw dips (a confirmed bottom + capitulation volume beats catching a falling knife).
- **Sell only when the exit machine fires** (stop-loss / trailing) — never on a schedule. The backtest evidence (§0.3) is unambiguous: planned reselling is the falsified strategy; entry-timing + stop-discipline on held positions is what the engine is for.
- If the engine says "nothing compelling" (negative EV across the board), the stock-sleeve cash **waits in the account** — deploying into a bad month is not a goal.
- **Auto-plan on the 25th (added 2026-07-09):** a cron (`0 9 25 * *` on `SignalsService`) sends the full plan to Telegram on the 25th, assuming the `SIGNAL_MONTHLY_CONTRIBUTION_USD = 750` deposit when it hasn't been logged yet (clearly labeled; a real, higher balance wins). A boot catch-up sends it on the next start if the machine was off on the 25th (Property `SIGNAL_MONTHLY_PLAN_LAST_SENT` dedups per month). Logging the deposit still triggers the classic cash-delta plan too.
- **Market-regime line (advisory ONLY):** every delivered plan is headed by a one-liner from `MarketRegimeService` — VIX level + S&P 500 vs its 200-day (`classifyRegime`: RISK-OFF when VIX ≥ 30 or index < SMA200; RISK-ON when VIX < 20 and index > SMA200; else NEUTRAL). In RISK-OFF the advice is to split the stock sleeve into 2 tranches over 2-3 weeks and prefer REVERSAL-confirmed entries. **It never modifies the EV math or suggested amounts** — market-timing rules are unvalidated by our backtest layer, and hard-coding them would violate §0.2. The Academy Market Pulse indices remain display-only.

### 0.2 No built-in optimism — by design
The engine is deliberately **pessimistic/honest**, not promotional:
- Probabilities use the **terminal** distribution with **zero drift** (we do *not* assume a stock keeps rising because it recently rose — "the drift problem"). Reaching a fixed +13.4% *terminally* within ~2 months is genuinely unlikely (~3–15%), so **expected value is usually negative and conviction is usually low**. The system says *"nothing compelling to buy right now"* far more often than it says "buy" — that is the feature, not a bug.
- Picks are ranked by **expected value** `EV = P(reach target)·gain − P(miss)·stop`, not by a feel-good score. The composite score is only an eligibility gate.
- Costs are modelled: **per-order fees + slippage** in the backtest; fee-adjusted targets live.

### 0.3 What the backtest evidence actually says (important)
`GET /api/v1/signals/backtest/all` replays the exit-managed trading rule over every watchlist name's history and compares **trading vs simply holding** (after slippage). Run on the current watchlist:

> **153 names evaluated · only 44 (29%) beat buy-and-hold · average edge −23.5 percentage points · median −11.3pp.**

The pattern is stark and worth internalising:
- On the **big winners**, the active rule **misses the run** — e.g. ASML, Caterpillar, Dell, Revolution Medicines all returned **~0% traded** while *holding* made **+127% / +150% / +194% / +347%**. The dip-buy-and-stop-out logic either never gets a clean entry or trails out early, **capping the upside**.
- The active rule only "wins" relative to holding on names that **fell** — by cutting the loss.

**Conclusion / how to use this:** for stocks you genuinely believe are winners, **holding beats actively trading them.** Treat the conviction/EV signals as **entry-timing and risk hints for a buy-and-hold sleeve**, *not* as a churn engine — and keep the trading sleeve small (the 40%). The 60% fund core is doing the real compounding. This is exactly why the architecture defaults to funds-heavy and makes the trading engine reluctant.

**Exit-mode experiment (`SIGNAL_EXIT_MODE`).** We tested two exits across all 153 names: the original `trailing` state machine (stop → take-profit → tight trail) vs `hold-with-stop` (no take-profit; a single wide ~22% peak-trailing stop that lets winners run and only cuts losses). Result: hold-with-stop improved the average edge **−23.5pp → −20.8pp** (it stops capping winners) but **neither beats buy-and-hold**. The lesson: the *exit* was never the main culprit — the dip-buy **entry misses the big winners entirely**, and no exit fixes a trade that never happens. `hold-with-stop` is now the **default** (it's the better, "let winners run" exit and matches the philosophy); flip `SIGNAL_EXIT_MODE` back to `trailing` to revert. Compare live with `GET /signals/backtest/all?exitMode=trailing|hold-with-stop`.

### 0.4 Where ETFs fit
The thematic/sector ETFs (semiconductors, AI, blockchain, lithium/battery, EV, copper/silver miners, space, new-energy, data-centre REITs, Korea/Japan/World-Value) are **equity baskets** — less risky than a single stock, more than a broad index fund. They live in the **40% stock sleeve** and receive the **same conviction/EV signals as individual stocks** (they have full price history, so indicators work immediately). They are **not** in the weekly *fund* recommendation (that's the safe index-fund core). See §15.

### 0.5 One-line method map
Indicators (RSI/MACD/Bollinger/SMA/momentum, §3.1) → composite score (§3.2) → horizon-scaled bands `σ·√42` for buy/stop/target/trail (§3.3) → terminal reach-probability, drift 0 (§3.4) → **expected-value ranking + conviction** (§13.3) → eligibility gates: score ≥ 45, not downtrend (unless a confirmed `REVERSAL`, §4.2b), not recently-exited, annual-vol ≤ 90% (§13.3) → two buy paths: `DIP` in an uptrend (§4.2) and flagged `REVERSAL` for beaten-down bear-market names (§4.2b) → exit state machine with Yang-Zhang volatility on owned positions (§4.1) → news risk-gate (§11) → credible backtest with benchmark/Sharpe/OOS/slippage (§13.3a, §0.3).

---

## 1. How to start the app (from cold)

You need three things running: **Postgres + Redis** (Docker), the **API** (NestJS), and the **client** (Angular PWA).

### 1.1 Start the databases (Docker)

```powershell
docker compose -f docker/docker-compose.dev.yml up -d postgres redis
```

This exposes Postgres on `localhost:5432` and Redis on `localhost:6379` to the Windows host. Verify:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}"
# expect gf-postgres-dev and gf-redis-dev, both (healthy)
```

### 1.2 Start the API (port 3333)

```powershell
npm run start:server
```

- Takes **~2 minutes** (Nx webpack build + NestJS bootstrap). It's ready when `http://localhost:3333/api/v1/info` returns JSON.
- Requires `REDIS_HOST=localhost` in `.env` when run on the Windows host (it's `redis` only inside Docker).

### 1.3 Start the client (port 4200)

```powershell
npm run start:client
```

Open **https://localhost:4200/en** and log in with your access token (the
one set for your admin user — keep it out of source control):

```
<YOUR_ACCESS_TOKEN>
```

> The access token is hashed (HMAC-SHA512 with `ACCESS_TOKEN_SALT`) and stored in the `User` table. Logging in exchanges it for a short-lived JWT via `POST /api/v1/auth/anonymous`.

### 1.4 Quick health check

| Check | URL / command | Expected |
|-------|---------------|----------|
| API up | `http://localhost:3333/api/v1/info` | JSON response |
| Client up | `https://localhost:4200/en` | Login page |
| Signals API | `GET /api/v1/signals` (with JWT) | `{ buy, sell, hold, reinvest }` |
| Redis | `docker exec gf-redis-dev redis-cli -a <pw> ping` | `PONG` |

---

## 2. How the system fits together

```
                ┌─────────────────────────────────────────────┐
                │                 CronService                  │
                │  every 30 min  → enqueue signal evaluation   │
                │  every 4 hours → enqueue portfolio report    │  ← new
                └───────────────┬─────────────────────────────┘
                                │ (BullMQ queue: TRADING_SIGNALS_QUEUE)
                                ▼
                ┌─────────────────────────────────────────────┐
                │           TradingSignalsProcessor            │
                │  resolves each non-DEMO user → SignalsService│
                └───────────────┬─────────────────────────────┘
                                ▼
   ┌────────────────────────────────────────────────────────────────┐
   │                        SignalsService                           │
   │  1. Build universe: owned holdings + watchlist                  │
   │  2. Live quotes  (DataProviderService.getQuotes, cached)        │
   │  3. 400d history (MarketDataService.getRange)                   │
   │  4. IndicatorsService → snapshot + 0–100 score (Tier 1)         │
   │  5. ForecastService  → expected-move band, hit-prob, sizing     │
   │  6. Classify BUY / SELL / HOLD / REINVEST                       │
   │  7. Diff vs SignalState → Telegram only on category change      │
   └───────────────┬───────────────────────────────┬────────────────┘
                   ▼                                ▼
          TelegramBotService                  GET /api/v1/signals
          (push to iPhone)                    (Signals page in PWA)
```

Key source files:

| Concern | File |
|---------|------|
| Orchestrator | `apps/api/src/services/signals/signals.service.ts` |
| Tier 1 indicators + score | `apps/api/src/services/signals/indicators.service.ts` |
| Tier 2 forecast + sizing | `apps/api/src/services/signals/forecast.service.ts` |
| Tier 3 backtest | `apps/api/src/services/signals/backtest.service.ts` |
| Telegram notifier | `apps/api/src/services/telegram-bot/telegram-bot.service.ts` |
| Cron schedule | `apps/api/src/services/cron/cron.service.ts` |
| Queue + processor | `apps/api/src/services/queues/trading-signals/` |
| Live quotes / cache | `apps/api/src/services/data-provider/data-provider.service.ts` |
| Yahoo provider | `apps/api/src/services/data-provider/yahoo-finance/yahoo-finance.service.ts` |

---

## 3. The metrics — what every number means

All indicators are computed in **pure TypeScript** (no Python, no ML) from **end-of-day close prices** stored in the `MarketData` table (up to 400 trailing days), plus the **live quote** from Yahoo. Live volatility is measured close-to-close (EOD data has no intraday range, so true ATR isn't available).

### 3.1 Tier 1 — technical indicators (`IndicatorsService`)

| Metric | Meaning | Buy-favorable when… |
|--------|---------|---------------------|
| **RSI (14)** | Wilder's Relative Strength Index, 0–100. Momentum oscillator. | RSI low (<30, oversold) |
| **MACD (12/26/9)** | Trend/momentum: fast EMA − slow EMA, plus a 9-period signal line and histogram. | Histogram ≥ 0 (momentum turning up) |
| **Bollinger %B (20, 2σ)** | Where price sits in its band: 0 = lower band, 1 = upper band. | %B low (price near/below lower band) |
| **SMA 50 / SMA 200** | Simple moving averages = trend regime. | Price ≥ SMA200 (healthy uptrend) |
| **Momentum 3M / 12M** | % change over 63 / 252 trading days. | 12M momentum ≥ 0 (quality filter) |
| **Volatility (σ)** | Std-dev of daily log returns. Drives the adaptive bands. | — (used for sizing/thresholds) |

### 3.2 Composite score (0–100)

A single "buy attractiveness" number, a **weighted blend** so several signals must agree before a candidate ranks highly:

```
score =  0.25·(100−RSI)            # oversold is attractive
       + 0.30·(1−%B)·100           # near lower band is attractive
       + 0.15·(MACD hist ≥0 ?100:30)
       + 0.15·(price ≥ SMA200 ?100:20)   # trend gate
       + 0.15·(12M momentum ≥0 ?100:30)  # quality gate
```

The score **ranks** candidates (act on the strongest, not the first to cross a line). It does **not** by itself trigger a trade — the category decision uses the adaptive price bands below.

### 3.3 Adaptive thresholds (volatility-aware, horizon-scaled)

All exit levels use a common unit: the **expected-move band over the trading horizon**, `band = σ·√H` where `H = SIGNAL_HORIZON_DAYS` (42 ≈ 2 trading months) and σ is the daily close-to-close volatility. This makes every level reachable inside the ~2-month window you actually trade in — though note this only sizes the *price* bands; there is no day-count exit, so a position can still sit open past the horizon if price never crosses a level.

- **Buy level** = `min( recentHigh·(1−dropPct), recentHigh·(1−k·σ·√42) )` — the more conservative of the fixed dip and the `k`-sigma band, with `k = SIGNAL_BUY_SIGMA_MULT = 1.5` and `dropPct = 10%` for stocks. (Fixed 2026-07-02: `adaptiveBuyLevel` used to hardcode a 20-day window internally regardless of `SIGNAL_HORIZON_DAYS` — it now takes `horizonDays` explicitly, so the buy-entry threshold stays consistent with the take-profit/stop/trail levels below.)
- **ETF calibration (added 2026-07-08):** ETFs use `dropPct = SIGNAL_ETF_BUY_DROP_PCT = 5%` and `k = SIGNAL_ETF_BUY_SIGMA_MULT = 1.0`. Rationale: diversified ETFs essentially never print a 10% drop off a 30-day high outside a crash (broad index ETFs typically sit 1–3% off), and the 1.5σ leg pushed volatile thematic ETFs to 20–40% required drops — which is why no ETF signal ever fired before this calibration despite ETFs passing every other gate. The asset type comes from `SymbolProfile.assetSubClass`; a per-symbol `SignalConfig.buyDropPct` differing from the 10% default still overrides. Telegram labels these `BUY (ETF dip)`. The same calibration is applied in backtests (`backtestAll` and the single-symbol endpoint via `?sigmaMult=`).
- **Take-profit target** = `(avgBuy + feePerShare)·(1 + max(floorPct, 1.5·band))` — scaled to each stock's own expected move, fee-adjusted, never below a 13.4% floor.
- **Stop-loss** = `avgBuy·(1 − 2·band)` — defined downside (active trades only).
- **Trailing stop** = `peak·(1 − 1·band)` — once the target is hit, the position rides its running peak and exits on a pullback.
- **Downtrend guard:** the default `DIP` BUY is suppressed when `SMA50 < SMA200 AND price < SMA200` (avoid catching a falling knife). Beaten-down names are reachable only via the separate, flagged `REVERSAL` path (§4.2b), which demands a *confirmed* bottom + volume.

> **Why horizon-scaled?** Expected move grows with √time: a 1.5%-daily-vol stock moves ~9.7% (1σ) over 42 days, so a flat +30% target is still a multi-sigma event that essentially never fires in ~2 months. Scaling the target to the stock's own band keeps it reachable. Fees ($5 buy + $5 sell, distributed across the held shares) are folded into the cost basis so the target clears commissions.

### 3.4 Tier 2 — probabilistic forecast (`ForecastService`)

These are **context, not predictions** — a calibrated band and a probability, never a point price target.

| Output | Meaning |
|--------|---------|
| **EWMA volatility** | RiskMetrics (λ=0.94) daily vol — reacts faster to recent moves than plain σ. |
| **Drift** | Mean daily log return, clamped to ±0.2%/day so forecasts stay conservative. |
| **Expected-move band** | Over the 42-trading-day horizon (same `SIGNAL_HORIZON_DAYS` as the buy/stop/target bands): `price·e^(drift·h)` ± `k·σ·√h`, as absolute prices. |
| **Hit-target probability** | Monte Carlo (2,000 GBM paths) — chance the price *touches* the target within the horizon. |
| **Suggested amount** | Volatility-targeted, capped fractional-Kelly sizing: more volatile names get less capital (`min(25%, 20%/annualVol)` of the budget). |

### 3.5 Tier 3 — backtest (`BacktestService`)

Replays the engine over historical `MarketData` to report **win rate, average return, max drawdown** before you trust a threshold change. Run on demand (admin endpoint / script), **not** in the 30-minute loop.

---

## 4. The decision rules (BUY / SELL / HOLD / REINVEST)

Evaluated per symbol every run, in the asset's **native currency**.

### 4.1 Exit state machine (active trades)

Owned positions flagged `isActiveTrade` are managed by a small two-phase state machine, persisted via `SignalState.trailingPeak` (null = watching, a number = trailing). Core/long-term holdings (not flagged active-trade) are **never** sold by the engine.

**WATCHING** (`trailingPeak` is null):
- `livePrice ≤ stop-loss` → **SELL** (🛑 cut the loss).
- `livePrice ≥ take-profit target` → **enter TRAILING** (records the peak; sends a one-time "🎯 target reached, now trailing" Telegram note — does *not* sell yet).
- otherwise → **HOLD** (shows the current target and stop).

**TRAILING** (`trailingPeak` is set):
- tracks the running peak each run; trailing stop = `peak·(1 − band)`.
- `livePrice ≤ trailing stop` → **SELL** (📉 lock in gains on the pullback).
- otherwise → **HOLD** (shows peak and trailing-exit price).

This gives a defined downside (a real risk:reward), a horizon-reachable target, and lets winners run past the target instead of capping them. SELL reasons report **net** gain after the $10 round-trip fee.

### 4.2 BUY — `DIP` (multi-factor confirmed dip in an uptrend)

The default buy path. A `DIP` BUY fires only when **all** hold (applies to owned core dips and watchlist candidates; active trades are handled by the exit machine above):

1. `livePrice ≤ adaptive buy level` (the dip).
2. **not** in a confirmed downtrend (`SMA50 < SMA200 AND price < SMA200`).
3. **composite score ≥ 55** — the indicator score now *gates* the entry (previously it only ranked).
4. **up day** — `livePrice > previous close` (reversal confirmation; avoids buying a still-falling knife).
5. **news sentiment ≥ −0.2** — suppresses dip-buys on bad news (skipped when no news data; see §11).

The BUY reason lists which factors aligned (score, % off high, up-day %, sentiment). The signal carries `signalType: 'DIP'`, `bearMarket: false`. Suggested size is volatility-targeted and shrunk further on negative (but above-floor) sentiment.

### 4.2b BUY — `REVERSAL` (counter-trend, bear-market — higher risk, flagged)

The `DIP` path above is deliberately uptrend-only: rules 2–4 block any name trading below its 200-day, which is exactly the beaten-down "bear-market" names you noticed *never* produced a buy. Catching those is **catching a falling knife** unless the bottom is confirmed. The `REVERSAL` path is the controlled way to buy weakness — it requires a *confirmed* turn, not just a low price, and it is **always flagged as higher-risk**.

A `REVERSAL` BUY fires only on a beaten-down name (not owned / not an active trade) when **all** of these confirm a bottom (`IndicatorsService.reversalStructure`):

1. **beaten down** — `price < SMA200` (below the long-term trend; the `DIP` path would have rejected it).
2. **RSI turning up but not overbought** — `RSI > RSI(prev)` **and** `RSI < SIGNAL_REVERSAL_RSI_MAX` (70). The oversold washout happened *during* the decline; we want RSI rising back through the mid-range, **not** a vertical rip that's already overbought (that's chasing, not a reversal entry).
3. **higher low** — `min(last 5 closes) > min(prior 5 closes)` (the structural sign the downtrend has stopped making new lows).
4. **reclaimed the 20-day** — `price ≥ SMA20` (price has retaken the short-term average).
5. **capitulation / participation volume** — last volume `≥ SIGNAL_REVERSAL_VOLUME_RATIO` (1.3) × the 20-day average, when volume data is available (skipped if not). Real bottoms turn on volume; a quiet drift up is not confirmation.

When all confirm, the signal is emitted as `category: 'BUY'`, `signalType: 'REVERSAL'`, `bearMarket: true`, with `adaptiveLevel = SMA20`. The Telegram alert is labelled **"⚠️ REVERSAL BUY (bear-market)"** and the reason spells out the confirmations (`down X% off high; RSI turning up (n); reclaimed 20-day + higher-low; volume N× avg`). In the strategy builder, a confirmed reversal is the **only** way a downtrend name passes the eligibility gate (`!isDowntrend || isReversal`), and its rationale carries the same ⚠️ REVERSAL flag — it still has to clear the EV/conviction ranking and the volatility cap like any other candidate, so it is never auto-promoted just for being cheap.

Config: `SIGNAL_REVERSAL_RSI_MAX` (RSI ceiling, 70) and `SIGNAL_REVERSAL_VOLUME_RATIO` (volume multiple, 1.3) in `libs/common/src/lib/config.ts`. OHLCV for the volume check comes from `OhlcService` (Yahoo chart API, cached 1h; never throws — a fetch miss just drops the volume gate, it does not block the signal).

### 4.3 HOLD / REINVEST

- **HOLD** — owned, no trigger met. (Surfaced in the API/PWA, never pushed to Telegram.)
- **REINVEST** — portfolio-level: cash ≥ threshold **or** a SELL fired this run ⇒ suggests deploying at your **80/20** index/stocks target.

### De-duplication (no spam)

Telegram fires **only when a symbol's category changes** vs the stored `SignalState.lastSignal`, and only if a **6-hour cooldown** has passed. Running the job twice with no change ⇒ no second message. This is why your earlier test only sent on the manual trigger.

---

## 5. Live data & Yahoo rate limiting

### 5.1 How quotes flow

`SignalsService` calls `DataProviderService.getQuotes({ useCache: true })`:

1. For each symbol, check **Redis** first (`CACHE_QUOTES_TTL`, default **1 minute**).
2. Cache miss → fetch from Yahoo, **batched 50 symbols per request** (`getMaxNumberOfSymbolsPerRequest = 50`), then cache.
3. If Yahoo's primary `quote()` call fails, it falls back to `quoteSummary()` automatically.

### 5.2 Will the 30-minute job hit the rate limit? — **No, in steady state.**

Your universe is ~3 holdings + ~150 watchlist ≈ **153 symbols → 4 Yahoo requests** per evaluation (153 ÷ 50, rounded up). At one evaluation per 30 min that's **~8 requests/hour** from signals, plus the hourly 7-day data-gathering job. That is **far** below Yahoo's unauthenticated tolerance.

**The `Too Many Requests` you saw earlier was a burst**, not steady state — it came from the one-off full-history backfill (`gather/max` over 150 symbols × years of data) combined with repeated portfolio reloads during setup/debugging. Normal operation does not do that.

### 5.3 Safeguards (recommended, in priority order)

1. **Raise the quote cache TTL** so the signals job, the portfolio page, and the data-gathering job *share* cached quotes instead of each re-fetching. Set in `.env`:
   ```
   CACHE_QUOTES_TTL=300000   # 5 minutes (ms)
   ```
   With a 30-min job this still gives fresh-enough prices and collapses redundant fetches.
2. **Keep `useCache: true`** everywhere in the hot path (already the case).
3. **Avoid `gather/max`** except for a one-time backfill. Routine gathering uses the 7-day window (cheap).
4. **(Optional) Add a fallback provider** for resilience — Ghostfolio supports multiple (e.g. `FINANCIAL_MODELING_PREP`, `EOD_HISTORICAL_DATA`, `COINGECKO` for crypto). Configure an API key and the provider order; Yahoo stays primary. **Not required** at your volume — add it only if you later see repeated Yahoo outages.

**Verdict:** Yahoo alone is fine for a single-user 30-minute cadence. The cache-TTL bump is the only change worth making now.

---

## 6. Currency handling

- **Native currency** is the source of truth for each stock's BUY/SELL logic (avg buy price and live quote are compared in the asset's own currency — an SEK stock is judged in SEK, a USD stock in USD).
- **USD is the base/ranking currency.** For cross-asset ranking, portfolio totals, and the periodic report, each value is converted to USD via `ExchangeRateDataService.toCurrency(value, native, 'USD')`. Reports show **both**: the native price *and* the USD-normalized value.
- Funds priced in SEK need an SEK→USD rate in the DB to convert; missing rates are logged and that line is shown in native currency only (it won't break the run).

---

## 7. The 4-hour portfolio report (heartbeat)

Separate from the event-driven alerts, a **scheduled report every 4 hours** (market days) pushes a Telegram summary of each owned asset regardless of whether a signal changed:

- Current price (native + USD)
- **Day change %** (vs previous close) and **Week change %** (vs close 5 trading days ago)
- Change vs your **reference (average) buy price**
- Total portfolio value in USD

This gives you a regular pulse even when no threshold is crossed. Implemented as an `EVERY_4_HOURS` cron → report job → `SignalsService.sendPortfolioReport(userId)`.

---

## 8. Production readiness checklist

This stays **single-user**. For a 24/7 deployment (so alerts fire even when your phone is closed):

- [ ] **Host on a small VPS** (e.g. Hetzner CX22 ~€4/mo). Run the provided `docker compose` stack (API + Postgres + Redis).
- [ ] **Set `REDIS_HOST=redis`** (Docker-internal hostname) in the production `.env`. (`localhost` is only for running the API on the Windows host.)
- [ ] **Strong secrets:** rotate `ACCESS_TOKEN_SALT`, `JWT_SECRET_KEY`, DB and Redis passwords. Keep `.env` out of git.
- [ ] **HTTPS** via Caddy/Traefik (or the provider's TLS) so the PWA is installable on iOS and tokens aren't sent in clear.
- [ ] **`CACHE_QUOTES_TTL=300000`** (see §5.3).
- [ ] **Telegram secrets** set (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) — already configured locally.
- [ ] **Backups:** a nightly `pg_dump` of the Postgres volume (your holdings, config, signal state).
- [ ] **Persisted Docker volumes** for Postgres and Redis so data survives restarts.
- [ ] **Run the migration** (`prisma migrate deploy`) on the server before first boot.
- [ ] **PWA install:** open the HTTPS URL in Safari on the iPhone 15 Pro → Add to Home Screen.

### Secrets — never commit
`.env` contains live Telegram credentials and DB/Redis passwords. It must stay gitignored and out of any screenshots or pasted logs.

---

## 9. Common operational tasks

| Task | Command |
|------|---------|
| Restart API | Stop the `start:server` process, re-run `npm run start:server` |
| Flush stale quote cache | `docker exec gf-redis-dev redis-cli -a <pw> FLUSHALL` |
| Inspect data | `npx prisma studio` → http://localhost:5555 |
| Re-fetch 7-day prices | `POST /api/v1/admin/gather` (JWT) |
| One-time full backfill | `POST /api/v1/admin/gather/max` (JWT) — use sparingly (§5.2) |
| See current signals | `GET /api/v1/signals` (JWT) |
| Tune a symbol's thresholds | `PUT /api/v1/signals/config/:dataSource/:symbol` |

---

## 10. Conversational Telegram assistant (local Gemma 4)

You can message the bot in plain language to log trades, check your balance, or reset cash. All intent extraction runs **fully locally** on Gemma 4 via Ollama — no cloud LLM call is made for your financial commands.

### 10.1 One-time setup

#### a) Install Ollama and pull the model

1. Download and install Ollama from https://ollama.com/download (Windows installer).
2. Pull the model — either of these works:
   ```powershell
   ollama pull gemma4        # default tag (Ollama picks the recommended variant)
   # or, explicitly the CPU-optimised Effective-4B (~9.6 GB, best for your hardware):
   ollama pull gemma4:e4b
   ```
3. Verify what was downloaded:
   ```powershell
   ollama list
   # example output:
   # NAME           ID            SIZE    MODIFIED
   # gemma4:latest  ...           9.6 GB  ...
   ```
   Note the exact **NAME** shown — you will paste it into `.env` in the next step.

4. Make sure Ollama is running:
   ```powershell
   ollama serve   # or it may already be running as a background service after install
   ```
   Confirm: `curl http://localhost:11434` should return `Ollama is running`.

#### b) Add three lines to `.env`

Open `C:\dev\ghostfolio\.env` in any text editor and append at the bottom:

```env
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=gemma4          # ← replace with the exact NAME from `ollama list`
TELEGRAM_POLLING_ENABLED=true
```

#### c) Set your starting cash (first use only)

After restarting the API, send the bot:

```
set my cash to 5000
```

(Replace 5000 with your actual available cash in USD.) Confirm with the ✅ button. All future BUY/SELL actions will adjust this balance automatically.

#### d) Restart the API

```powershell
# Stop the running start:server process (Ctrl-C), then:
npm run start:server
```

You will see `Telegram long-polling listener started` in the API log when it connects.

---

### 10.2 Commands you can send the bot

The assistant understands natural language — it is not keyword-based. These examples show what it can parse:

| What you type | What happens |
|---------------|--------------|
| `I sold 2 AAPL at 300` | Logs a SELL activity (qty 2, $300/share); adds $600 to cash |
| `bought 5 NVDA at 130 usd` | Logs a BUY; subtracts $650 from cash |
| `I sold 1 GOOGL at 175 yesterday` | Logs a SELL with yesterday's date |
| `what's my balance` | Shows current available cash |
| `set my cash to 5000` | Sets cash to an absolute $5 000 (useful for initial setup or corrections) |
| `how much cash do I have?` | Same as balance query |

Anything ambiguous ("I sold some apple") → the bot asks you to rephrase, naming what's missing.

---

### 10.3 The confirmation guardrail

**Every state-changing action requires a tap before anything is written.**

1. You send a command.
2. The bot replies with a human-readable summary:
   ```
   SELL 2 AAPL @ $300.00 = $600.00 → cash will rise to ~$4 200.00
   [✅ Confirm]  [❌ Cancel]
   ```
3. Tap ✅ to execute, ❌ to discard. No button tap = nothing happens. Pending actions expire after **10 minutes**.

Each token is one-time — tapping ✅ twice does nothing the second time.

---

### 10.4 News prompt after signal alerts

When the signal engine fires a BUY or SELL alert, the bot automatically sends a second message with a pre-formed Google search string:

```
🔎 Paste into Google: Apple (AAPL), Nvidia (NVDA) latest news, earnings & analyst ratings June 2026
```

Copy and paste it into Google (or any search bar) to get current news for the flagged stocks. No model is involved — this is a deterministic string built from the signal results.

---

### 10.5 How the intent extraction works (under the hood)

```
Your message
    │
    ▼
OllamaService.extractIntent()
    POST http://localhost:11434/api/chat
    model: gemma4:e4b  (or whatever OLLAMA_MODEL is set to)
    temperature: 0          ← deterministic
    format: <JSON schema>   ← structured output
    think: (default)        ← NEVER set think:false — breaks JSON format on Gemma 4
    │
    ▼
{ action, symbol, type, quantity, price, currency, date }
    │  or { action: 'unknown', clarify: '...' }
    │
    ▼ (if add_trade / set_cash)
Redis pending-action store  (UUID token, 10-min TTL)
    │
    ▼ (on ✅ Confirm)
ActivitiesService.createActivity({ updateAccountBalance: true })
    └─ BUY  → cash − qty × price
    └─ SELL → cash + qty × price
    │
    ▼
Reply: "Logged. Cash now $X"
```

**Tight system prompt:** the model is told to extract only what is explicitly stated, never invent quantities/prices/symbols, and return `action:'unknown'` if anything required is missing. Known ticker symbols from your portfolio and watchlist are passed as context so "Apple" reliably maps to AAPL.

---

### 10.6 Relevant source files

| Concern | File |
|---------|------|
| Ollama client | `apps/api/src/services/ollama/ollama.service.ts` |
| Intent dispatch + Redis guardrail | `apps/api/src/services/telegram-bot/telegram-assistant.service.ts` |
| Long-poll receiver | `apps/api/src/services/telegram-bot/telegram-listener.service.ts` |
| Bot sender (buttons + callbacks) | `apps/api/src/services/telegram-bot/telegram-bot.service.ts` |
| Env vars | `OLLAMA_API_URL`, `OLLAMA_MODEL`, `TELEGRAM_POLLING_ENABLED` in `.env` |

---

### 10.7 Production note (VPS)

When you move to a VPS, switch from long-polling to a **webhook** (Telegram pushes updates to your HTTPS endpoint instead). Set `TELEGRAM_POLLING_ENABLED=false` and configure a Telegram webhook pointing at `https://your-domain/api/v1/telegram/webhook`. Polling is ideal for local single-user dev; webhooks are cleaner at production.

---

## 11. News sentiment (optional risk gate)

The engine can fold **per-ticker news sentiment** into the BUY decision. It is used as a **risk gate**, not a directional signal: research consistently shows news sentiment predicts *volatility* far more reliably than direction, so its job here is to **suppress dip-buys on bad news** and shrink position size on negative-but-not-disqualifying sentiment. It is **off by default** and the rest of the engine behaves identically until a key is set.

### 11.1 What it does

- A negative dip (e.g. a stock down 10% on a guidance cut) no longer looks identical to a healthy dip — a sentiment below the floor (`−0.2`) blocks the BUY.
- Sentiment is age-decayed (3-day half-life) so stale news fades out.
- Only fetched for **dipping, potentially-buyable symbols** (a cheap price pre-check), never the whole watchlist — this keeps free-tier API usage to a handful of calls per day. Results are cached in Redis for 6 hours.

### 11.2 Setup

1. Get a free API key:
   - **Alpha Vantage** (default, recommended): https://www.alphavantage.co/support/#api-key — the free `NEWS_SENTIMENT` endpoint returns a ready per-ticker score (25 requests/day, which the 6-hour cache keeps you well under).
   - *(or Finnhub — set `NEWS_SENTIMENT_PROVIDER=FINNHUB`.)*
2. Add to `.env`:
   ```env
   NEWS_SENTIMENT_API_KEY=your_key_here
   # NEWS_SENTIMENT_PROVIDER=ALPHA_VANTAGE   # default; only change for Finnhub
   ```
   > If you already use Alpha Vantage as a Ghostfolio data provider (`API_KEY_ALPHA_VANTAGE`), the feature reuses that key automatically — you can skip `NEWS_SENTIMENT_API_KEY`.
3. Restart the API. With no key set, the news gate is simply skipped (identical behavior to before).

### 11.3 How it scores

| Step | Detail |
|------|--------|
| Source | Alpha Vantage `NEWS_SENTIMENT?tickers=SYM` → `feed[].ticker_sentiment[].ticker_sentiment_score` |
| Reduce | Age-decayed weighted average over recent articles → one score in `[−1, +1]` |
| Decay | `weight = exp(−ln2/3 × ageDays)` (3-day half-life) |
| Gate | BUY blocked if `score < −0.2`; suggested size scaled by `(1 + score)` when negative |
| Cache | `news:sentiment:<symbol>` in Redis, 6h TTL (1h on a rate-limited miss) |
| Failure | Never throws — missing key / no coverage / errors → `null` → gate skipped |

### 11.4 Relevant source files

| Concern | File |
|---------|------|
| Sentiment fetch + cache + decay | `apps/api/src/services/news-sentiment/news-sentiment.service.ts` |
| BUY gate + lazy fetch | `resolveNewsScore` / `evaluateSymbol` in `apps/api/src/services/signals/signals.service.ts` |
| Env vars | `NEWS_SENTIMENT_API_KEY`, `NEWS_SENTIMENT_PROVIDER` (falls back to `API_KEY_ALPHA_VANTAGE`) |

---

## 12. Company catalog (known-company universe)

To trade well-known leaders, a curated catalog of Nordnet-tradeable companies — grouped by **category** (tech, quantum-computing, bank, insurance, cars, aviation, clothing/sport/fashion, construction, databases, energy/petrol, entertainment, funds, food, health, logistics, manufacturing/cooling, metals/mining) — can be bulk-added to your watchlist so the signal engine scores them and the budget strategies (§13) can draw on them.

- **Catalog source of truth:** `libs/common/src/lib/company-catalog.ts` (`COMPANY_CATALOG`, `categoryForSymbol`). Ghostfolio's `Tag` model only tags activities, not watchlist symbols, so the category taxonomy lives here. Edit this file to add/remove companies or categories.
- **Import (one-time):** `POST /api/v1/signals/catalog/import` (JWT). Each company is added via the standard watchlist path, which also creates its asset profile and gathers history. Unknown/unsupported tickers are reported in `failed` and skipped — never fatal. Returns `{ added, failed }`.
- New symbols need **one gather pass** before indicators/scores are meaningful (the import triggers it per symbol).

---

## 13. Budget strategies (deterministic allocation)

You add ~$200–250/month and free cash by selling. When fresh cash appears, the bot proposes **3–5 concrete allocation strategies** sized to the balance. **As long as cash hasn't increased, no strategies are sent.**

### 13.1 Trigger
A per-user `CASH` row in `SignalState` stores the last-seen base-currency cash. On each run, strategies fire when `cash ≥ $50` **and** (cash rose by **≥ $50** since last seen **or** a SELL fired this run), throttled by the notification cooldown. The last-seen cash is always updated so the next increase is measured from the new level.

### 13.2 60/40 rebalance split
The plan leads with a **rebalance toward 60% funds / 40% stocks** (`SIGNAL_PORTFOLIO_FUNDS_RATIO`). Owned positions are valued and split by sleeve (MANUAL = funds, YAHOO = stocks); fresh cash is then split so the **under-weight sleeve gets it first** (`fundsCash`/`stocksCash`). The message shows your current %, the target, and how much to put into each sleeve this month.

### 13.3 Expected-value ranking — "most solid likely investment"
The **whole watchlist is evaluated every run** (not just names passing the strict BUY gate). Picks are ranked by **expected value per trade**, the decision-meaningful quantity:

```
EV = P(reach target) × targetGain − P(miss) × stopLoss
```
- **P(reach target)** is the analytic **TERMINAL** probability `P(price ends ≥ target over the horizon)` with **drift = 0** (estimating drift from short history is dominated by noise, and biases toward whatever just ran up). The same terminal metric is used for the per-symbol signals, so the two are comparable.
- `targetGain` / `stopLoss` are the same horizon-scaled bands the exit machine uses.
- The composite **score is only an eligibility gate** (≥ 45, drops no-history/junk names) — it is *not* multiplied into the ranking, which avoids double-counting trend.
- Eligible = not a downtrend, not just sold/stopped, score ≥ 45, and annual vol ≤ 90% (a liquidity/blow-up cap).
- Conviction (0–100) is a readable rendering of EV: 0% EV ≈ 50, +5% ≈ 100, −5% ≈ 0.

> **Honesty note:** reaching a fixed +13.4% *terminally* within ~2 months is genuinely unlikely for a normal stock (~3–15%), so EV is **often negative and conviction often low** — the engine is telling you there's no compelling buy right now rather than manufacturing optimism. If you want more actionable numbers, lower the target or lengthen the horizon.

Every stock leg prints its rationale, e.g.:
`NVDA — conviction 64/100 · EV +1.8% (28% × +9% target vs 72% × −7% stop, ~2mo, drift 0) · down 9.0% off 30-day high · RSI 36 · score 71/100 · uptrend · news n/a`.

### 13.3a Backtest — now credible (`GET /signals/backtest/:ds/:symbol`)
Reports, alongside the strategy result: a **buy-and-hold benchmark** (the bar to beat), **Sharpe / Sortino / Calmar / profit factor / exposure / CAGR**, an **out-of-sample** summary (held-out last 30% — guards against overfitting), and a **slippage** charge per side (`?slippageBps=`, default 10). Example finding: NVDA's active strategy returned **−3% net vs +13.5% buy-and-hold**, with out-of-sample Sharpe far below in-sample — i.e. *holding* beat *trading* once costs are modeled. Treat backtests on the hand-curated catalog as **survivorship-biased and optimistic**.

### 13.4 Recent-signal control
Before recommending, each candidate is re-checked against its last signal (`SignalState`, within `SIGNAL_RECENT_SIGNAL_WINDOW` = 14 days):
- **Recently signalled BUY, still valid** → tagged `↺ re-confirmed (BUY Nd ago, still valid)` + small conviction boost.
- **Recently SELL / stopped** → **excluded** (don't re-buy what you just exited).

### 13.5 The strategies (all numbers computed by code — never by Gemma)
**Whole shares only**, flat $5 fee per stock leg; the index leg is a fund (cash amount).

| Strategy | Allocation (from the stock sleeve cash) |
|----------|-----------|
| **Aggressive** | 100% into the single highest-**conviction** name |
| **Balanced** | top 2 distinct sectors by conviction, ~50/50 |
| **Spread** | top 3–5 distinct sectors by conviction, even split |
| **Safe 80/20** | 80% → NORDNET_GLOBAL_INDEX fund, 20% → top conviction stock |

Each strategy reports shares, cost, fees, leftover cash, and the per-pick rationale. Endpoints: `GET /api/v1/signals/strategies` (JSON), `POST /api/v1/signals/strategies/send` (push). Auto-sent on the cash-increase trigger.

### 13.6 Gemma's role (strictly non-arithmetic)
The deterministic strategies message is **authoritative**. Optionally, the rendered text is passed to the local Gemma model (`OllamaService.interpretStrategies`) for a 2–3 sentence plain-language note ("cautious vs aggressive this month"), appended under `🤖 AI note:`. **Gemma never computes or emits a number** — it only paraphrases. If Ollama is unavailable or returns junk, the note is omitted and the deterministic strategies still send.

### 13.7 Telegram assistant — new questions
Beyond trade logging / balance / set-cash, the bot now understands:
- **"how long have I held NVDA"** → `📅 You've held NVDA since 2025-11-24 — 204 days.` (read-only; the date math is done in code, not Gemma).
- **"add Tesla to my watchlist"** → confirmation button → adds it (validated; bad tickers rejected).
- **"set Nordnet Global NAV to 241.10"** → updates a manual fund's NAV (see §14).

### 13.8 Relevant source files

| Concern | File |
|---------|------|
| Conviction, ranking, rationale, rebalance | `apps/api/src/services/signals/strategies.service.ts` |
| Full-universe candidates + recent-signal control + send | `evaluateSymbol` / `enrichWithRecentSignals` / `maybeSendStrategies` in `signals.service.ts` |
| Analytic reach probability | `reachProbability` in `apps/api/src/services/signals/forecast.service.ts` |
| Catalog | `libs/common/src/lib/company-catalog.ts` |
| Constants | `SIGNAL_CONVICTION_PROB_WEIGHT`, `SIGNAL_BUYZONE_CONVICTION_BONUS`, `SIGNAL_RECENT_SIGNAL_WINDOW`, `SIGNAL_PORTFOLIO_FUNDS_RATIO` in `libs/common/src/lib/config.ts` |

---

## 14. Funds (NAV tracking, weekly signal, 60/40 rebalance)

Yahoo doesn't price Nordic funds, so each fund is a **`MANUAL` asset** whose NAV is scraped from a JSON endpoint via Ghostfolio's `scraperConfiguration`.

### 14.0 Fund history backfill + daily sync + metrics (added 2026-07-09)
`FundHistoryService` (`apps/api/src/services/signals/fund-history.service.ts`) keeps a **full year of daily NAV history** per fund and a facts cache, fully automated:
- **History source: Avanza's public fund-guide API** (`_api/fund-guide/chart/{orderbookId}/one_year` = daily %-development, reconstructed to absolute NAV anchored at the current NAV from `_api/fund-guide/guide/{orderbookId}`). Nordnet's own timeseries API requires a logged-in session (verified: anonymous → empty), so it can't be used server-side. ~57/71 funds are Avanza-listed and get the year backfilled; the rest (Nordnet-branded + a few institutional SEB/AXA) accumulate forward via the daily scraper.
- **Facts source: Nordnet's fund page `{nordnetUrl}?details`** — server-rendered anonymously, covers EVERY fund incl. Nordnet-branded: **Antal ägare hos Nordnet** (owner count, available nowhere else), ISIN (feeds precise Avanza resolution), Kategori, Morningstar rating (schema.org JSON-LD). Parsed by `parseNordnetFundDetails`.
- **Scheduling:** daily cron 07:30 + an on-boot catch-up whenever the last successful sync is >20h old — so machine-off days self-heal on the next start. Everything is idempotent (`createMany skipDuplicates`); state lives in the `Property` table (`SIGNAL_FUND_FACTS`, `SIGNAL_FUND_AVANZA_IDS`, `SIGNAL_FUND_HISTORY_LAST_SYNC`).
- **Metrics/ranking:** `GET /signals/funds/metrics` — per fund 1m/3m/6m/1y returns, annualized vol, max drawdown (from OUR MarketData; Avanza developments as fallback while history is short), fee, rating, Sharpe, AUM, owners, top holdings, and `riskAdjustedMomentum = return6m / annualVol` (the "interesting funds" ranking key). `POST /signals/funds/history/sync` triggers a manual sync. The weekly fund recommendation (`recommendFunds`) now picks the best risk-adjusted fund per category instead of merely the cheapest fee. The Watchlist has a **Funds** filter chip, and funds' Score/RSI/metric columns populate automatically now that history exists.
- Avanza search needs real Swedish spellings — profile names were seeded ASCII-transliterated, so `restoreSwedishFundName` maps e.g. `Lansforsakringar → Länsförsäkringar`, `Varlden → Världen` before searching.

### 14.1 Price sources
- **Avanza public JSON (auto).** Resolve `POST avanza.se/_api/search/filtered-search {query: ISIN|name}` → `orderBookId`; NAV from `GET avanza.se/_api/fund-guide/guide/{id}` (selector `$.nav`). The daily gather stores it. Used for ~10 funds (Länsförsäkringar, Swedbank Robur, Handelsbanken, SEB, Avanza, Storebrand…).
- **Nordnet's own funds have no public feed** (Avanza, a competitor, doesn't list them; Nordnet's API is closed; Yahoo/Morningstar are blocked/token-gated). These are **seeded** with a `defaultMarketPrice` and updated manually.
- **Nordnet API: rejected** — closed to new customers, key-auth, WebSocket-only prices.

### 14.2 Setup
`POST /api/v1/signals/catalog/import` for stocks; `POST /api/v1/signals/funds/import` for funds (resolves on Avanza, creates the MANUAL profile + scraper, adds to watchlist, gathers NAV, and records the 4 held funds as positions). Catalog of funds: `libs/common/src/lib/fund-catalog.ts`.

### 14.3 Updating a Nordnet fund's NAV (Telegram)
Message the bot, e.g. **`set Nordnet Global NAV to 241.10`**. Gemma extracts the fund + number (no arithmetic); code fuzzy-matches the fund, writes today's NAV, clears the cached quote, and replies `✅ Set Nordnet Global Index NAV to 241.10 SEK`. Takes a few seconds; index funds move <1%/day so occasional updates suffice.

### 14.4 Weekly fund recommendation
Funds are **excluded from the 30-min/4-hour stock signals** (tracking-only there). A **weekly job** (`@Cron` Mondays 12:00 → `FUND_SIGNALS`) recommends *which funds to buy* for monthly accumulation — ranked by under-weighted sector then lower fee. On-demand: `GET /api/v1/signals/funds/recommendations`, `POST .../send`.

### 14.5 60/40 rebalance
Owned funds (MANUAL) vs stocks (YAHOO) are valued each run; the budget plan steers fresh cash toward **60% funds / 40% stocks** (see §13.2). The funds sleeve buys the diversified fund picks; the stock sleeve buys the conviction-ranked stocks.

### 14.6 Relevant source files
| Concern | File |
|---------|------|
| Avanza resolver + scraper/seed config | `apps/api/src/services/signals/fund-data.service.ts` |
| Fund catalog (held + watchlist, seedNav) | `libs/common/src/lib/fund-catalog.ts` |
| Import + held positions + sleeve valuation | `importFunds` / `computeSignalsInternal` in `signals.service.ts` |
| Weekly recommendation | `computeFundRecommendations` / `sendFundRecommendations` in `signals.service.ts` |
| Set-NAV command | `setFundNav` in `apps/api/src/services/telegram-bot/telegram-assistant.service.ts` |

---

## 15. ETFs (thematic baskets in the stock sleeve)

ETFs are added like any other tradeable equity and **treated as stocks** (the 40% risk sleeve), because they have full market-price history and behave like equity bets — just diversified across a theme.

### 15.1 How they're handled
- **Priced via Yahoo** (XETRA `.DE` / EUR listings, e.g. `VVSM.DE` VanEck Semiconductor) — full OHLC history, so RSI/score/volatility/conviction work immediately (unlike NAV-only mutual funds).
- **Stock sleeve (33%)**: they flow into the **conviction / expected-value** strategies (Aggressive / Balanced / Spread) exactly like individual stocks, ranked by EV, gated by score ≥ 45, downtrend, recent-exit and the volatility cap.
- **Distinct theme categories** (`etf-semiconductors`, `etf-ai`, `etf-blockchain`, `etf-lithium-battery`, `etf-ev`, `etf-copper`, `etf-silver`, `etf-space`, `etf-new-energy`, `etf-datacenter-reits`, `etf-korea`, `etf-japan`, `etf-world-value`) so the diversified Balanced/Spread strategies don't stack two of the same theme.
- **Not** in the weekly *fund* recommendation or the 60% fund sleeve — that sleeve is reserved for broad, low-fee index *funds* (the safe core).

### 15.2 Why this split (and why it's still simple)
A thematic ETF (say semiconductors) is a concentrated equity bet — closer in risk to a stock than to a global index fund — so it belongs in the sleeve where you "pick winners". This keeps the 60/40 intact, adds **zero new optimism** (identical EV math), and required **no new asset-classification code** — they're just more YAHOO catalog entries.

> Remember §0.3: the backtest shows active trading usually *underperforms holding* on winners. ETFs are no different — use the signals as entry/risk timing, then mostly **hold** the themes you believe in.

### 15.3 Add / manage
- Bulk: `POST /api/v1/signals/catalog/import` (idempotent; bad tickers reported, not fatal).
- One-off from Telegram: *"add VanEck Semiconductor to my watchlist"* (or its ticker).
- To move an ETF to the fund sleeve later, it would need a fund-sleeve classification — deliberately not built, to stay simple.
- Catalog source: `libs/common/src/lib/company-catalog.ts` (the `etf-*` categories).

### 15.4 The whole-watchlist backtest
`GET /api/v1/signals/backtest/all` (JWT) backtests every YAHOO name (incl. ETFs once they have ≥60 days of history) and returns each one's **edge over buy-and-hold** plus a summary (how many beat holding, average/median edge). This is the tool that produced the §0.3 verdict — re-run it periodically to keep yourself honest about whether the trading sleeve is earning its risk.

---

## 16. Signal log + Analytics dashboard + watchlist columns

### 16.1 The signal log (audit trail)
Every time the engine **triggers an actionable signal** (BUY, SELL, REINVEST, REVERSAL, or a trailing-stop transition — never a routine HOLD), one row is appended to the `SignalLog` table with a full snapshot of the numbers behind it: date/time, symbol, category, type (DIP/REVERSAL), live price, the indicator readings (score, RSI, MACD histogram, Bollinger %B), the terminal reach-probability, the derived expected value / conviction and stop/target levels, news score, and the human-readable reason.

- **Where it's written:** `SignalsService.evaluateAndNotify` (the 30-min cron), at the moment a signal is de-duped and notified — so the log holds clean, discrete *events*, not 261 HOLDs per run. Logging is best-effort (try/catch): a logging failure never breaks the alert.
- **Read API:** `GET /api/v1/signals/log?days=30&category=&symbol=` (JWT) → newest-first rows + a 7-day / 30-day per-category summary.
- **Volume:** ~5–30 rows/day. The `metrics` JSON column is a forward-compat catch-all.

### 16.2 Watchlist columns
The watchlist (Home → Watchlist) now shows two extra columns so 250+ names are scannable:
- **Price** — the latest market price in the asset's native currency (makes the ETFs, sorted under long brand names, easy to find).
- **Buy signal** — 🟢 when that symbol had a **BUY logged in the last 30 days** (a single `SignalLog` lookup), `—` otherwise.

These are optional columns on the shared `gf-benchmark` table, gated by `[showSignalColumns]` — the Benchmarks page is unaffected.

### 16.3 Analytics dashboard (Home → Analytics)
A new tab next to Watchlist:
- **Summary cards** — BUY / REVERSAL / SELL / REINVEST counts for the last 7 and 30 days (click a card to filter the table).
- **Signal log table** — every triggered event with its metrics; column headers link into the glossary.
- **Metric glossary** — every metric defined with its **exact formula**, rendered from a single source: `libs/common/src/lib/signal-metrics-glossary.ts` (`SIGNAL_METRIC_DEFINITIONS`). The dashboard links each metric to its anchor (`#metric-composite-score`, `#metric-reach-probability`, …). This file is the **live mirror** of §0/§3/§4/§13 above — edit the formulas in one place and both the docs and the UI stay in sync.

---

## 17. Fundamentals overlay (valuation/quality/growth, optional context)

The engine is otherwise **100% technical** (price/volume only). This adds one independent second signal answering a different question — "is this a fundamentally sound business at a reasonable price," never "is this technically oversold right now" (that's the composite score, §3). It is **not** a BUY gate and is **not** folded into conviction ranking; it is computed and shown for context, the same cautious "plumbing only for now" rollout used for the ETF TER field.

### 17.1 What it does
- Pulls free Yahoo `quoteSummary` fundamentals — forward P/E, return on equity, earnings growth, and analyst recommendation consensus — for genuinely dipping, potentially-buyable symbols (same cheap-price pre-check as the news gate, §11), never the whole watchlist.
- Reduces the four inputs to one **0–100 fundamentals score**, re-normalized over whichever inputs are actually available (the same null-guarding pattern as the composite score, §3).
- Surfaced on the `BUY` signal's `reason` text (`fundamentals 72/100`) and the `fundamentalsScore` field on `TradingSignal` / `StrategyCandidate` — absent for most funds/ETFs and any name outside Yahoo fundamentals coverage.

### 17.2 How it scores

| Input | Weight | Scoring |
|-------|--------|---------|
| Forward P/E | 0.30 | `100 − 2·P/E` (clamped [0,100]); 20 flat if unprofitable (P/E ≤ 0) |
| Return on equity | 0.25 | `50 + 100·ROE` (clamped [0,100]) |
| Earnings growth | 0.25 | `50 + 100·growth` (clamped [0,100]) |
| Analyst consensus | 0.20 | net buy-lean ratio `(2·strongBuy + buy − sell − 2·strongSell) / total` → `50 + 25·ratio` |

### 17.3 Relevant source files

| Concern | File |
|---------|------|
| Fetch + score + cache | `apps/api/src/services/signals/fundamentals.service.ts` |
| Lazy fetch + wiring | `resolveFundamentalsScore` / `evaluateSymbol` in `apps/api/src/services/signals/signals.service.ts` |
| Cache | `fundamentals:<symbol>` in Redis, 24h TTL (2h on a retryable miss) — fundamentals move on an earnings cadence, not daily |
| Data source | `yahoo-finance2`'s `quoteSummary` (`defaultKeyStatistics`, `financialData`, `recommendationTrend` modules) — free, already a dependency, no extra auth |
