# Trading Signals — Operations & Reference Guide

Your self-hosted active-trading assistant, built on a Ghostfolio fork. This document is the single source of truth for **how to run it**, **what every metric means**, **how the signal engine decides BUY/SELL/HOLD/REINVEST**, **how live data and rate limits are handled**, and **what's needed for production**.

---

## 0. Philosophy, the numbers, and the honest evidence (read this first)

### 0.1 The allocation philosophy — 60/40

The portfolio targets **60% funds / 40% stocks-and-ETFs** (changed from 67/33 on 2026-07-09 — a deliberate, slightly more aggressive tilt for the 750 USD/month plan while quality names trade at a discount). The two sleeves play different roles:

- **Funds (60%) — the safe, diversified core.** Broad low-fee index funds (global, USA, EM, Sweden, Europe…). Bought and _held_. They are not traded on signals; the only "signal" is a **weekly recommendation** of which fund to add to keep the mix diversified and on-target. This is where most of the money lives and compounds quietly.
- **Stocks + ETFs (40%) — the risk sleeve, where you "pick winners".** Individual companies and thematic ETF baskets carry higher single-name risk and higher potential reward. This sleeve is where the expected-value engine operates.

Every month's contribution is split to **steer the actual mix back toward 60/40** (the under-weight sleeve gets the cash first). The 60/40 ratio, the safe-core idea, and the "concentrate risk in a small sleeve" discipline are the backbone — everything else is in service of it.

### 0.1b Monthly deployment playbook (750 USD/month, adopted 2026-07-09)

- **~450 USD → the fund sleeve.** Commission-free at Nordnet; follow the weekly fund recommendation for which fund(s) keep the mix diversified. No timing — this buys automatically cheaper units in drawdowns.
- **~300 USD → the stock/ETF sleeve, at most ONE stock order per month** (a $300 order costs 9 SEK + 0.25% ≈ $1.70, so ~0.6% round trip) **or up to TWO ETF orders** (2 × $150, only when two distinct ETF dip signals are genuinely live — two orders means paying the fixed 9 SEK twice — ~1.1% round trip on $300 — which must be worth the diversification).
- **Picks come from the expected-value ranking** (`GET /signals/strategies`), never from enthusiasm. While bear-market flags are up, prefer **REVERSAL-confirmed** entries over raw dips (a confirmed bottom + capitulation volume beats catching a falling knife).
- **Read the 📋 pre-buy screen block before acting on a BUY** (§18): 200-day trend, sector tailwind, analyst/EPS direction, next earnings date, headlines. Advisory only — but the simulation evidence says favor DIPs above their 200-day in rising sectors, and treat a REVERSAL as guilty until a real catalyst proves otherwise.
- **Sell only when the exit machine fires** (stop-loss / trailing) — never on a schedule. The backtest evidence (§0.3) is unambiguous: planned reselling is the falsified strategy; entry-timing + stop-discipline on held positions is what the engine is for.
- If the engine says "nothing compelling" (negative EV across the board), the stock-sleeve cash **waits in the account** — deploying into a bad month is not a goal.
- **Auto-plan on the 25th (added 2026-07-09):** a cron (`0 9 25 * *` on `SignalsService`) sends the full plan to Telegram on the 25th, assuming the `SIGNAL_MONTHLY_CONTRIBUTION_USD = 750` deposit when it hasn't been logged yet (clearly labeled; a real, higher balance wins). A boot catch-up sends it on the next start if the machine was off on the 25th (Property `SIGNAL_MONTHLY_PLAN_LAST_SENT` dedups per month). Logging the deposit still triggers the classic cash-delta plan too.
- **Market-regime line (advisory ONLY):** every delivered plan is headed by a one-liner from `MarketRegimeService` — VIX level + S&P 500 vs its 200-day (`classifyRegime`: RISK-OFF when VIX ≥ 30 or index < SMA200; RISK-ON when VIX < 20 and index > SMA200; else NEUTRAL). In RISK-OFF the advice is to split the stock sleeve into 2 tranches over 2-3 weeks and prefer REVERSAL-confirmed entries. **It never modifies the EV math or suggested amounts** — market-timing rules are unvalidated by our backtest layer, and hard-coding them would violate §0.2. The Academy Market Pulse indices remain display-only.

### 0.2 No built-in optimism — by design

The engine is deliberately **pessimistic/honest**, not promotional:

- Probabilities use the **terminal** distribution with **zero drift** (we do _not_ assume a stock keeps rising because it recently rose — "the drift problem"). Reaching a fixed +13.4% _terminally_ within ~2 months is genuinely unlikely (~3–15%), so **expected value is usually negative**. The system says _"nothing compelling to buy right now"_ far more often than it says "buy" — that is the feature, not a bug.
- Picks are ranked by **expected value** `EV = P(reach target)·gain − P(miss)·stop`, not by a feel-good score. The composite score is only an eligibility gate.
- Costs are modelled: **per-order fees + slippage** in the backtest; fee-adjusted targets live.

### 0.3 What the backtest evidence actually says (important)

`GET /api/v1/signals/backtest/all` replays the exit-managed trading rule over every watchlist name's history and compares **trading vs simply holding** (after slippage). Run on the current watchlist:

> **153 names evaluated · only 44 (29%) beat buy-and-hold · average edge −23.5 percentage points · median −11.3pp.**

The pattern is stark and worth internalising:

- On the **big winners**, the active rule **misses the run** — e.g. ASML, Caterpillar, Dell, Revolution Medicines all returned **~0% traded** while _holding_ made **+127% / +150% / +194% / +347%**. The dip-buy-and-stop-out logic either never gets a clean entry or trails out early, **capping the upside**.
- The active rule only "wins" relative to holding on names that **fell** — by cutting the loss.

**Conclusion / how to use this:** for stocks you genuinely believe are winners, **holding beats actively trading them.** Treat the expected-value signals as **entry-timing and risk hints for a buy-and-hold sleeve**, _not_ as a churn engine — and keep the trading sleeve small (the 40%). The 60% fund core is doing the real compounding. This is exactly why the architecture defaults to funds-heavy and makes the trading engine reluctant.

**Exit-mode experiment (`SIGNAL_EXIT_MODE`).** We tested two exits across all 153 names: the original `trailing` state machine (stop → take-profit → tight trail) vs `hold-with-stop` (no take-profit; a single wide ~22% peak-trailing stop that lets winners run and only cuts losses). Result: hold-with-stop improved the average edge **−23.5pp → −20.8pp** (it stops capping winners) but **neither beats buy-and-hold**. The lesson: the _exit_ was never the main culprit — the dip-buy **entry misses the big winners entirely**, and no exit fixes a trade that never happens. **`trailing` is the live default** (`SIGNAL_EXIT_MODE` in `libs/common/src/lib/config.ts`). An earlier revision of this section claimed `hold-with-stop` had been made the default; the constant says otherwise, and the constant is what runs. Set `SIGNAL_EXIT_MODE = 'hold-with-stop'` to switch. Compare live with `GET /signals/backtest/all?exitMode=trailing|hold-with-stop`.

### 0.3b Buying strength: what the Minervini leader screen actually measured (2026-08-21)

§0.3 shows the dip engine losing to buy-and-hold. The natural conclusion — _the entry picks bad tickers because it rewards weakness_ — is intuitive, was the working hypothesis, and **turns out to be wrong.** This section records what happened when it was tested, because the result changed the plan.

**What was built.** Full daily OHLCV is now persisted in the fork-owned `OhlcBar` table (408k bars, 335 symbols, 5 years — `run-ohlc-backfill.cjs`). That unlocked indicators the close-only `MarketData` series could never support: ATR, volume dry-up, breakout confirmation, Darvas boxes, and Minervini's Volatility Contraction Pattern. On top of it sit `LeaderScreenService` (the 8-criterion Trend Template + VCP detection) and `CrossSectionalService` (IBD-weighted relative-strength percentiles, point-in-time).

**Test 1 — total return vs buy-and-hold, the §0.3 format.** Entry: Trend Template 8/8 + valid VCP + confirmed breakout. Exit: unchanged. Result across 329 names:

| exit                             | trades | win rate  | exposure | beat B&H | mean edge |
| -------------------------------- | ------ | --------- | -------- | -------- | --------- |
| current (2σ/1.5σ/1σ)             | 168    | **73.2%** | 8.1%     | 11.0%    | −174.8pp  |
| minervini (7.5% stop, 18% trail) | 192    | 31.8%     | 4.3%     | 9.6%     | −191.4pp  |
| hold-with-stop (7.5%, 25%)       | 190    | 27.9%     | 5.6%     | 10.3%    | −189.7pp  |
| wide trail (10%, 35%)            | 177    | 31.1%     | 8.1%     | 9.6%     | −182.5pp  |

Read the **exposure** column before the edge column. The strategy is in the market 4–8% of the time; buy-and-hold is in 100%. Over a window where PLTR returned +2072% and MU +1584%, that gap alone produces the entire "−175pp". It is an artifact of comparing a tactical screen against a permanently-invested benchmark, not a measurement of pick quality. The same distortion inflates §0.3's own −23.5pp, where exposure was ~31%.

Note also that the **73.2% win rate belongs to the existing volatility-scaled exit**; the fixed 7.5% Minervini stop collapses it to ~30%, because a stop that tight is inside these names' daily noise.

**Test 2 — the question that actually matters.** For deciding what to buy when new cash arrives, the right test is an event study: after a signal fires, is the forward return better than picking a random name on a random day? Measured against the base rate of every symbol-day (`run-signal-edge-study.cjs`):

| signal                   | 21d                  | 63d                   | 126d                 |
| ------------------------ | -------------------- | --------------------- | -------------------- |
| **DIP (current engine)** | **+1.22pp** (t=3.07) | **+3.00pp** (t=4.66)  | **+4.35pp** (t=4.24) |
| Trend Template 8/8       | −0.18pp (t=−1.60)    | −0.26pp (t=−1.15)     | **+1.45pp** (t=4.11) |
| LEADER at pivot          | −0.51pp (t=−2.07)    | **−1.57pp** (t=−3.25) | −1.20pp (t=−1.67)    |
| LEADER breakout          | −0.86pp (t=−1.28)    | −0.26pp (t=−0.19)     | +1.90pp (t=0.90)     |

**The dip entry picks tickers well.** It beats the base rate at every horizon with win rates of 61% / 78% / 79% against a base of 56% / 61% / 66%. The Minervini breakout does not beat the base rate at any horizon; at the pivot it is significantly _worse_ at 63 days.

**Test 3 — why the dip path was not gated on the Trend Template.** The plan was to demote DIP to "dips inside confirmed leaders". Measured over 632 real DIP days (`run-overlap-diagnostic.cjs`), the combination produces **zero signals**, and the reason is mechanical:

| Trend Template criterion   | passes on a DIP day |
| -------------------------- | ------------------- |
| SMA150 > SMA200            | 88.9%               |
| SMA50 > SMA150 > SMA200    | 77.7%               |
| within 25% of 52-week high | 67.2%               |
| SMA200 rising ≥ 1 month    | 51.3%               |
| ≥ 30% above 52-week low    | 26.1%               |
| RS percentile ≥ 70         | 13.6%               |
| **price > SMA50**          | **0.3%**            |

A dip is defined as ≥10% (or 1.5σ) below the 30-day high, which puts price under the 50-day average essentially always. The maximum pass count observed on a dip day is 6/8; 7 and 8 never occur. The two entries are not merely differently tuned — they are **mutually exclusive by construction**. Gating one on the other silences the engine.

**What this changes.**

- The **DIP path stays the primary buy signal, unmodified.** The evidence says it earns its place.
- The **leader screen ships as a research surface, not a trigger** — `GET /signals/leaders`, the `Trend` and `VCP` watchlist columns, and an on-demand Telegram report. It is labelled as unproven everywhere it appears.
- The Trend Template's real 126-day edge (+1.45pp, t=4.11) is why it is worth showing at all: it is a **quality filter over months**, not an entry trigger over weeks.
- §0.3's diagnosis is refined, not overturned: the dip engine's shortfall against buy-and-hold is about **exposure and capped winners**, not ticker selection. That is where further work belongs.

**Caveats, stated plainly.** The universe is a curated watchlist of survivors, so every absolute number here — the base rate included — is optimistic; only the comparison between rows carries information. The VCP detector is a quantitative proxy for a pattern traders read visually, and it will disagree with the eye in both directions. The window is 2021-08 to 2026-08, one broadly rising market.

### 0.3b-bis The VCP detector was broken — and fixing it did not rescue the signal (2026-08-24)

Two findings, and the second one matters more than the first.

#### The detector was not detecting VCPs

`selectContractionChain` ran a **longest-decreasing-subsequence** search over every ZigZag swing, keeping any subset that shrank in depth and made higher lows. Its doc comment defended the skipped swings as "the wiggles _inside_ a larger contraction, which is exactly how a chartist reads the base." Nothing enforced that. Audited across all 757 symbols with bar history:

|                                                               | before                                    |
| ------------------------------------------------------------- | ----------------------------------------- |
| Symbols showing a "valid VCP"                                 | **291 (38.4%)**                           |
| Contraction joins that skipped bars                           | 770 of 770 — every one                    |
| Chains where skipped price broke **below the prior trough**   | **224 of 291 (77.0%)**, up to 22.1% below |
| Chains that discarded a pullback **deeper than the one kept** | **281 of 291 (96.6%)**                    |

The middle row is the contradiction: the search enforced higher lows on the swings it kept while stepping over stretches that made lower lows. With a 2% ZigZag over 60 bars producing 10–16 raw swings, there are thousands of candidate subsequences and one nearly always looks like a tightening VCP. It was fitting noise.

**The fix** replaces subsequence selection with _merge-then-suffix_. Adjacent pullbacks separated by a rally that recovers less than `SIGNAL_VCP_MERGE_RALLY_PCT` (50%) are **merged** into one contraction spanning the first peak to the **lower** of the two troughs — merging cannot hide a low, because the deeper trough becomes the merged depth. The base is then the maximal **contiguous suffix** that tightens and makes higher lows, so a lower low truncates the base instead of being stepped over.

|                                 | before     | after       |
| ------------------------------- | ---------- | ----------- |
| Valid VCP share                 | 38.4%      | **2.5%**    |
| Joins breaking the prior trough | 302 of 770 | **0 of 44** |

Also fixed: `atPivot` was symmetric ±2%, so a stock **above** its pivot on light volume — the textbook breakout failure — was filed as "at pivot". That was **45 of 110** at-pivot names, 41% of a bucket meant to hold names still approaching. It is now one-sided, with `FAILED_BREAKOUT` as its own state. And `SIGNAL_VCP_MAX_BASE_DEPTH_PCT = 0.35` caps overall base depth, which was previously unbounded.

The 2026-08-24 leader alert had fired on MRK, CF, RVTY and UNP. Under the fixed detector **all four are rejected** — "only 2 consecutive tightening contractions out of 9 pullbacks" (MRK), "only 1 out of 6" (UNP), "base is only 14 days" (CF). The alert was firing on structure that was not there.

**Not wrong, and left alone:** two thresholds that looked permissive were measured and are well calibrated. Final-contraction tightness runs median **3.5%** (Minervini asks 3–6%), only 8.6% above 6%, despite a 10% cap. Base depth runs median **16%**, p90 27%. The gates were fine; the chain construction beneath them was not.

#### The fix did not rescue the signal — but the signal was never properly measured

The working hypothesis was that §0.3b's −1.57pp condemnation might be an artifact of the broken detector. A controlled A/B — old chain vs new chain, identical 752 symbols, identical 259 dates, no trend gate — says no:

| horizon | OLD detector     | NEW detector             |
| ------- | ---------------- | ------------------------ |
| 21d     | −0.45pp (n=7544) | −0.78pp (n=627, t=−2.48) |
| 63d     | −1.29pp (n=7220) | −1.57pp (n=599, t=−2.63) |
| 126d    | −1.87pp (n=6732) | −3.27pp (n=562, t=−4.13) |

**Ungated, buying at the pivot underperforms, and correcting the detector did not change that.** But that finding turned out to be answering the wrong question, which `run-minervini-audit.cjs` was written to fix.

#### Four things the original study got wrong for THIS method

None of these is a criticism of `run-signal-edge-study.cjs` for its original purpose — comparing entries under one common yardstick. They are reasons its verdict on the Minervini path specifically does not carry.

**1. It measured an entry he does not take.** `AT_PIVOT` is price _approaching_ resistance without having broken out. Minervini puts that on a watch list; he buys the breakout _through_ the pivot on volume. Every "LEADER at pivot" number ever quoted here condemns a trade the method never makes.

**2. It sampled every 5th trading day.** A breakout is a one-day event. A 5-day grid misses roughly 80% of them and catches the rest 1–4 days late — already extended, which is exactly when he says not to buy. Re-run on **every** trading day, the at-pivot penalty largely evaporates: trend-gated at-pivot is −0.33pp at 63d (t=−0.60, n=688), not −1.57pp.

**3. It had no exit.** It measured raw buy-and-hold forward return. Minervini's edge is asymmetry — cut at 7–8%, let winners run — so mean forward return without a stop measures a strategy nobody runs.

**4. It ignored market direction**, his first rule.

#### What the corrected audit found

Every trading day, 752 symbols, 5 years, trend-gated, one entry per breakout, base rate recomputed under each exit model so comparisons stay like-for-like:

| signal (buy & hold, 126d)      | n       | mean   | win       | vs base      | t         |
| ------------------------------ | ------- | ------ | --------- | ------------ | --------- |
| BASE RATE                      | 651,387 | 9.60%  | 63.5%     | —            | —         |
| **Trend Template 8/8**         | 116,555 | 12.09% | 66.4%     | **+2.49pp**  | **24.14** |
| at pivot (not his entry)       | 656     | 8.83%  | 63.0%     | −0.77pp      | −0.93     |
| BREAKOUT (his entry)           | 109     | 10.55% | 59.6%     | +0.96pp      | 0.36      |
| BREAKOUT + healthy market      | 105     | 11.36% | 61.0%     | +1.77pp      | 0.66      |
| BREAKOUT + RS≥90               | 38      | 21.02% | 73.7%     | +11.43pp     | 2.07      |
| **BREAKOUT + healthy + RS≥90** | 36      | 22.88% | **77.8%** | **+13.28pp** | 2.35      |

**The honest headline: his actual entry has never been adequately measured here.** Evaluating every single trading day over five years across 752 names produces **109–124 breakout events**. That is far below the pre-registered n≥200, so nothing in the bottom four rows graduates — including the +13.28pp cell, which is also one of 63 cells tested and therefore roughly what one expects to clear t=2 by chance.

But the direction is worth recording: the top-RS breakouts in a healthy market are the best cell in the table, at a 77.8% win rate over 126 days, and that is precisely what the method claims. It is a hypothesis the data cannot yet confirm or reject — not a refutation.

#### The 7.5% stop is actively harmful in this universe

Applying it to the base rate itself at 126 days: mean **9.60% → 4.73%**, median **6.04% → −7.62%**. Adding the 15% trail makes it worse again (3.60%). The stop is inside these names' normal noise, so it converts a majority of positions into small losses — the same collapse §0.3b saw when the Minervini exit dropped the leader win rate from 73% to ~30%.

That is a universe mismatch, not a flaw in his rule. He buys high-ADR growth names at an exact intraday pivot with the stop just under it. Buying the daily _close_ of a mega-cap breakout and then risking 7.5% from there is a different trade with a different risk profile. Any stop used here should be ATR-scaled, as the DIP path's already is.

#### What is actually lacking, if the method is to be given a fair test

1. **The universe is wrong for it.** This is S&P 500 + EURO STOXX 50 — mega caps. Minervini trades high-growth small and mid caps. 124 breakouts in 5 years across 750 names is the symptom: these companies rarely form textbook VCPs.
2. **No fundamentals gate.** CAN SLIM's _C_ and _A_ — earnings and sales acceleration — are absent from the screen. `FundamentalsService` already fetches earnings growth and ROE and is simply not wired into it.
3. **Daily closes, not intraday.** Entry is taken at the breakout day's close rather than at the pivot, which systematically buys extended.
4. **No sell-side rules.** He has an extensive exit framework (50-day violations, distribution days, climax action); the audit models a flat stop and a crude trail.

**Adopted:** the DIP path remains the only measured buy signal. Trend Template 8/8 is promoted to the basis of a quality shortlist — it is the strongest non-DIP result in the engine at +2.49pp over 126 days on n=116k. The breakout alert keeps firing, now on a corrected and much rarer detector, still labelled unproven. Nothing is ranked by pivot proximity.

**Caveat:** the universe is a survivor-biased curated watchlist and the window is one broadly rising market, so absolute levels — the base rate included — are optimistic. Only comparisons between rows carry information.

### 0.3c Commission: the model was wrong twice (2026-08-21, corrected 2026-08-26)

Nordnet charges **per order**:

```
fee = fixedFee + commissionPct × tradeValue
```

Both terms always apply. The rate card labels the fixed part "Minst", which reads as a floor, but it is billed as an addition — that misreading is what produced the second wrong model. On **Mini** (this account) that is 0.25% plus **9 SEK** on non-Nordic venues and 1 SEK on Nordic ones. Buy and sell are separate orders.

At USDSEK 9.46:

| Position | Per order | Round trip | Round trip as % of position |
| -------- | --------- | ---------- | --------------------------- |
| $100     | $1.20     | $2.40      | **2.40%**                   |
| $250     | $1.58     | $3.15      | 1.26%                       |
| $550     | $2.33     | $4.65      | 0.85%                       |
| $1,000   | $3.45     | $6.90      | 0.69%                       |
| $5,000   | $13.45    | $26.90     | 0.54%                       |

**Size genuinely helps, with diminishing returns.** The fixed 9 SEK is charged whatever you trade, so it spreads over a larger base as the position grows and the rate falls toward — never reaching — 0.50%. The reference point is where the two components cost the same: 9 / 0.0025 = 3,600 SEK ≈ **$380**. Below it the bill is mostly the fixed fee and size helps sharply; above it the percentage dominates and size barely moves the rate. `SIGNAL_MIN_POSITION_USD = 400` sits just past that point, where the round trip is under 1% of the position.

**Three models, two of them wrong.** A flat "$5 per side" until 2026-08-21; then `max(pct × value, minimum)` until 2026-08-26, which made the rate look _constant_ above $380 and led the docs and the academy to teach that trading larger buys nothing; now the additive card. The engine's own `nordnet-fees.ts` is the single source of truth and nothing should hard-code a fee figure again.

**A note on the historical fills.** The seven fee-bearing orders in the database all cost 48–49 SEK flat with no percentage on top — the old _Liten_ class, before the account moved to Mini. They are left as a record of what was actually paid. **Do not infer the current commission class from them**: doing exactly that is what produced the 2026-08-21 error and again mispriced an allocation analysis on 2026-08-26.

**A latent bug fell out of the first correction.** `StrategiesService.sizeBasket` reconstructed a leg's principal as `cost − fee`, where `cost` is rounded to cents and `fee` is not. With whole-dollar fees the subtraction was exact; with a fractional commission it landed a fraction of a cent low (`120.95 − 0.95092 = 119.99908`), and the next `floor()` silently dropped a whole share — which stopped the greedy remainder-minimisation pass running **at all**. Principal is now `shares × price`, which is exact by construction.

**Fee-as-a-share-of-risk has been removed.** The engine used to compute `feeToRiskRatio` on every leader candidate and carried a `SIGNAL_MAX_FEE_TO_RISK_RATIO` constant that gated nothing. Both are gone at the user's request.

### 0.3d Why a passing name still does not page you

`UNP` on 2026-08-20 passes all 8 Trend Template criteria and shows a confirmed breakout, yet no signal was sent. Three separate reasons, worth separating:

1. **The DIP path cannot fire on it.** DIP requires price at or below `adaptiveBuyLevel` — for UNP, `max(10%, 1.5σ)` below the 30-day high of 307.32, i.e. **265.83**. Price is 303.97. A name near its highs is by definition not dipping. This is the same structural exclusion measured in §0.3b.
2. **The LEADER path was research-only.** `computeLeaderCandidates` was reachable at `GET /signals/leaders` and via an explicit `POST /signals/leaders/send`, but nothing scheduled it — by design, because the event study did not support firing on it.
3. So the name fell through **both**, which is a real product gap rather than a deliberate silence.

Fixed by adding a **daily leader screen** (`LEADER_SCREEN_PROCESS_JOB_NAME`, weekdays at 22:30 CET — after the US close, so the day's bar and its breakout volume are final rather than intraday). It sends only names that are **BREAKOUT or AT_PIVOT**; a base that is still `FORMING` shows in the watchlist columns but does not generate a message, because the same twenty names arriving every evening is how an alert stops being read.

The message still carries the caveat: the screen is a shortlist for judgement, and the measured buy signal remains the DIP path.

### 0.3e Volume: two tests, not one (2026-08-22)

`vcpStructure` computes **two** volume ratios. Until now only one of them escaped the service, so the half that gates the whole pattern was invisible in the UI, the API and Telegram.

| Ratio                 | Definition                                                          | Gate                                                      |
| --------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| `dryUpRatio`          | mean daily volume across the **final contraction** ÷ 50-day average | **≤ 0.85**, or the base is rejected outright              |
| `breakoutVolumeRatio` | **latest bar's** volume ÷ 50-day average                            | **≥ 1.40**, together with `close > pivot`, for a BREAKOUT |

Two properties matter and are easy to get wrong:

- **Dry-up is a hard gate, not a score.** Above 0.85 the detector returns `empty(...)` and there is no valid VCP at all. So any base the engine shows you has already passed it — nothing in the Trend Template can compensate.
- **`atPivot` tests price only.** It is `|close − pivot| / pivot ≤ 0.02` and consults volume not at all. A name can sit at its pivot indefinitely without ever confirming.

**The worked contrast (2026-08-20).** Two names, both 8/8 on the Trend Template, both with three clean contractions and price through the pivot:

|                 | UNP                   | JNJ                   |
| --------------- | --------------------- | --------------------- |
| Contractions    | 7.5% → 3.5% → 2.6%    | 5.2% → 4.0% → 3.4%    |
| Price vs pivot  | +1.95% (pivot 298.15) | +1.22% (pivot 264.15) |
| Dry-up          | 0.73×                 | **0.65×**             |
| Breakout volume | **1.45×**             | **0.80×**             |
| Status          | BREAKOUT              | AT_PIVOT              |

JNJ's supply dried up **more** thoroughly than UNP's, and it still did not confirm: it crossed its pivot on _below-average_ volume. Fewer shares traded on its breakout day than on an ordinary day, so nothing had to be bought to lift it through — and no accumulated position is defending the level. That is why the two tests are reported as a pair rather than summarised into one number.

`dryUpRatio` is surfaced **only when the VCP is valid**. The rejection path hardcodes `dryUpRatio: 0`, and a rendered 0 is indistinguishable from "extremely dry" when it actually means "never measured". Where dry-up _was_ the rejection cause, the ratio appears in `vcpRejectedReason` instead.

**Interpretation vs measurement.** The thresholds above, and Minervini's "40–50% above average" behind the 1.40, are what the engine computes. Reading volume as a proxy for institutional participation is the conventional interpretation of those numbers — reasonable and widely used, but this engine observes how much traded, never who traded. The Academy lesson marks the distinction explicitly.

### 0.3f The evening alert, and where the detail went

The leader message is now **three lines per name**, sent as Telegram HTML rather than legacy Markdown:

```
🚀 UNP 303.97 · 8/8 · RS 79
pivot 298.15 +2.0% · vol 1.45× · dry 0.73× · stop 281.17
Yahoo · TradingView · Perplexity        ← links
```

Two decisions worth recording:

- **HTML, not Markdown.** Telegram's legacy Markdown mis-parses `_` inside a URL, and TradingView writes Nordic share classes with one (`ASSA-B.ST` → `OMXSTO-ASSA_B`). Inline links would have broken on precisely the Nordic names. `TelegramBotService.sendMessage` takes an optional `parseMode` defaulting to `'Markdown'`, so every other caller is unaffected.
- **The detail moved rather than disappeared.** The full scorecard — all 8 criteria with the number each was decided on, both volume ratios, the contraction sequence and the base length — is in the ticker dialog's new **Trend tab** and in `GET /signals/leaders`. Repeating it in the message buried the two facts that decide whether to open the chart at all.

Link construction lives in `libs/common/src/lib/symbol-links.ts`, which re-exports `toTradingViewUrl` (the only one with real logic — exchange prefixes and per-venue share-class rules) and adds Yahoo and Perplexity builders. All three return `null` for a symbol with no public listing, so the MANUAL Nordnet/Avanza funds render no links rather than dead ones.

The Trend tab is fed from `AssetDetailResponse`, not from the watchlist row: the dialog opens from four places (watchlist, Analytics, Correlation, Simulation) and only the first has a metrics row to pass down. `rsRank` is cross-sectional and cannot be derived from one symbol, so the watchlist-metrics pass publishes its rank map to Redis (`SIGNAL_RS_RANK_CACHE_KEY`) and the tab reads it. A cold cache means criterion 8 shows **unranked** rather than failed — the same distinction `CrossSectionalService` already draws for a newly listed stock.

### 0.3f-bis Why the alert had never once fired (2026-08-24)

The evening leader alert was built, tested and documented, and in its entire life it delivered **zero messages**. It had three independent faults, each sufficient on its own — which is why fixing any one of them earlier would not have revealed the others.

**1. The scheduled run never happened.** `EVERY_WEEKDAY_AFTER_US_CLOSE` is `'30 22 * * 1-5'` and `addLeaderScreenToQueue` adds a 10-minute delay, so the job fires at **22:40 on weekdays**. This machine is a laptop and is rarely awake then. A `@nestjs/schedule` cron **does not catch up**: a firing missed because the host was asleep is lost, not deferred. Confirmed from Redis — `bull:TRADING_SIGNALS_QUEUE` held only `:id` and `:stalled-check`; `completed`, `failed`, `delayed` and `wait` were all zero.

**2. The message gate discarded most breakouts.** `sendLeaderCandidates` required `rsRank >= SIGNAL_TREND_TEMPLATE_PREFERRED_RS` (90). The screen on 2026-08-24 evaluated 833 names, passed 106 at 8/8, found 51 valid VCPs and 27 actionable — of which exactly **four were breakouts**:

| Symbol | RS  | Vol   | Dry-up | Passed the old RS ≥ 90 gate? |
| ------ | --- | ----- | ------ | ---------------------------- |
| MRK    | 93  | 1.53× | 0.78   | yes                          |
| CF     | 88  | 1.51× | 0.69   | **no**                       |
| RVTY   | 88  | 1.53× | 0.62   | **no**                       |
| UNP    | 79  | 1.45× | 0.73   | **no**                       |

**3. A network blip silently dropped the message.** `TelegramBotService.sendMessage` loops three times, but its `catch` did `return`, not `continue` — so only HTTP 429 was ever retried. Every network-level throw (the `ECONNRESET` / `ENOTFOUND api.telegram.org` / `UND_ERR_CONNECT_TIMEOUT` errors filling the log) abandoned the message on the first attempt.

**What changed:**

- **Breakouts only, and no RS floor on top.** `AT_PIVOT` is a _state_, not an event — a name can hold its pivot for a fortnight, so alerting on it re-sent the same two dozen names nightly, which is what the RS ≥ 90 gate was added to contain. A breakout is a dated event and is self-limiting: ~4/day across 833 names. No RS floor is needed because criterion 8 **is** RS ≥ 70, so every candidate already clears one by construction. `SIGNAL_TREND_TEMPLATE_PREFERRED_RS` remains defined but is no longer used in this path. At-pivot and forming names stay visible in `GET /signals/leaders`, the watchlist columns and the Trend tab.
- **Per-symbol cooldown, `SIGNAL_LEADER_ALERT_COOLDOWN_DAYS = 5`.** A breakout bar keeps testing as BREAKOUT for several sessions until its volume surge rolls out of the 50-day average, so without this one event alerts every evening for a week. Stored in the existing `SignalState` table under `LEADER:<dataSource>:<symbol>`, the same mechanism the DIP path uses.
- **Catch-up on boot.** `SignalsService.onApplicationBootstrap` runs the screen if the most recent weekday 22:40 slot has passed unserved, guarded by the `SIGNAL_LEADER_SCREEN_LAST_RUN` property. Running it late costs nothing: the previous US close is final, and final is all the screen wants.
- **A manual button** on the watchlist, and `POST /signals/leaders/send` now returns `{ sent }`. That count is the point. Before it, "no breakout qualified today" and "the alert is broken" were indistinguishable from the outside — which is precisely how a permanently-suppressed alert went unnoticed for weeks.
- **Network throws retry** with backoff instead of abandoning on the first failure.

**Simulation:** an alerted breakout also writes a `SignalLog` BUY row with `signalType: LEADER` and the screen stop, so the Simulation tab grows a **Leader** line beside Dip / Reversal / Tracked. It is **forward-only** — nothing is backfilled, because a breakout that was never alerted was never a signal you could have acted on, and inventing its history would make the curve a backtest wearing a live-results label. The line is empty until the first breakout fires and stays sparse while the sample builds. Exits are the flat stop only, no take-profit, per the cut-at-7-8%-and-let-winners-run doctrine. LEADER lots are FIFO-matched in their own bucket so a DIP exit can never close a LEADER entry, and are **excluded from the headline `avgNetReturnPct` / `winRate` / `closedTrades`** — those describe the DIP/REVERSAL engine and folding in a different playbook would redefine them rather than add to them. `leaderAvgNetReturnPct` / `leaderClosedTrades` / `leaderWinRate` report it separately.

### 0.3g Universe: the S&P 500 and EURO STOXX 50 (2026-08-23)

Since the primary signal became **cross-sectional**, universe size is a direct input to signal quality: a name's RS is its percentile against every other tracked name, so a 1-99 rank over 334 names is a blunter instrument than one over ~750. The tracked universe was widened to full index membership for that reason, not for its own sake.

**Membership is generated, not hand-maintained.** `libs/common/src/lib/index-constituents.ts` is produced by `run-refresh-index-constituents.cjs` and committed as source, so the build never depends on those URLs being reachable. Re-run it after an index rebalance. It is kept separate from `COMPANY_CATALOG`, which remains a curated _theme_ taxonomy (`quantum-computing`, `etf-datacenter-reits`) — a different thing from index membership, and not something worth re-curating 500 entries after every index change.

#### The overlap was smaller than it looks

|               | Members | Already tracked      | New     |
| ------------- | ------- | -------------------- | ------- |
| S&P 500       | 503     | 101                  | **402** |
| EURO STOXX 50 | 50      | 29 (incl. 5 via ADR) | **21**  |

European coverage was already strong — 183 non-US symbols across 15 venues — so the EURO STOXX 50 contributed little. **The real diversification came from the S&P 500**, and specifically from sectors the curated catalog barely touched: Financials (66 new), Industrials (63), Health Care (50), Information Technology (47), Utilities (28), Real Estate (28).

#### Capacity: measured, not estimated

Per listed symbol the cost is ~383 KB of `OhlcBar` plus ~530 KB of `MarketData` ≈ **0.9 MB**.

Projected against measured, after the import completed on 2026-08-23:

|                               | Before               | Projected       | **Actual**             |
| ----------------------------- | -------------------- | --------------- | ---------------------- |
| Symbol profiles               | 406                  | ~830            | **833**                |
| Symbols with OHLC             | 334                  | ~757            | **761**                |
| `OhlcBar` rows                | 407,162 (**128 MB**) | ~925k (~290 MB) | **936,818 (301 MB)**   |
| `MarketData` rows             | 628,576 (**215 MB**) | ~440 MB         | **1,158,778 (361 MB)** |
| **Database total**            | **354 MB**           | ~740 MB         | **673 MB**             |
| Full leader screen            | **6.6 s**            | ~15 s           | **8.8 s**              |
| Yahoo quote requests / 30 min | 9                    | 17              | **17**                 |

424 profiles were created with **zero failures**, writing 525,891 rows to each store. The size projection was ~10% pessimistic and the compute projection ~40% pessimistic; both were the right side to be wrong on. Disk was never the constraint and neither was compute — the binding costs were alert volume and peer-group quality, both handled below.

#### Two things that had to change with it

**Alert volume.** At 334 names, 13 were actionable per day (3 BREAKOUT + 10 AT_PIVOT ≈ 3.9%). The prediction for ~757 names was ~30; **measured after the import it is 28** (5 BREAKOUT + 23 AT_PIVOT), against a hard cap of 8 candidates per message. The evening alert now additionally requires **RS ≥ 90** (`SIGNAL_TREND_TEMPLATE_PREFERRED_RS`), applied in `sendLeaderCandidates`, which brings it to **exactly 8** — the gate lands on the cap rather than fighting it. Without it the message would silently drop 20 of 28 qualifying names.

Over 754 rankable names the Trend Template now passes **106 at 8/8 (14%)**, spread across the full 0–8 range.

Deliberately **not** done by raising `SIGNAL_TREND_TEMPLATE_MIN_RS`. That constant is criterion 8 of the Trend Template, used in exactly one place. Minervini states the criterion as RS ≥ 70; 90 is his preference for what to _buy_. Raising the criterion would silently redefine what "8/8" means, invalidate comparison with every earlier screen, and change the Trend tab's scorecard. Gating the _message_ rather than the _criterion_ is what lets the universe grow without the alert growing with it — the watchlist and Trend tab still show every qualifying name.

**Peer groups.** The sector-tailwind signal compares a name against its peers' 3-month returns, and the peer group came from the curated catalog: 40 categories over 215 named companies, with groups as small as one (`etf-datacenter-reits`) or two (`biotech`, `chemicals-fertilizer`). A median over two names is not a market signal, and ~120 tracked listed symbols had no category at all.

`SymbolProfile.sectors` is a better source and was **already populated for 251 of 277 stocks (91%)** by the data provider — US 146/152, non-US 105/125 — using Yahoo's 11-sector taxonomy. It covers non-US listings the catalog never reached. `getWatchlist` now selects it, and `peerGroupFor` (`libs/common/src/lib/sectors.ts`) takes the sector first and falls back to the curated category.

One assumption here was wrong and worth recording: sector does **not** arrive for free on import. The chart endpoint the importer uses carries no sector at all, so all 424 new names landed without one. `run-backfill-sectors.cjs` is a second pass over `quoteSummary`, which filled **451 of 464**; the 13 misses are broad-market ETFs with genuinely no single sector, plus `FISV` and `VMRK`, which have full price history but no published `assetProfile`. Stock coverage is now **702 of 704 (99.7%)**.

It writes `sectors` only. `countries` is deliberately left alone: this fork stores an ISO code (`[{"code":"US","weight":1}]`) while Yahoo returns a display name, and inventing a name-to-code mapping would put guessed data in the database to save a lookup.

The measured payoff — peer groups before were as small as one name; now:

| Sector             | Stocks |     | Sector                 | Stocks |
| ------------------ | ------ | --- | ---------------------- | ------ |
| Industrials        | 123    |     | Consumer Defensive     | 48     |
| Technology         | 110    |     | Utilities              | 36     |
| Financial Services | 104    |     | Basic Materials        | 34     |
| Consumer Cyclical  | 81     |     | Energy                 | 32     |
| Healthcare         | 74     |     | Communication Services | 31     |
|                    |        |     | Real Estate            | 29     |

Real Estate went from 2 names to 29 and Utilities from 6 to 36 — the two sectors where a peer median previously meant nothing at all.

### 0.3h Universe hygiene: what the expansion turned up

`run-universe-cleanup.cjs` reports by default and only changes anything with `--apply`. It never removes a symbol with trade history, regardless of flags.

**Cross-listing duplicates (7 removed).** The same business tracked on two venues occupies two slots in the 1-99 RS percentile and can surface twice in one alert. The survivor is chosen by 50-day average dollar volume:

| Business          | Kept              | Dropped         |
| ----------------- | ----------------- | --------------- |
| Airbus            | `AIR.PA` ($222M)  | `AIR.DE` ($53M) |
| ASM International | `ASM.AS` ($183M)  | `ASMIY` ($23M)  |
| HSBC              | `HSBA.L` ($496M)  | `HSBC` ($130M)  |
| ING               | `INGA.AS` ($175M) | `ING` ($78M)    |
| Roche             | `RHHBY` ($109M)   | `RO.SW` ($9M)   |
| Ryanair           | `RYAAY` ($96M)    | `RYA.IR` ($59M) |
| Unilever          | `ULVR.L` ($231M)  | `UNA.AS` ($69M) |

Share classes are **not** duplicates and were kept (`INVE-A/B.ST`, `ERIC-A/B.ST`): separate listings, different liquidity and voting rights.

**Comparing turnover across venues needs FX, and pence.** The first run of this report put `HSBA.L` at $36bn/day. `close × volume` is in the listing's own currency, so comparing a pair quoted in different currencies compares different units — and London quotes in **pence** (`GBp`), not pounds, which alone overstates a UK listing 100×. Rates come from the `USDxxx` rows already in `MarketData`; `GBp` is divided by 100 first. The corrected figure is $496M. None of the keep/drop decisions changed, but before the fix none of them were justified.

**A fund carrying price bars.** `0P000134K9.F` (Nordnet Suomi Indeksi) held **1,064 `OhlcBar` rows, 100% zero-volume** — the only one of 72 funds with any bars. Zero volume makes both VCP volume tests meaningless, so the rows were worse than absent. Deleted.

**17 of 277 stocks sit below the $5M liquidity floor**, from `WISE.ST` at $5k/day to `GRNG.ST` at $2.4M. These are already excluded from leader signals by `SIGNAL_SCREEN_MIN_DOLLAR_VOLUME` (`signals.service.ts:3500`), so they are wasteful rather than dangerous — each still occupies a slot in a percentile ranking against names you could not actually buy. Reported, never auto-removed.

**A truncated ticker, caught before import.** `run-verify-index-symbols.cjs` resolves every constituent against Yahoo before anything is written. It found `FI.HE`, which does not exist: the extraction regex allowed only one character after a dash, so Nordea's `NDA-FI.HE` was captured as the fragment `FI.HE`. Fixed with a lookbehind anchor and a multi-character dash segment; there is a regression test for it. **426 of 427 new symbols resolved before the fix, 427 of 427 after.**

### 0.3i The post-expansion slowdown was not the database (2026-08-24)

The app got noticeably slower after the universe grew to 833 names. The obvious suspect was wrong, and worth recording as such: **205,998 watchlist bars over 400 days hydrate in 993 ms**, the cross-sectional `rankMap` over 754 symbols takes **7 ms**, and 833 profile rows load in **2 ms**. `OhlcBar` already carries `@@index([symbol, date])`. None of that needed touching.

**The actual cause was an unfiltered outbound fetch.** `computeMetricsSnapshot`'s `needsYahooFee` filter had no asset-class check, so every ordinary **stock** — roughly 700 of the 825 watched symbols — was handed to `getYahooEtfProfile`, which fetches a **full Yahoo Profile HTML page**. A stock has no expense ratio, so every one of those fetches was guaranteed to find nothing.

Worse, it was one unbounded `Promise.all`. `fetchYahooProfileHtml` uses a **15 s timeout** and `getYahooEtfProfile` retries once after 1.5 s, so a single cold symbol can take ~31 s — and `/watchlist-metrics` could not return until the slowest of ~800 finished. Node's HTTPS agent has no socket cap, so all ~800 connections opened against one host at once; Yahoo throttled the burst immediately, which is exactly the path that ends in the timeout. Failures were negative-cached for one hour, so the storm repeated. **Measured before the fix: 8 cached `yahoo-etf-profile` keys against 825 symbols.**

This was already wasteful at 280 symbols. The import made it 3× worse, which is when it became visible.

**Four layers of fix, cheapest first:**

1. **`canHaveExpenseRatio`** restricts the lookup to `ETF` / `MUTUALFUND`. 825 candidates → ~57.
2. **The request path is now cache-only.** `peekYahooEtfProfile` reads Redis and never fetches; misses are refilled in the background. An annual expense ratio has no business blocking a page load, and after this change `/watchlist-metrics` latency cannot depend on Yahoo being reachable at all.
3. **The negative cache was conflating two different things.** `isEmpty` gave the same 1-hour TTL to "the page loaded and this symbol has no expense ratio" (a permanent fact) and "the fetch failed" (transient). Every symbol legitimately without a fee was therefore re-scraped hourly, forever. Only real fetch failures keep the short TTL now. The background refill also runs at `SIGNAL_YAHOO_FEE_REFILL_CONCURRENCY = 4` rather than all at once — a wide fan-out is not merely slower, it is self-defeating, since the retry cannot recover from a block the rest of its own burst is still causing.
4. **`/watchlist-metrics` is memoised** for `SIGNAL_WATCHLIST_METRICS_CACHE_TTL` (5 min). It had no cache at all, while the UI polls it every 30 minutes _and_ recomputed it on every page load.

**Secondary: 825 logo requests per watchlist render.** `gf-benchmark` renders one `<gf-entity-logo>` per row and does not paginate. 246 of the 825 profiles have a `url`, and each made an uncached outbound `t0.gstatic.com` fetch; the other 579 did a DB lookup and returned 404. Nothing was cached — no server cache, no `Cache-Control`, no `loading` attribute. Now: an in-process memo in `LogoService` (hits 24 h, misses 1 h), `Cache-Control` on both the success and the 404 path, and `loading="lazy"` so off-screen rows fetch nothing.

**Not a bug:** the `TelegramListenerService` `ENOTFOUND` / `ECONNRESET` errors in the log are a local network drop; the poller reconnects on its own. The 46-minute gap between a favicon `DEBUG` at 12:21:57 and its timeout `ERROR` at 13:08:01 — impossible with a 3 s `AbortSignal.timeout` — is the machine sleeping in between, which is the same reason the 22:40 cron never fired.

### 0.3j What is actually shipped, and at what cadence (2026-08-24)

Three surfaces, each matched to how often the underlying thing changes.

| surface                 | fires                   | gate                                                      | rate                              |
| ----------------------- | ----------------------- | --------------------------------------------------------- | --------------------------------- |
| Trend Template entrants | daily, weekday pre-open | 8/8 **and** RS ≥ 90                                       | ~2/day median, silent 30% of days |
| Shortlist digest        | 1st and 15th            | 8/8 **and** RS ≥ 90                                       | ~28 names today                   |
| Leader breakout         | when it happens         | VCP breakout; gated variant adds healthy market + RS ≥ 90 | ~11 gated events/year             |

#### Why the entrant alert is gated on RS ≥ 90

Not a preference — a measurement. New 8/8 entrants over the last 94 trading days across 752 names:

| new entrants per day | mean    | median | p90 | max     |
| -------------------- | ------- | ------ | --- | ------- |
| all 8/8              | 13.4    | 7      | 22  | **142** |
| **RS ≥ 90 only**     | **3.9** | **2**  | 6   | 58      |

An ungated daily alert averages 13 names and spikes to 142 when the cross-section re-ranks — unreadable within a week. Gated it is a median of 2, silent on 28 of 94 days. A per-symbol cooldown of `SIGNAL_TT8_COOLDOWN_DAYS = 10` stops a name hovering on a criterion boundary (price vs the 50-day, 25% below the high) re-alerting every other day, and the message caps at `SIGNAL_SHORTLIST_MAX = 12` with the overflow summarised rather than truncated silently.

#### Market direction, at last

`MarketBreadthService` is the first market-direction gate this engine has had. Minervini's funnel is market → group → stock → base → pivot; only the last three were ever implemented, which is why the original at-pivot measurement pooled corrections with uptrends.

It measures **breadth** — the share of the tracked universe above its own 200-day — rather than "the index above its 200-day", because there is no index data stored locally: `^GSPC` and `^VIX` both have **zero rows** in `OhlcBar` and `MarketData`. `MarketRegimeService` fetches them live, which serves a Telegram line but cannot be evaluated point-in-time in a backtest. Breadth is computable for any historical date with no lookahead and no extra feed, which is what makes the gate **testable rather than merely assertable**. It is arguably the better measure anyway: an index can be carried above its average by a handful of mega-caps while most stocks are below theirs, and it is the latter that decides whether a random breakout has support. Threshold `SIGNAL_MARKET_BREADTH_HEALTHY_PCT = 0.5`, deliberately the natural dividing line rather than a fitted one — the breakout sample is far too small to tune a threshold against without simply overfitting it.

#### Peer-group ranking (IBD's "L")

`CrossSectionalService.peerRankMap` ranks each name **inside** its sector and each sector against the others, so a row reads "RS 93 · 2nd of 21 in Energy · sector RISING". Groups are scored on the **median** member rank, not the mean, so one runaway constituent cannot carry an otherwise weak sector; groups with fewer than three ranked members get a `null` percentile, because too thin to rank is not the same as bottom-ranked — the same distinction `rank` already draws for a newly listed stock.

#### What each Simulation curve means

| curve          | rows                                  | populated by                                         |
| -------------- | ------------------------------------- | ---------------------------------------------------- |
| Dip / Reversal | `BUY`/`SELL`, signalType DIP/REVERSAL | the measured engine                                  |
| Tracked        | real Orders matched to signals        | `SignalTradeTrackingService`                         |
| Leader         | `BUY`, LEADER                         | every alerted breakout                               |
| Leader (gated) | `BUY`, LEADER_GATED                   | breakouts that also cleared healthy market + RS ≥ 90 |
| Trend Template | `BUY`, TT8                            | **only names actually bought**                       |

The last row is the important one. Trend Template _alerts_ are written under **`category: "WATCH"`**, which `computeSimulation` never reads — it selects `category IN ('BUY','SELL')` — so they appear in the Analytics log and nowhere near the trade ledger. Auto-logging them would be ~1,000 lots a year at 3.9 entrants/day: an equal-weight index of the screen rather than a strategy, swamping every other curve while representing nothing anyone traded. The TT8 curve exists only once a real purchase is recorded.

Every non-DIP/REVERSAL type FIFO-matches in **its own bucket** (`ISOLATED_SIGNAL_TYPES`), so one strategy's exit can never close another's entry, and all of them stay out of the headline `avgNetReturnPct` / `winRate` / `closedTrades`, which continue to describe the DIP/REVERSAL engine alone.

#### A fixed bug worth recording

When `getSignalLog` began bucketing LEADER rows under their own category chip, the Analytics filter was not updated: it matched on `category` and special-cased only REVERSAL. Rows are stored as `category: 'BUY'`, so the LEADER chip filtered to an empty table. The filter now matches `category` **or** `signalType`, which fixes it for all four types at once.

### 0.3k The bars stopped moving, and the universe grew (2026-08-25)

#### The defect: `OhlcBar` had no writer inside the application

The watchlist has rendered `trendTemplatePasses` ("n/8") and `rsRank` ("RS n") for a while. They were not missing. They were **frozen**.

| store                 | newest row on 2026-08-25 | maintained by                                     |
| --------------------- | ------------------------ | ------------------------------------------------- |
| `MarketData` (closes) | 2026-08-25 — current     | `dataGatheringService.gather7Days()`, hourly cron |
| `OhlcBar` (OHLCV)     | **2026-08-21**           | nothing in the running application                |

`OhlcBarService.upsertMany` had **zero callers in `apps/`**. The only writers were the standalone scripts, and `run-ohlc-backfill.cjs` skips any symbol that already holds `MIN_BARS` rows — so re-running it appended nothing without `--force`. The bars advanced only when someone remembered to run a script.

This was easy to miss for exactly one reason: `MarketData` stayed current the whole time. Prices moved, the composite score moved, the sparklines moved. The Trend Template, the VCP detector, ATR and the cross-sectional RS percentile — everything that needs highs, lows and volume — kept reading a four-day-old market while looking perfectly alive.

`OhlcBarService.getLatestDates` already existed, documented as _"what an incremental gather needs to know so it only asks Yahoo for the gap rather than the whole history."_ The gather it was written for was never built.

#### The fix: a nightly incremental gather

| piece                                      | where                                    |
| ------------------------------------------ | ---------------------------------------- |
| `refreshOhlcBars` / `refreshOhlcBarsIfDue` | `signals.service.ts`                     |
| `refreshRangeFor` (pure, unit-tested)      | `ohlc-bar.service.ts`                    |
| `OHLC_REFRESH` queue job                   | `trading-signals.{service,processor}.ts` |
| 22:05 CET weekday cron                     | `cron.service.ts`                        |

One chart request per YAHOO symbol, through a 4-wide worker pool (`SIGNAL_OHLC_REFRESH_CONCURRENCY`) rather than a ~900-wide `Promise.all`, for the same reason the Yahoo fee refill is throttled: the surest way to lose the whole run is to burst at Yahoo. The range comes from the gap — `1mo` for the ordinary one-or-two missing sessions, `3mo` up to 60 days, `5y` beyond that or when nothing is stored — so a routine night asks for a month of bars to collect one, and `createMany({ skipDuplicates: true })` makes the overlap free.

**22:05 CET** is after both the European (~17:30) and US (22:00) closes settle, and 25 minutes ahead of the 22:30 leader screen, so the screen reads bars gathered the same evening. Measured on 2026-08-25: **861 symbols in ~40s**, and a second pass immediately afterwards wrote **0** rows — the headroom is ample and the idempotency is observed, not assumed.

**The boot catch-up is not optional here.** `@nestjs/schedule` crons do not catch up, and this runs on a laptop that is regularly asleep at 22:05. A missed alert is a missed notification; a missed gather is a permanent hole in the bar history that nothing else fills. `refreshOhlcBarsIfDue` reuses `isLeaderScreenDue` — already a generic "has the most recent weekday slot passed without a run" test, parameterised by hour and minute.

The boot catch-ups are now **sequenced** rather than staggered on timers. The old comment on the leader-screen catch-up already worried about this ("the screen is only as good as the bars it reads") and tried to solve it with a 30-second stagger. The gather takes minutes over the full universe, so a timer race loses. `runBootCatchUps` runs OHLC refresh → leader screen → shortlist → entrants in order, each isolated so one failure cannot cancel the rest.

**One-off silent seed.** The first entrant run against un-frozen bars would see every crossing missed during the freeze at once — real 8/8 names, but days-old entries whose pivot has already moved. Gated on `SIGNAL_TT8_BASELINE_SEEDED`: the first run records the cooldowns and sends nothing. Live alerting resumes the next day.

#### 100 curated UK + European mid-caps

`EUROPEAN_MIDCAP_SYMBOLS` in `index-constituents.ts`, selected by `run-curate-midcaps.cjs` from 759 operating companies (FTSE 100 + FTSE 250 + STOXX Europe 600, 81 fund vehicles excluded by ICB sector, 19 more closed-end funds and holding vehicles excluded by name because their return _is_ their portfolio's return). Filters: EUR 2–20bn market cap, the same $5M 50-day dollar-volume floor the leader screen already enforces, forward P/E in (0, 60], at least two of four fundamentals present. 40 UK / 60 Continental across 14 countries.

This closes a real gap: the EURO STOXX 50 is euro-area only, so the generated lists held **zero** `.L`, `.SW`, `.ST`, `.CO` or `.OL` names. There were three UK symbols in the entire database, all leftovers from the personal watchlist.

Ranked on growth 0.35 / quality 0.30 / analysts 0.25 / valuation 0.10, **not** on `FundamentalsService.computeScore`, which weights valuation at 0.30 as `100 − forwardPE × 2`. A name at 40× forward earnings scores 20 on that term, so ranking that way would have systematically demoted the premium-multiple leaders the Trend Template screen exists to find — the list would have fought the engine it feeds.

**The cost, recorded once.** Curating universe members by fundamentals means any _backtest_ over these names inherits the selection. Forward signals on them are clean; the comparable historical subset stays the mechanical S&P / EURO STOXX one. This is contained because they are additions to an existing mechanical universe, not a replacement for it.

`run-refresh-index-constituents.cjs` rewrites the whole file, so it now lifts the curated block out and carries it through — and **throws** rather than proceeding if it cannot find it. Without that, the next index refresh would have silently deleted 100 symbols and all UK coverage.

#### Two Yahoo GBp traps, one of them live

The LSE quotes in pence and Yahoo labels the currency `GBp`, but it does not apply that consistently:

1. **`forwardPE` is pence-over-pounds** — price in GBp divided by EPS in GBP, inflating the ratio 100×. `AZN.L` reports 1065 for a real 10.7; the median UK forward P/E across the pool read **1,190**. This was **live in `FundamentalsService`**: the valuation term clamps to 0 above 50×, so every GBp-quoted name scored zero on it. Fixed by `normalizeForwardPE`, which rescales only inflated values — `UKW.L` (9.5) and `BBOX.L` (16.8) arrive correctly in pounds, so a blanket divide would have corrupted them — and discards anything landing implausibly cheap, which is how a genuine 100×+ name looks after a divide it did not deserve. Currency decides, not the `.L` suffix: `MTLN.L` lists in London and quotes in euros.
2. **`marketCap` is in pounds while the price is in pence.** `HSBA.L` reports 262.7e9 against a 1533.2 GBp close — 17.1bn shares, which is right; 262.7e9 pence would be a £2.6bn HSBC. So a cap converts at the pound rate and turnover at the pence rate. This has no product-code reader today (`marketCap` is used nowhere in `apps/`); it is recorded so it is not re-tripped.

#### Two smaller fixes the work turned up

- **Dedupe on the resolved symbol, not the source ticker.** United Utilities and QinetiQ are listed under slightly different exchange tickers across the FTSE and STOXX sources, so both survived a ticker-level dedupe and both resolved to the same Yahoo symbol. The same business in two slots distorts the 1-99 RS percentile — the same reasoning as the cross-listing removals in §0.3h. `index-constituents.spec.ts` now asserts the mid-caps are internally unique, disjoint from both generated lists, and that `allIndexConstituents()` totals 653 without repeats.
- **Warsaw and Lisbon had no TradingView mapping.** `WA` and `LS` were absent from `TRADINGVIEW_EXCHANGE_BY_SUFFIX`, so six of the new names would have rendered no chart link at all. Caught by extending the existing "resolves every European constituent to a TradingView page" guard to the mid-caps — the same guard that once caught Brussels.

#### A test that caught a real bug

`refreshRangeFor` was first written with date-fns `differenceInCalendarDays`, which measures **local** calendar days. Bar dates are stored at UTC midnight and `getLatestDates` slices the ISO string, so in CET the gap came out one day too large and a same-day gather silently requested the next range up. Now computed in UTC on both sides. The boundary test is what surfaced it.

### 0.3l The Simulation tab became a strategy comparison (2026-08-27)

The tab used to answer "how are the signals doing?" and could not answer "was the engine's advice worth taking, compared with my own?". It now answers the second, because that is the question the whole engine exists to settle.

#### What the chart is, and what it deliberately is not

**Every line is equal-weighted**: each position counts once, at the same notional, whatever was actually spent. That makes an engine suggestion and a real fill directly comparable, which is the point.

It is therefore **not** account performance. A real portfolio is value-weighted and the largest position dominates it. Overview and Holdings report that, correctly, and the chart's own subtitle says so — the trap here is a reader taking "Tracked +5.5%" as what the account did.

#### The lines

| Line                       | Source                                                    | Question it answers                                        |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Dip                        | `SignalLog` DIP, exited when the engine signalled an exit | the engine's measured entry, traded as designed            |
| Reversal                   | `SignalLog` REVERSAL                                      | the counter-trend path                                     |
| Watch Leader               | `SignalLog` WATCH/TT8                                     | was the shortlist any good, whether or not it was acted on |
| Leader Breakout            | `SignalLog` LEADER                                        | the VCP breakout alert                                     |
| Trend Template (bought)    | `SignalLog` TT8 BUY                                       | entrants actually purchased                                |
| **Tracked**                | **`Order`**                                               | every real stock/ETF position                              |
| Tracked Bet / Dip / Leader | `Order`, by tag                                           | the same, split by where the decision came from            |

The first six are hypothetical and read from the signal log. The last four are real and read from **`Order`** — which is the substantive change. The old Tracked line was built from signal rows that happened to be matched to a fill, so most of the portfolio never appeared in it.

**The Dip line carries exit markers.** A dot at each date the engine signalled a sell, labelled with what taking that advice returned. An earlier revision shipped a second, dashed buy-and-hold twin beside it; that pair was identical because exits were not reaching the simulation at all, which is the defect §0.3n describes. With exits closing trades properly the markers answer the question the twin was there to ask.

#### Provenance is stored, not guessed

Three tags on `Order` — `BET`, `DIP`, `LEADER` — record where each decision came from. `Order.tags` already existed as a many-to-many, so this needed no migration, and Ghostfolio's own activity dialog edits them, which is how new positions get classified from here on. `run-seed-order-tags.cjs` seeds what is already known and is idempotent.

An untagged non-fund order still appears in the aggregate Tracked line but in none of the breakdowns, so a forgotten tag under-reports a bucket rather than corrupting one. Funds are untagged on purpose: they are the 60% core, bought on a schedule rather than a call, and they are excluded from the chart entirely.

#### Reconstructing round trips from fills

`ordersToTrades` walks activities FIFO, one queue per symbol. Three details matter:

- **A sell can span several buy lots and a lot can be closed by several sells.** Both are split, so every resulting trade has one buy price and one sell price; a half-closed lot contributes a closed trade for the sold half and stays open for the rest.
- **Fees are per order, not per share.** They are apportioned across the order's quantity and then across the slice involved, otherwise a partial sale would be charged the whole commission.
- **Returns stay in the instrument's own currency**, exactly as the signal-derived trades already are. Converting to USD would mix an FX bet into a strategy comparison.

`PerformanceSeriesTrade` gained an optional `feeDragPct`. Signal trades are hypothetical and leave it undefined, falling back to the assumed-notional figure as before — so the existing curves are unchanged to the byte. Order-derived trades know what was actually paid and use it.

#### Targets

Display only. Nothing reads them to decide anything. A stock uses its hand-set thesis price from `PORTFOLIO_PRICE_TARGETS` where one exists, otherwise the engine's own most recently published take-profit; an ETF gets neither, because a basket has no single price it is heading for. Measured on the current book: four from the sheet, five from the engine, two absent.

#### The four LEADER rows were deleted

MRK, CF, RVTY and UNP, all alerted 2026-08-24 by the pre-rewrite VCP detector. The corrected detector rejects all four — "only 2 consecutive tightening contractions out of 9 pullbacks" for MRK, "only 1 out of 6" for UNP, "base is only 14 days" for CF. Their `SignalState` cooldowns went with them, so a genuine breakout in those names can alert immediately rather than being suppressed for five days by an alert that should never have fired.

#### The calculator is gone

It sized a position against a hard-coded `status === 'CLOSED' ? 10 : 5` USD fee — the flat $5-a-side model the engine abandoned on 2026-08-21 and corrected again on 2026-08-26. It had survived both corrections because nothing pointed at `nordnet-fees.ts`. Rather than fix a fourth copy of the fee rule, it was removed and the chart takes the full width.

### 0.3m The portfolio was imported (2026-08-27)

`run-import-transactions.cjs` reads the Nordnet export — UTF-16LE, tab-separated, Swedish headers, decimal commas — and writes only what is missing. It is the path for every future export.

Two details are load-bearing:

- **Matching is on instrument, side, quantity and price within three days, not on an exact date.** The rows already in the database disagree with the export about which day a trade belongs to: Apple's 2025-12-24 trade date is stored as 12-23, while Nordnet Global Index's 2025-12-31 is stored as 2026-01-01. An exact-date match would have imported every historical row a second time and doubled the position.
- **The export is authoritative on fees.** The three December 2025 buys were stored with `fee: 0` where 49 SEK was actually charged, which flattered every return computed from them. Those are corrected on import.

Ten activities were written (six trades plus four missed dividends) and three fees corrected. Every resulting position reconciles against the export's own `Totalt antal` column, and a second run writes nothing.

**A finding worth recording, and a correction to it.** Six of eight configured symbols are flagged `isActiveTrade` and five `SignalState` rows carry a non-null `trailingPeak`. None has since fallen a full band below its peak, so the **dynamic** exit machine — `evaluateExit`, the `isActiveTrade` path — has never produced a SELL.

An earlier revision of this section generalised that into "the exit machine has never executed in production". **That was wrong**, and the way it was wrong is instructive: it is the _other_ exit path that governs real buys. `SignalTradeTrackingService` has fired **two** exits — AMZN on 2026-08-03 and iShares Gold Producers on 2026-08-21, the latter acted on the same day for a realised +26.4%. They were invisible because the tracker records a terminal `trackedStatus` on the buy row instead of writing a SELL row, and every consumer looked for SELL rows. The alerts were sent and read; only the analysis could not see them. See §0.3n.

### 0.3n The exits were always there; nothing could see them (2026-08-27)

Three faults, each hiding the next, all found by pulling one thread: _"the buy-and-sell line and the buy-and-hold line are identical, and they should not be."_

#### The exits do not live where anything looks for them

`SignalTradeTrackingService` closes a position by writing a terminal `trackedStatus` — `STOP_HIT` or `TRAILING_EXIT` — into `SignalLog.metrics` on the **buy** row. It never writes a SELL row. `computeSimulation` pairs `category IN ('BUY','SELL')`, so it found no sells, closed nothing, and every strategy curve ran on as though no position had ever been exited.

Two real exits were sitting in the table the whole time:

| symbol  | signalled  | trigger       | entry           | exit   | return     |
| ------- | ---------- | ------------- | --------------- | ------ | ---------- |
| AMZN    | 2026-08-03 | trailing exit | 240.53 (signal) | 284.02 | **+18.1%** |
| IS0E.DE | 2026-08-21 | trailing exit | 30.935 (fill)   | 40.81  | **+31.9%** |

Both alerts were sent to Telegram and read. The gold-producers one was acted on the same day for a realised **+26.4%** net of fees — the difference from +31.9% being the 8.85 EUR of commission on six shares, and a 0.6% gap between the day's close and the actual intraday fill.

`computeSimulation` now has a **second close path**: a buy row carrying a terminal tracked status closes at `trackedAlertedAt`. The BUY↔SELL FIFO walk is untouched beside it.

**The exit price was never stored.** The tracker recorded the status and the timestamp and discarded the price it had in hand. It now writes `trackedExitPrice` at all three exit sites; the two historical exits are reconstructed from the stored daily close and flagged `reconstructed` everywhere they surface, because a trailing exit fires intraday and the close is near but not equal. An inferred number is never presented as a recorded one.

#### Nine of eleven tracked positions were fabricated, and all wore the DIP label

When a real purchase has no engine signal close enough, the tracker synthesises a `SignalLog` row so the stop/target machinery has something to watch. That row was hard-coded `signalType: 'DIP'`.

|                                             |                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Genuine dip signals among tracked positions | **2** — XDJP.DE (score 83), ADS.DE (score 61)                                                          |
| Fabricated rows labelled DIP                | **9** — including WMT, ORCL, NVDA and SAN.MC (the user's own market calls) and HPE (a Leader purchase) |

So the curve measuring the dip strategy was mostly other people's decisions. The label is now `MANUAL`, which is what the row's own `reason` had always said in prose. A fabricated row is recognisable by having no `score` — a genuine signal always carries its indicator snapshot — and that is the invariant the relabelling script asserts afterwards: **zero DIP rows without a score**.

These positions do not disappear. They are still tracked for exits, and they still appear in the Tracked lines through the Order provenance tags, which record where a decision came from as a fact rather than a guess.

#### The match window was tighter than how the account actually trades

A real buy was only credited to a signal fired within **5 days**. Measured against what actually happened: the AMZN purchase followed its dip signal by **eight** days. The signal that prompted the trade was discarded, and the engine was denied credit for a call it made — one that went on to return +18.1%.

Widened to **14 days**. SEC0.DE, acted on 23 days after its signal, correctly stays unattributed: at some distance the entry price the signal was reasoning about no longer resembles the fill, and crediting it would be flattery rather than attribution.

Existing rows were re-credited once, by **moving** the tracking state onto the genuine signal rather than deleting and re-matching. Re-matching would have reset the position to `TRACKING` and erased a real, alerted, acted-on exit — the one part of the record that cannot be reproduced.

#### Analytics could not see its own history

`getSignalLog` defaulted to `days = 30`, and the dashboard hard-coded the same. Nothing had ever been deleted — the AMZN signal from 2026-06-17 was in the table throughout — but from the dashboard it was indistinguishable from a signal that never fired. That is how a real call came to be described as missing.

The default window is gone. A caller that wants one asks for it, and the dashboard offers 30D / 90D / 1Y / **All**, defaulting to All.

#### What the chart shows now

One Dip line, not two. With exits actually closing trades the buy-and-hold twin stopped being the interesting comparison, and a labelled dot at each exit answers the question directly: **on this date the engine said sell, and taking that advice returned this much.** The dot sits at the trade's own return on the % axis, so its height above the strategy line is exactly how far that one trade beat the bucket average.

Below it, a table of every exit with its trigger, holding period and realised return — the chart shows the shape, the table carries the numbers.

### 0.3o Type is not tracking, and a legend that was never registered (2026-08-27)

Four faults, found by pulling on one observation: _BET tickers are showing up as DIP, and that is not possible._

#### `signalType` had a hard-coded fallback to DIP

`buildSimulatedTrade` ended with:

```ts
signalType: KNOWN_SIGNAL_TYPES.has(buyRow.signalType ?? '')
  ? buyRow.signalType
  : 'DIP',   // "unknown/legacy values fall back to DIP"
```

`KNOWN_SIGNAL_TYPES` listed only the five types the engine itself emits. Any other value — including the `MANUAL` label introduced hours earlier specifically to keep non-dip positions out of the dip curve — was **silently rewritten to DIP on the way to the UI**. The database said MANUAL and the screen said DIP.

That is why relabelling the rows appeared to do nothing. Defaulting an unknown value to a _real_ category turns a display gap into a wrong measurement, and it is now `UNTAGGED`, which is not a strategy and belongs to no line.

#### The type of a position is the order's tag, not the tracker's guess

`SignalTradeTrackingService` writes a `SignalLog` row for every tracked purchase, including ones that followed no signal, so the exit machinery has something to watch. It chose that row's type itself: first `DIP` for everything, then `MANUAL` for everything. Both are wrong the same way.

**Being tracked and being a dip are unrelated facts.** Every stock and ETF in the portfolio is tracked. What kind of decision opened the position is a separate question, and the answer is already recorded — as the `BET` / `DIP` / `LEADER` tag on the order (§0.3l). The tracker now reads it, and falls back to `UNTAGGED` only when the order genuinely carries no tag, which is a gap in the record rather than a strategy to invent.

| symbol                                    | was    | order tag | now                              |
| ----------------------------------------- | ------ | --------- | -------------------------------- |
| IS0E.DE, EXV1.DE, WMT, SAN.MC, NVDA, ORCL | MANUAL | BET       | **BET**                          |
| HPE                                       | MANUAL | LEADER    | **LEADER**                       |
| SEC0.DE                                   | MANUAL | DIP       | **DIP**                          |
| AMZN, XDJP.DE, ADS.DE                     | DIP    | DIP       | DIP (genuine signals, untouched) |

A consequence worth stating: **a legitimately DIP-typed row may now have no indicator snapshot.** SEC0.DE is one — the purchase followed a dip signal by 23 days, too far to link, so the row is synthetic but the tag is still DIP. The earlier invariant "every DIP row has a score" is retired; the invariant that replaces it is _type equals the order's tag_, which holds for all eleven tracked positions.

#### Status is four facts, not two

`status: sellRow ? 'CLOSED' : 'OPEN'` could not express the difference between the engine recommending a sale and the user making one.

| status   | means                                   | today                |
| -------- | --------------------------------------- | -------------------- |
| `OPEN`   | signal fired, nothing bought            | 141                  |
| `BOUGHT` | a real purchase is linked               | 8                    |
| `CLOSED` | exit signalled, **position still held** | 1 — AMZN             |
| `SOLD`   | a real sale happened                    | 2 — IS0E.DE, XDJP.DE |

`SOLD` outranks `CLOSED`, and a sale the engine never asked for is still `SOLD` — XDJP.DE was sold on the user's own decision with no exit signal in the log. The exits table now carries both columns side by side: what the engine advised, and what was actually done, with an explicit blank where the advice was not taken.

#### The legend was never registered

Chart.js registers nothing by default. The component registered `LinearScale`, `LineController`, `LineElement`, `PointElement`, `TimeScale`, `Tooltip`, the annotation plugin and the zoom plugin — and not `Legend`. So `legend: { display: true }` configured a plugin that was not loaded: no legend drew, and since Chart.js toggles a dataset on legend click, there was nothing to click. The toggle behaviour had been written and then made unreachable.

Compounding it, the four Tracked lines were set `hidden: true` to reduce clutter — reasonable in principle, and with no legend it made them permanently invisible. **Hiding anything by default only works if the control that unhides it demonstrably exists.** All lines now draw on load.

The palette was the third layer: four of eleven lines were shades of the same green. Hues are now spread around the wheel, because grouping is what a legend is for and colour's only job on a chart this dense is to tell two lines apart.

#### An exit flag cannot carry its own label

In `chartjs-plugin-annotation@3.1.0`, `PointAnnotationOptions` has no `label` option — `label` is a separate annotation _type_. A label nested inside a point is dropped silently, which left a bare unexplained dot. Each exit now emits **two** annotations, a `point` and a `label`, joined by a callout.

The label sits **below** a winning exit rather than above it. That is the opposite of the obvious choice and the correct one: an exit marker is one trade's return plotted against a bucket average, so a winning exit is above every curve on the chart — the space beneath it is empty and the space above it is the edge of the canvas. The first version put the topmost label outside the plot area, where it was clipped.

#### How these were caught, and how they should have been caught earlier

Both chart faults compiled, typechecked, passed 328 tests and built cleanly. They were configuration that referred to something absent. The only thing that finds this class of fault is rendering the chart and looking at it, which is now part of the verification for any chart change: a standalone harness loads the same Chart.js registration and options, screenshots it, and asserts from the live chart object that the legend has entries, that clicking one hides a dataset, and that both annotations per exit exist.

### 0.4 Where ETFs fit

The thematic/sector ETFs (semiconductors, AI, blockchain, lithium/battery, EV, copper/silver miners, space, new-energy, data-centre REITs, Korea/Japan/World-Value) are **equity baskets** — less risky than a single stock, more than a broad index fund. They live in the **40% stock sleeve** and receive the **same expected-value signals as individual stocks** (they have full price history, so indicators work immediately). They are **not** in the weekly _fund_ recommendation (that's the safe index-fund core). See §15.

### 0.5 One-line method map

Indicators (RSI/MACD/Bollinger/SMA/momentum, §3.1) → composite score (§3.2) → horizon-scaled bands `σ·√42` for buy/stop/target/trail (§3.3) → terminal reach-probability, drift 0 (§3.4) → **expected-value ranking** (§13.3) → eligibility gates: score ≥ 45, not downtrend (unless a confirmed `REVERSAL`, §4.2b), not recently-exited, annual-vol ≤ 90% (§13.3) → two buy paths: `DIP` in an uptrend (§4.2) and flagged `REVERSAL` for beaten-down bear-market names (§4.2b) → exit state machine with Yang-Zhang volatility on owned positions (§4.1) → news risk-gate (§11) → credible backtest with benchmark/Sharpe/OOS/slippage (§13.3a, §0.3).

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

| Check       | URL / command                                     | Expected                        |
| ----------- | ------------------------------------------------- | ------------------------------- |
| API up      | `http://localhost:3333/api/v1/info`               | JSON response                   |
| Client up   | `https://localhost:4200/en`                       | Login page                      |
| Signals API | `GET /api/v1/signals` (with JWT)                  | `{ buy, sell, hold, reinvest }` |
| Redis       | `docker exec gf-redis-dev redis-cli -a <pw> ping` | `PONG`                          |

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

| Concern                   | File                                                                         |
| ------------------------- | ---------------------------------------------------------------------------- |
| Orchestrator              | `apps/api/src/services/signals/signals.service.ts`                           |
| Tier 1 indicators + score | `apps/api/src/services/signals/indicators.service.ts`                        |
| Tier 2 forecast + sizing  | `apps/api/src/services/signals/forecast.service.ts`                          |
| Tier 3 backtest           | `apps/api/src/services/signals/backtest.service.ts`                          |
| Telegram notifier         | `apps/api/src/services/telegram-bot/telegram-bot.service.ts`                 |
| Cron schedule             | `apps/api/src/services/cron/cron.service.ts`                                 |
| Queue + processor         | `apps/api/src/services/queues/trading-signals/`                              |
| Live quotes / cache       | `apps/api/src/services/data-provider/data-provider.service.ts`               |
| Yahoo provider            | `apps/api/src/services/data-provider/yahoo-finance/yahoo-finance.service.ts` |

---

## 3. The metrics — what every number means

All indicators are computed in **pure TypeScript** (no Python, no ML) from **end-of-day close prices** stored in the `MarketData` table (up to 400 trailing days), plus the **live quote** from Yahoo. Live volatility is measured close-to-close (EOD data has no intraday range, so true ATR isn't available).

### 3.1 Tier 1 — technical indicators (`IndicatorsService`)

| Metric                    | Meaning                                                                         | Buy-favorable when…                  |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| **RSI (14)**              | Wilder's Relative Strength Index, 0–100. Momentum oscillator.                   | RSI low (<30, oversold)              |
| **MACD (12/26/9)**        | Trend/momentum: fast EMA − slow EMA, plus a 9-period signal line and histogram. | Histogram ≥ 0 (momentum turning up)  |
| **Bollinger %B (20, 2σ)** | Where price sits in its band: 0 = lower band, 1 = upper band.                   | %B low (price near/below lower band) |
| **SMA 50 / SMA 200**      | Simple moving averages = trend regime.                                          | Price ≥ SMA200 (healthy uptrend)     |
| **Momentum 3M / 12M**     | % change over 63 / 252 trading days.                                            | 12M momentum ≥ 0 (quality filter)    |
| **Volatility (σ)**        | Std-dev of daily log returns. Drives the adaptive bands.                        | — (used for sizing/thresholds)       |

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

All exit levels use a common unit: the **expected-move band over the trading horizon**, `band = σ·√H` where `H = SIGNAL_HORIZON_DAYS` (42 ≈ 2 trading months) and σ is the daily close-to-close volatility. This makes every level reachable inside the ~2-month window you actually trade in — though note this only sizes the _price_ bands; there is no day-count exit, so a position can still sit open past the horizon if price never crosses a level.

- **Buy level** = `min( recentHigh·(1−dropPct), recentHigh·(1−k·σ·√42) )` — the more conservative of the fixed dip and the `k`-sigma band, with `k = SIGNAL_BUY_SIGMA_MULT = 1.5` and `dropPct = 10%` for stocks. (Fixed 2026-07-02: `adaptiveBuyLevel` used to hardcode a 20-day window internally regardless of `SIGNAL_HORIZON_DAYS` — it now takes `horizonDays` explicitly, so the buy-entry threshold stays consistent with the take-profit/stop/trail levels below.)
- **ETF calibration (added 2026-07-08):** ETFs use `dropPct = SIGNAL_ETF_BUY_DROP_PCT = 5%` and `k = SIGNAL_ETF_BUY_SIGMA_MULT = 1.0`. Rationale: diversified ETFs essentially never print a 10% drop off a 30-day high outside a crash (broad index ETFs typically sit 1–3% off), and the 1.5σ leg pushed volatile thematic ETFs to 20–40% required drops — which is why no ETF signal ever fired before this calibration despite ETFs passing every other gate. The asset type comes from `SymbolProfile.assetSubClass`; a per-symbol `SignalConfig.buyDropPct` differing from the 10% default still overrides. Telegram labels these `BUY (ETF dip)`. The same calibration is applied in backtests (`backtestAll` and the single-symbol endpoint via `?sigmaMult=`).
- **Take-profit target** = `(avgBuy + feePerShare)·(1 + max(floorPct, 1.5·band))` — scaled to each stock's own expected move, fee-adjusted, never below a 13.4% floor.
- **Stop-loss** = `avgBuy·(1 − 2·band)` — defined downside (active trades only).
- **Trailing stop** = `peak·(1 − 1·band)` — once the target is hit, the position rides its running peak and exits on a pullback.
- **Downtrend guard:** the default `DIP` BUY is suppressed when `SMA50 < SMA200 AND price < SMA200` (avoid catching a falling knife). Beaten-down names are reachable only via the separate, flagged `REVERSAL` path (§4.2b), which demands a _confirmed_ bottom + volume.

> **Why horizon-scaled?** Expected move grows with √time: a 1.5%-daily-vol stock moves ~9.7% (1σ) over 42 days, so a flat +30% target is still a multi-sigma event that essentially never fires in ~2 months. Scaling the target to the stock's own band keeps it reachable. Commission on both legs (distributed across the held shares) is folded into the cost basis so the target clears it.

### 3.4 Tier 2 — probabilistic forecast (`ForecastService`)

These are **context, not predictions** — a calibrated band and a probability, never a point price target.

| Output                     | Meaning                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **EWMA volatility**        | RiskMetrics (λ=0.94) daily vol — reacts faster to recent moves than plain σ.                                                                   |
| **Drift**                  | Mean daily log return, clamped to ±0.2%/day so forecasts stay conservative.                                                                    |
| **Expected-move band**     | Over the 42-trading-day horizon (same `SIGNAL_HORIZON_DAYS` as the buy/stop/target bands): `price·e^(drift·h)` ± `k·σ·√h`, as absolute prices. |
| **Hit-target probability** | Monte Carlo (2,000 GBM paths) — chance the price _touches_ the target within the horizon.                                                      |
| **Suggested amount**       | Volatility-targeted, capped fractional-Kelly sizing: more volatile names get less capital (`min(25%, 20%/annualVol)` of the budget).           |

### 3.5 Tier 3 — backtest (`BacktestService`)

Replays the engine over historical `MarketData` to report **win rate, average return, max drawdown** before you trust a threshold change. Run on demand (admin endpoint / script), **not** in the 30-minute loop.

---

## 4. The decision rules (BUY / SELL / HOLD / REINVEST)

Evaluated per symbol every run, in the asset's **native currency**.

### 4.1 Exit state machine (active trades)

Owned positions flagged `isActiveTrade` are managed by a small two-phase state machine, persisted via `SignalState.trailingPeak` (null = watching, a number = trailing). Core/long-term holdings (not flagged active-trade) are **never** sold by the engine.

**WATCHING** (`trailingPeak` is null):

- `livePrice ≤ stop-loss` → **SELL** (🛑 cut the loss).
- `livePrice ≥ take-profit target` → **enter TRAILING** (records the peak; sends a one-time "🎯 target reached, now trailing" Telegram note — does _not_ sell yet).
- otherwise → **HOLD** (shows the current target and stop).

**TRAILING** (`trailingPeak` is set):

- tracks the running peak each run; trailing stop = `peak·(1 − band)`.
- `livePrice ≤ trailing stop` → **SELL** (📉 lock in gains on the pullback).
- otherwise → **HOLD** (shows peak and trailing-exit price).

This gives a defined downside (a real risk:reward), a horizon-reachable target, and lets winners run past the target instead of capping them. SELL reasons report **net** gain after the round-trip commission.

### 4.2 BUY — `DIP` (multi-factor confirmed dip in an uptrend)

The default buy path. A `DIP` BUY fires only when **all** hold (applies to owned core dips and watchlist candidates; active trades are handled by the exit machine above):

1. `livePrice ≤ adaptive buy level` (the dip).
2. **not** in a confirmed downtrend (`SMA50 < SMA200 AND price < SMA200`).
3. **composite score ≥ 55** — the indicator score now _gates_ the entry (previously it only ranked).
4. **up day** — `livePrice > previous close` (reversal confirmation; avoids buying a still-falling knife).
5. **news sentiment ≥ −0.2** — suppresses dip-buys on bad news (skipped when no news data; see §11).

The BUY reason lists which factors aligned (score, % off high, up-day %, sentiment). The signal carries `signalType: 'DIP'`, `bearMarket: false`. Suggested size is volatility-targeted and shrunk further on negative (but above-floor) sentiment.

### 4.2b BUY — `REVERSAL` (counter-trend, bear-market — higher risk, flagged)

The `DIP` path above is deliberately uptrend-only: rules 2–4 block any name trading below its 200-day, which is exactly the beaten-down "bear-market" names you noticed _never_ produced a buy. Catching those is **catching a falling knife** unless the bottom is confirmed. The `REVERSAL` path is the controlled way to buy weakness — it requires a _confirmed_ turn, not just a low price, and it is **always flagged as higher-risk**.

A `REVERSAL` BUY fires only on a beaten-down name (not owned / not an active trade) when **all** of these confirm a bottom (`IndicatorsService.reversalStructure`):

1. **beaten down** — `price < SMA200` (below the long-term trend; the `DIP` path would have rejected it).
2. **RSI turning up but not overbought** — `RSI > RSI(prev)` **and** `RSI < SIGNAL_REVERSAL_RSI_MAX` (70). The oversold washout happened _during_ the decline; we want RSI rising back through the mid-range, **not** a vertical rip that's already overbought (that's chasing, not a reversal entry).
3. **higher low** — `min(last 5 closes) > min(prior 5 closes)` (the structural sign the downtrend has stopped making new lows).
4. **reclaimed the 20-day** — `price ≥ SMA20` (price has retaken the short-term average).
5. **capitulation / participation volume** — last volume `≥ SIGNAL_REVERSAL_VOLUME_RATIO` (1.3) × the 20-day average, when volume data is available (skipped if not). Real bottoms turn on volume; a quiet drift up is not confirmation.

When all confirm, the signal is emitted as `category: 'BUY'`, `signalType: 'REVERSAL'`, `bearMarket: true`, with `adaptiveLevel = SMA20`. The Telegram alert is labelled **"⚠️ REVERSAL BUY (bear-market)"** and the reason spells out the confirmations (`down X% off high; RSI turning up (n); reclaimed 20-day + higher-low; volume N× avg`). In the strategy builder, a confirmed reversal is the **only** way a downtrend name passes the eligibility gate (`!isDowntrend || isReversal`), and its rationale carries the same ⚠️ REVERSAL flag — it still has to clear the EV ranking and the volatility cap like any other candidate, so it is never auto-promoted just for being cheap.

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

Your universe is ~3 holdings + the watchlist. After the index expansion (§0.3g) that is **~830 symbols → 17 Yahoo requests** per evaluation (830 ÷ 50, rounded up). At one evaluation per 30 min that is **~34 requests/hour** from signals, plus the hourly 7-day data-gathering job — still far below Yahoo's unauthenticated tolerance.

> This paragraph previously read "153 symbols → 4 requests". That was true when the watchlist held ~150 names and stayed here long after it held 406. **If you change the universe size, change this number with it** — a stale capacity claim is worse than none, because it gets trusted.

**The `Too Many Requests` you saw earlier was a burst**, not steady state — it came from the one-off full-history backfill (`gather/max` over 150 symbols × years of data) combined with repeated portfolio reloads during setup/debugging. Normal operation does not do that.

### 5.3 Safeguards (recommended, in priority order)

1. **Raise the quote cache TTL** so the signals job, the portfolio page, and the data-gathering job _share_ cached quotes instead of each re-fetching. Set in `.env`:
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
- **USD is the base/ranking currency.** For cross-asset ranking, portfolio totals, and the periodic report, each value is converted to USD via `ExchangeRateDataService.toCurrency(value, native, 'USD')`. Reports show **both**: the native price _and_ the USD-normalized value.
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

| Task                       | Command                                                        |
| -------------------------- | -------------------------------------------------------------- |
| Restart API                | Stop the `start:server` process, re-run `npm run start:server` |
| Flush stale quote cache    | `docker exec gf-redis-dev redis-cli -a <pw> FLUSHALL`          |
| Inspect data               | `npx prisma studio` → http://localhost:5555                    |
| Re-fetch 7-day prices      | `POST /api/v1/admin/gather` (JWT)                              |
| One-time full backfill     | `POST /api/v1/admin/gather/max` (JWT) — use sparingly (§5.2)   |
| See current signals        | `GET /api/v1/signals` (JWT)                                    |
| Tune a symbol's thresholds | `PUT /api/v1/signals/config/:dataSource/:symbol`               |

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

| What you type                     | What happens                                                              |
| --------------------------------- | ------------------------------------------------------------------------- |
| `I sold 2 AAPL at 300`            | Logs a SELL activity (qty 2, $300/share); adds $600 to cash               |
| `bought 5 NVDA at 130 usd`        | Logs a BUY; subtracts $650 from cash                                      |
| `I sold 1 GOOGL at 175 yesterday` | Logs a SELL with yesterday's date                                         |
| `what's my balance`               | Shows current available cash                                              |
| `set my cash to 5000`             | Sets cash to an absolute $5 000 (useful for initial setup or corrections) |
| `how much cash do I have?`        | Same as balance query                                                     |

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

| Concern                           | File                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| Ollama client                     | `apps/api/src/services/ollama/ollama.service.ts`                       |
| Intent dispatch + Redis guardrail | `apps/api/src/services/telegram-bot/telegram-assistant.service.ts`     |
| Long-poll receiver                | `apps/api/src/services/telegram-bot/telegram-listener.service.ts`      |
| Bot sender (buttons + callbacks)  | `apps/api/src/services/telegram-bot/telegram-bot.service.ts`           |
| Env vars                          | `OLLAMA_API_URL`, `OLLAMA_MODEL`, `TELEGRAM_POLLING_ENABLED` in `.env` |

---

### 10.7 Production note (VPS)

When you move to a VPS, switch from long-polling to a **webhook** (Telegram pushes updates to your HTTPS endpoint instead). Set `TELEGRAM_POLLING_ENABLED=false` and configure a Telegram webhook pointing at `https://your-domain/api/v1/telegram/webhook`. Polling is ideal for local single-user dev; webhooks are cleaner at production.

---

## 11. News sentiment (optional risk gate)

The engine can fold **per-ticker news sentiment** into the BUY decision. It is used as a **risk gate**, not a directional signal: research consistently shows news sentiment predicts _volatility_ far more reliably than direction, so its job here is to **suppress dip-buys on bad news** and shrink position size on negative-but-not-disqualifying sentiment. It is **off by default** and the rest of the engine behaves identically until a key is set.

### 11.1 What it does

- A negative dip (e.g. a stock down 10% on a guidance cut) no longer looks identical to a healthy dip — a sentiment below the floor (`−0.2`) blocks the BUY.
- Sentiment is age-decayed (3-day half-life) so stale news fades out.
- Only fetched for **dipping, potentially-buyable symbols** (a cheap price pre-check), never the whole watchlist — this keeps free-tier API usage to a handful of calls per day. Results are cached in Redis for 6 hours.

### 11.2 Setup

1. Get a free API key:
   - **Alpha Vantage** (default, recommended): https://www.alphavantage.co/support/#api-key — the free `NEWS_SENTIMENT` endpoint returns a ready per-ticker score (25 requests/day, which the 6-hour cache keeps you well under).
   - _(or Finnhub — set `NEWS_SENTIMENT_PROVIDER=FINNHUB`.)_
2. Add to `.env`:
   ```env
   NEWS_SENTIMENT_API_KEY=your_key_here
   # NEWS_SENTIMENT_PROVIDER=ALPHA_VANTAGE   # default; only change for Finnhub
   ```
   > If you already use Alpha Vantage as a Ghostfolio data provider (`API_KEY_ALPHA_VANTAGE`), the feature reuses that key automatically — you can skip `NEWS_SENTIMENT_API_KEY`.
3. Restart the API. With no key set, the news gate is simply skipped (identical behavior to before).

### 11.3 How it scores

| Step    | Detail                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------- |
| Source  | Alpha Vantage `NEWS_SENTIMENT?tickers=SYM` → `feed[].ticker_sentiment[].ticker_sentiment_score` |
| Reduce  | Age-decayed weighted average over recent articles → one score in `[−1, +1]`                     |
| Decay   | `weight = exp(−ln2/3 × ageDays)` (3-day half-life)                                              |
| Gate    | BUY blocked if `score < −0.2`; suggested size scaled by `(1 + score)` when negative             |
| Cache   | `news:sentiment:<symbol>` in Redis, 6h TTL (1h on a rate-limited miss)                          |
| Failure | Never throws — missing key / no coverage / errors → `null` → gate skipped                       |

### 11.4 Relevant source files

| Concern                         | File                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Sentiment fetch + cache + decay | `apps/api/src/services/news-sentiment/news-sentiment.service.ts`                            |
| BUY gate + lazy fetch           | `resolveNewsScore` / `evaluateSymbol` in `apps/api/src/services/signals/signals.service.ts` |
| Env vars                        | `NEWS_SENTIMENT_API_KEY`, `NEWS_SENTIMENT_PROVIDER` (falls back to `API_KEY_ALPHA_VANTAGE`) |

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
- The composite **score is only an eligibility gate** (≥ 45, drops no-history/junk names) — it is _not_ multiplied into the ranking, which avoids double-counting trend.
- Eligible = not a downtrend, not just sold/stopped, score ≥ 45, and annual vol ≤ 90% (a liquidity/blow-up cap).
- Conviction (0–100) is a readable rendering of EV: 0% EV ≈ 50, +5% ≈ 100, −5% ≈ 0.

> **Honesty note:** reaching a fixed +13.4% _terminally_ within ~2 months is genuinely unlikely for a normal stock (~3–15%), so EV is **often negative** — the engine is telling you there's no compelling buy right now rather than manufacturing optimism. If you want more actionable numbers, lower the target or lengthen the horizon.

Every stock leg prints its rationale, e.g.:
`NVDA — EV +1.8% (28% × +9% target vs 72% × −7% stop, ~2mo, drift 0) · down 9.0% off 30-day high · RSI 36 · score 71/100 · uptrend · news n/a`.

### 13.3a Backtest — now credible (`GET /signals/backtest/:ds/:symbol`)

Reports, alongside the strategy result: a **buy-and-hold benchmark** (the bar to beat), **Sharpe / Sortino / Calmar / profit factor / exposure / CAGR**, an **out-of-sample** summary (held-out last 30% — guards against overfitting), and a **slippage** charge per side (`?slippageBps=`, default 10). Example finding: NVDA's active strategy returned **−3% net vs +13.5% buy-and-hold**, with out-of-sample Sharpe far below in-sample — i.e. _holding_ beat _trading_ once costs are modeled. Treat backtests on the hand-curated catalog as **survivorship-biased and optimistic**.

### 13.4 Recent-signal control

Before recommending, each candidate is re-checked against its last signal (`SignalState`, within `SIGNAL_RECENT_SIGNAL_WINDOW` = 14 days):

- **Recently signalled BUY, still valid** → tagged `↺ re-confirmed (BUY Nd ago, still valid)` (noted in the rationale).
- **Recently SELL / stopped** → **excluded** (don't re-buy what you just exited).

### 13.5 The strategies (all numbers computed by code — never by Gemma)

**Whole shares only**, one Nordnet commission per stock leg (9 SEK + 0.25%); the index leg is a fund (cash amount).

| Strategy       | Allocation (from the stock sleeve cash)             |
| -------------- | --------------------------------------------------- |
| **Aggressive** | 100% into the single highest-**EV** name            |
| **Balanced**   | top 2 distinct sectors by EV, ~50/50                |
| **Spread**     | top 3–5 distinct sectors by EV, even split          |
| **Safe 80/20** | 80% → NORDNET_GLOBAL_INDEX fund, 20% → top EV stock |

Each strategy reports shares, cost, fees, leftover cash, and the per-pick rationale. Endpoints: `GET /api/v1/signals/strategies` (JSON), `POST /api/v1/signals/strategies/send` (push). Auto-sent on the cash-increase trigger.

### 13.6 Gemma's role (strictly non-arithmetic)

The deterministic strategies message is **authoritative**. Optionally, the rendered text is passed to the local Gemma model (`OllamaService.interpretStrategies`) for a 2–3 sentence plain-language note ("cautious vs aggressive this month"), appended under `🤖 AI note:`. **Gemma never computes or emits a number** — it only paraphrases. If Ollama is unavailable or returns junk, the note is omitted and the deterministic strategies still send.

### 13.7 Telegram assistant — new questions

Beyond trade logging / balance / set-cash, the bot now understands:

- **"how long have I held NVDA"** → `📅 You've held NVDA since 2025-11-24 — 204 days.` (read-only; the date math is done in code, not Gemma).
- **"add Tesla to my watchlist"** → confirmation button → adds it (validated; bad tickers rejected).
- **"set Nordnet Global NAV to 241.10"** → updates a manual fund's NAV (see §14).

### 13.8 Relevant source files

| Concern                                                 | File                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conviction, ranking, rationale, rebalance               | `apps/api/src/services/signals/strategies.service.ts`                                                                                                                |
| Full-universe candidates + recent-signal control + send | `evaluateSymbol` / `enrichWithRecentSignals` / `maybeSendStrategies` in `signals.service.ts`                                                                         |
| Analytic reach probability                              | `reachProbability` in `apps/api/src/services/signals/forecast.service.ts`                                                                                            |
| Catalog                                                 | `libs/common/src/lib/company-catalog.ts`                                                                                                                             |
| Constants                                               | `SIGNAL_CONVICTION_PROB_WEIGHT`, `SIGNAL_BUYZONE_CONVICTION_BONUS`, `SIGNAL_RECENT_SIGNAL_WINDOW`, `SIGNAL_PORTFOLIO_FUNDS_RATIO` in `libs/common/src/lib/config.ts` |

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

Funds are **excluded from the 30-min/4-hour stock signals** (tracking-only there). A **weekly job** (`@Cron` Mondays 12:00 → `FUND_SIGNALS`) recommends _which funds to buy_ for monthly accumulation — ranked by under-weighted sector then lower fee. On-demand: `GET /api/v1/signals/funds/recommendations`, `POST .../send`.

### 14.5 60/40 rebalance

Owned funds (MANUAL) vs stocks (YAHOO) are valued each run; the budget plan steers fresh cash toward **60% funds / 40% stocks** (see §13.2). The funds sleeve buys the diversified fund picks; the stock sleeve buys the EV-ranked stocks.

### 14.6 Relevant source files

| Concern                                    | File                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Avanza resolver + scraper/seed config      | `apps/api/src/services/signals/fund-data.service.ts`                               |
| Fund catalog (held + watchlist, seedNav)   | `libs/common/src/lib/fund-catalog.ts`                                              |
| Import + held positions + sleeve valuation | `importFunds` / `computeSignalsInternal` in `signals.service.ts`                   |
| Weekly recommendation                      | `computeFundRecommendations` / `sendFundRecommendations` in `signals.service.ts`   |
| Set-NAV command                            | `setFundNav` in `apps/api/src/services/telegram-bot/telegram-assistant.service.ts` |

---

## 15. ETFs (thematic baskets in the stock sleeve)

ETFs are added like any other tradeable equity and **treated as stocks** (the 40% risk sleeve), because they have full market-price history and behave like equity bets — just diversified across a theme.

### 15.1 How they're handled

- **Priced via Yahoo** (XETRA `.DE` / EUR listings, e.g. `VVSM.DE` VanEck Semiconductor) — full OHLC history, so RSI/score/volatility/EV work immediately (unlike NAV-only mutual funds).
- **Stock sleeve (33%)**: they flow into the **expected-value** strategies (Aggressive / Balanced / Spread) exactly like individual stocks, ranked by EV, gated by score ≥ 45, downtrend, recent-exit and the volatility cap.
- **Distinct theme categories** (`etf-semiconductors`, `etf-ai`, `etf-blockchain`, `etf-lithium-battery`, `etf-ev`, `etf-copper`, `etf-silver`, `etf-space`, `etf-new-energy`, `etf-datacenter-reits`, `etf-korea`, `etf-japan`, `etf-world-value`) so the diversified Balanced/Spread strategies don't stack two of the same theme.
- **Not** in the weekly _fund_ recommendation or the 60% fund sleeve — that sleeve is reserved for broad, low-fee index _funds_ (the safe core).

### 15.2 Why this split (and why it's still simple)

A thematic ETF (say semiconductors) is a concentrated equity bet — closer in risk to a stock than to a global index fund — so it belongs in the sleeve where you "pick winners". This keeps the 60/40 intact, adds **zero new optimism** (identical EV math), and required **no new asset-classification code** — they're just more YAHOO catalog entries.

> Remember §0.3: the backtest shows active trading usually _underperforms holding_ on winners. ETFs are no different — use the signals as entry/risk timing, then mostly **hold** the themes you believe in.

### 15.3 Add / manage

- Bulk: `POST /api/v1/signals/catalog/import` (idempotent; bad tickers reported, not fatal).
- One-off from Telegram: _"add VanEck Semiconductor to my watchlist"_ (or its ticker).
- To move an ETF to the fund sleeve later, it would need a fund-sleeve classification — deliberately not built, to stay simple.
- Catalog source: `libs/common/src/lib/company-catalog.ts` (the `etf-*` categories).

### 15.4 The whole-watchlist backtest

`GET /api/v1/signals/backtest/all` (JWT) backtests every YAHOO name (incl. ETFs once they have ≥60 days of history) and returns each one's **edge over buy-and-hold** plus a summary (how many beat holding, average/median edge). This is the tool that produced the §0.3 verdict — re-run it periodically to keep yourself honest about whether the trading sleeve is earning its risk.

---

## 16. Signal log + Analytics dashboard + watchlist columns

### 16.1 The signal log (audit trail)

Every time the engine **triggers an actionable signal** (BUY, SELL, REINVEST, REVERSAL, or a trailing-stop transition — never a routine HOLD), one row is appended to the `SignalLog` table with a full snapshot of the numbers behind it: date/time, symbol, category, type (DIP/REVERSAL), live price, the indicator readings (score, RSI, MACD histogram, Bollinger %B), the terminal reach-probability, the derived expected value and stop/target levels, news score, and the human-readable reason.

- **Where it's written:** `SignalsService.evaluateAndNotify` (the 30-min cron), at the moment a signal is de-duped and notified — so the log holds clean, discrete _events_, not 261 HOLDs per run. Logging is best-effort (try/catch): a logging failure never breaks the alert.
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

The engine is otherwise **100% technical** (price/volume only). This adds one independent second signal answering a different question — "is this a fundamentally sound business at a reasonable price," never "is this technically oversold right now" (that's the composite score, §3). It is **not** a BUY gate and is **not** folded into the EV ranking; it is computed and shown for context, the same cautious "plumbing only for now" rollout used for the ETF TER field.

### 17.1 What it does

- Pulls free Yahoo `quoteSummary` fundamentals — forward P/E, return on equity, earnings growth, and analyst recommendation consensus — for genuinely dipping, potentially-buyable symbols (same cheap-price pre-check as the news gate, §11), never the whole watchlist.
- Reduces the four inputs to one **0–100 fundamentals score**, re-normalized over whichever inputs are actually available (the same null-guarding pattern as the composite score, §3).
- Surfaced on the `BUY` signal's `reason` text (`fundamentals 72/100`) and the `fundamentalsScore` field on `TradingSignal` / `StrategyCandidate` — absent for most funds/ETFs and any name outside Yahoo fundamentals coverage.

### 17.2 How it scores

| Input             | Weight | Scoring                                                                                  |
| ----------------- | ------ | ---------------------------------------------------------------------------------------- |
| Forward P/E       | 0.30   | `100 − 2·P/E` (clamped [0,100]); 20 flat if unprofitable (P/E ≤ 0)                       |
| Return on equity  | 0.25   | `50 + 100·ROE` (clamped [0,100])                                                         |
| Earnings growth   | 0.25   | `50 + 100·growth` (clamped [0,100])                                                      |
| Analyst consensus | 0.20   | net buy-lean ratio `(2·strongBuy + buy − sell − 2·strongSell) / total` → `50 + 25·ratio` |

### 17.3 Relevant source files

| Concern               | File                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fetch + score + cache | `apps/api/src/services/signals/fundamentals.service.ts`                                                                                                |
| Lazy fetch + wiring   | `resolveFundamentalsScore` / `evaluateSymbol` in `apps/api/src/services/signals/signals.service.ts`                                                    |
| Cache                 | `fundamentals:<symbol>` in Redis, 24h TTL (2h on a retryable miss) — fundamentals move on an earnings cadence, not daily                               |
| Data source           | `yahoo-finance2`'s `quoteSummary` (`defaultKeyStatistics`, `financialData`, `recommendationTrend` modules) — free, already a dependency, no extra auth |

---

## 18. Pre-buy screen (advisory context for fired BUY signals, added 2026-07-14)

Born from the first month of Simulation evidence: the engine fires on price geometry alone and is blind to _why_ a stock moves. Winners (Apple, Nvidia, Cloudflare, Alphabet) had catalysts, uptrends, and rising sectors; losers (Volkswagen, Norsk Hydro, solar ETFs) were downtrends with deteriorating analyst sentiment — and DIP entries decisively beat REVERSAL entries. The screen makes that context **systematic**: whenever a BUY (DIP or REVERSAL) actually fires, a second Telegram message summarizes the non-price evidence.

### 18.1 Advisory ONLY — by design

The screen **never blocks or re-ranks a signal**. Its filters look good on one month of simulation data but are unvalidated as hard rules — hard-coding them would violate §0.2 (no built-in optimism) the same way regime-based tranching would. Read the block, then decide. REVERSAL signals get the harder framing (`⚠️ REVERSAL — confirm a real catalyst before buying:`) because that is exactly the pattern the simulation punished.

### 18.2 What the block shows (each line best-effort, omitted when unavailable)

```
📋 Pre-buy screen (advisory — informs, never blocks)

Nvidia (NVDA)
200d trend: ▲ above · Sector (semiconductors): RISING
Analysts: IMPROVING · EPS estimates: UP
Earnings: 2026-08-27 (in 44d)
• Nvidia unveils next-gen chip... (Reuters)
```

| Line            | Source & rule                                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200d trend      | The signal's own indicator snapshot (`sma200` now carried on `TradingSignal`) — live price ≥/< its 200-day SMA. No fetch.                                                                                                       |
| Sector tailwind | In-house, zero API: average 3-month return across watchlist symbols sharing the candidate's `company-catalog` category. > +3% RISING, < −3% FALLING, else MIXED (`SIGNAL_SCREEN_SECTOR_TAILWIND_PCT`).                          |
| Analysts        | Yahoo `recommendationTrend`: net-buy ratio (§17.2's formula, shared code) of the latest month vs the month before — the DIRECTION Yahoo was already returning and we were discarding. Finnhub `/stock/recommendation` fallback. |
| EPS estimates   | Yahoo `earningsTrend`: current-year consensus estimate now vs 30 days ago (±2% = `SIGNAL_SCREEN_EPS_REVISION_PCT`).                                                                                                             |
| Earnings date   | Yahoo `calendarEvents`, Finnhub `/calendar/earnings` fallback — flags an imminent report (gap risk) before you enter.                                                                                                           |
| Headlines       | Finnhub `/company-news`, last 7 days, top 3. **US-listed companies only on the free tier** — European names simply omit this line (documented, not hidden).                                                                     |

### 18.3 Setup + rate-limit discipline

- Optional: `FINNHUB_API_KEY=<your key>` in `.env` (free account). Without it the Yahoo-only fields still populate; with nothing resolvable at all, the old "🔎 Paste into Google" prompt (§10.4) is sent instead — zero regression.
- The screen is fetched **lazily, only for the symbols that actually fired** — never for the whole ~400-row watchlist (Finnhub free tier = 60 calls/min). Cached 6h per symbol (1h on a miss), key `prebuy-screen:v1:<symbol>`.
- The screen result is persisted into the fired signal's `SignalLog.metrics.preBuyScreen`, so Analytics/Simulation can later show what the screen said at buy time.
- The Simulation summary now also shows **DIP vs REVERSAL win rates** side by side (`dipWinRate` / `reversalWinRate` cards) so the evidence that motivated this section stays visible.

### 18.4 Relevant source files

| Concern                     | File                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fetch + classify + cache    | `apps/api/src/services/signals/screening.service.ts` (pure helpers exported + unit-tested)                     |
| Wiring into the notify path | `attachPreBuyScreens` / `formatPreBuyScreens` in `apps/api/src/services/signals/signals.service.ts`            |
| Config                      | `FINNHUB_API_KEY` (`configuration.service.ts`), `SIGNAL_SCREEN_*` thresholds (`libs/common/src/lib/config.ts`) |
