import {
  SIGNAL_BUY_FEE_USD,
  SIGNAL_BUYZONE_CONVICTION_BONUS,
  SIGNAL_HORIZON_DAYS,
  SIGNAL_MAX_ANNUAL_VOL,
  SIGNAL_STRATEGY_MAX_FEE_RATIO,
  SIGNAL_STRATEGY_REDUNDANCY_PENALTY,
  SIGNAL_STRATEGY_REDUNDANCY_THRESHOLD,
  SIGNAL_STRATEGY_SCORE_FLOOR,
  SIGNAL_STRATEGY_INDEX_NAME,
  SIGNAL_STRATEGY_INDEX_RATIO,
  SIGNAL_STRATEGY_INDEX_SYMBOL
} from '@ghostfolio/common/config';
import {
  FundPick,
  InvestmentStrategy,
  StrategyLeg
} from '@ghostfolio/common/interfaces';

import { Injectable } from '@nestjs/common';

/**
 * A buyable stock with the metrics needed to rank it by conviction and explain
 * the pick. priceInBase is the live price in the base currency.
 */
export interface StrategyCandidate {
  aboveSma200: boolean;
  annualVol: number; // annualised volatility (liquidity/risk proxy)
  category: string | null;
  dropPct: number; // % below the 30-day high
  /** Composite 0-100 valuation/quality/growth score (Yahoo fundamentals). Independent of `score`. Plumbing only for now — not yet used in ranking. */
  fundamentalsScore?: number;
  isBuyZone: boolean; // currently a confirmed dip-buy setup
  isDowntrend: boolean;
  /** True when de-prioritized for fund-sleeve category overlap. Set by buildStrategies, not an input. */
  isRedundant?: boolean;
  isReversal: boolean; // confirmed reversal of a downtrend (counter-trend, flagged)
  name: string;
  newsScore: number | null;
  pctB: number | null;
  priceInBase: number;
  reachProbability: number; // analytic TERMINAL P(reach target over the horizon)
  recentBuyDays?: number; // recent-signal control: a still-valid BUY N days ago
  recentlyExited?: boolean; // recently SELL/stopped → don't re-buy
  rsi: number | null;
  score: number; // composite 0-100 buy-attractiveness (a quality gate, not a factor)
  stopLossPct: number; // downside to the stop, as a fraction
  symbol: string;
  targetGainPct: number; // upside to the target, as a fraction
  /** Annual expense ratio (%), ETFs only, from the ETF TER catalog. Plumbing only for now — not yet used in ranking. */
  terPct?: number;
}

export interface FundCandidate {
  category: string;
  currency: string;
  feePct: number;
  name: string;
  symbol: string;
  /** Annualized volatility % (from accumulated NAV history / Avanza facts). */
  annualVolPct?: number;
  /** Morningstar rating 1-5 (Avanza fund guide). */
  rating?: number;
  /** 6-month return % (own history, Avanza fallback). */
  return6mPct?: number;
  /** return6mPct / annualVolPct — data-driven ranking key within a category. */
  riskAdjustedMomentum?: number;
}

/**
 * Result of sizing a candidate basket for fees: which picks survive the
 * fee-ratio cutoff and the resulting net-of-fees capital to allocate.
 */
export interface NetCapitalPlan {
  droppedCount: number; // picks.length delta vs the input basket (for rationale text)
  feeRatio: number; // (picks.length * fee) / cash, for rationale text
  netCapital: number; // cash - picks.length * SIGNAL_BUY_FEE_USD
  picks: StrategyCandidate[]; // the (possibly trimmed) basket, in original order
}

/**
 * Deterministic builder for budget-allocation strategies. ALL arithmetic lives
 * here (whole-share counts, fees, leftovers) — Gemma never computes any of it.
 * Stock legs buy whole shares only and pay a flat per-order fee; the index leg
 * of the Safe strategy is a fund, so it takes a cash amount (funds allow
 * fractional). Inputs are pre-ranked candidates (best score first), already
 * priced in the base currency.
 */
@Injectable()
export class StrategiesService {
  public buildStrategies({
    candidates,
    cash,
    fundValueByCategory = {}
  }: {
    candidates: StrategyCandidate[];
    cash: number;
    fundValueByCategory?: Record<string, number>;
  }): InvestmentStrategy[] {
    const strategies: InvestmentStrategy[] = [];

    // Rank the WHOLE buyable universe by EXPECTED VALUE (prob × gain − loss),
    // after dropping confirmed downtrends, anything just sold/stopped, and wildly
    // volatile (illiquid/blow-up-prone) names above the liquidity cap.
    const ranked = candidates
      .filter(
        (c) =>
          // Downtrends are excluded UNLESS a confirmed reversal (flagged).
          (!c.isDowntrend || c.isReversal) &&
          !c.recentlyExited &&
          c.score >= SIGNAL_STRATEGY_SCORE_FLOOR &&
          c.annualVol <= SIGNAL_MAX_ANNUAL_VOL
      )
      .map((c) => ({ candidate: c, ev: this.expectedValue(c) }))
      .sort((a, b) => b.ev - a.ev);

    const top = ranked.map((r) => r.candidate);
    // De-prioritize (never exclude) picks whose category already dominates the
    // fund sleeve, before any other ranking/grouping reads the list.
    const flagged = this.flagRedundancy(top, fundValueByCategory);
    const byCategory = this.distinctByCategory(flagged);

    // 1) Aggressive — everything into the single highest-conviction name.
    // Exempt from fee-aware sizing: a single ticker can't be trimmed further.
    if (flagged.length >= 1) {
      strategies.push(
        this.finalize({
          cash,
          description: 'All-in on the highest-conviction candidate.',
          legs: [this.stockLeg(flagged[0], cash)],
          name: 'Aggressive'
        })
      );
    }

    // 2) Balanced — top 2 distinct sectors by conviction, ~50/50.
    if (byCategory.length >= 2) {
      const sized = this.sizeForFees(byCategory.slice(0, 2), cash);
      strategies.push(
        this.finalize({
          cash,
          description: this.describeSizing(
            'Split evenly across the top two sectors by conviction.',
            sized
          ),
          legs: this.sizeBasket(sized.picks, sized.netCapital),
          name: 'Balanced'
        })
      );
    }

    // 3) Spread — top 3–5 distinct sectors by conviction, even split.
    if (byCategory.length >= 3) {
      const sized = this.sizeForFees(
        byCategory.slice(0, Math.min(5, byCategory.length)),
        cash
      );
      strategies.push(
        this.finalize({
          cash,
          description: this.describeSizing(
            'Diversified evenly across several high-conviction sectors.',
            sized
          ),
          legs: this.sizeBasket(sized.picks, sized.netCapital),
          name: 'Spread'
        })
      );
    }

    // 4) Safe 80/20 — 80% into the index fund, 20% into the top conviction
    // name. Exempt from fee-aware sizing: fixed shape, and an unaffordable
    // single stock leg already degrades gracefully to 0 shares.
    const indexLeg: StrategyLeg = {
      category: 'funds',
      cost: Math.round(cash * SIGNAL_STRATEGY_INDEX_RATIO * 100) / 100,
      fee: 0,
      name: SIGNAL_STRATEGY_INDEX_NAME,
      shares: 0, // fund: allocated by cash amount, not whole shares
      symbol: SIGNAL_STRATEGY_INDEX_SYMBOL,
      unitPrice: 0
    };
    const safeLegs: StrategyLeg[] = [indexLeg];

    if (flagged.length >= 1) {
      safeLegs.push(
        this.stockLeg(flagged[0], cash * (1 - SIGNAL_STRATEGY_INDEX_RATIO))
      );
    }

    strategies.push(
      this.finalize({
        cash,
        description:
          '80% into the global index fund, 20% into the top conviction stock.',
        legs: safeLegs,
        name: 'Safe 80/20'
      })
    );

    return strategies;
  }

  /**
   * Expected value per trade (fraction): the decision-meaningful quantity.
   * EV = P(reach target) × target gain − P(miss) × stop loss. Probability is the
   * honest TERMINAL probability with zero drift. This is what picks are ranked by
   * — no double-counting of trend (the composite score is only an eligibility
   * gate, never multiplied in).
   */
  public expectedValue(c: StrategyCandidate): number {
    const p = Math.max(0, Math.min(1, c.reachProbability));

    return p * c.targetGainPct - (1 - p) * c.stopLossPct;
  }

  /**
   * Conviction (0-100) is a readable rendering of the expected value, nudged for
   * an actual dip-buy setup and a re-confirmed recent BUY. 0% EV ≈ 50; +5% EV ≈
   * 100; −5% EV ≈ 0.
   */
  public computeConviction(c: StrategyCandidate): number {
    let conviction = 50 + this.expectedValue(c) * 1000;

    if (c.isBuyZone) {
      conviction += SIGNAL_BUYZONE_CONVICTION_BONUS;
    }
    if (c.recentBuyDays !== undefined) {
      conviction += 5; // a still-valid recent BUY adds confidence
    }

    return Math.max(0, Math.min(100, Math.round(conviction)));
  }

  /** One-line "why": expected value, probability, payoff geometry, indicators. */
  public buildRationale(c: StrategyCandidate): string {
    const conviction = this.computeConviction(c);
    const weeks = Math.round(SIGNAL_HORIZON_DAYS / 5);
    const prob = Math.max(0, Math.min(1, c.reachProbability));
    const ev = this.expectedValue(c) * 100;
    const parts: string[] = [];

    if (c.isReversal) {
      parts.push(`⚠️ REVERSAL (bear-market, counter-trend)`);
    }
    if (c.isRedundant) {
      parts.push(
        `overlap flag: redundant vs an existing fund-sleeve category (${c.category})`
      );
    }
    if (c.recentBuyDays !== undefined) {
      parts.push(`↺ re-confirmed (BUY ${c.recentBuyDays}d ago, still valid)`);
    }

    parts.push(`conviction ${conviction}/100`);
    parts.push(
      `EV ${ev >= 0 ? '+' : ''}${ev.toFixed(1)}% (${Math.round(prob * 100)}% × +${(c.targetGainPct * 100).toFixed(0)}% target vs ${Math.round((1 - prob) * 100)}% × −${(c.stopLossPct * 100).toFixed(0)}% stop, ~${weeks}wk, drift 0)`
    );

    if (c.dropPct > 0.5) {
      parts.push(`down ${c.dropPct.toFixed(1)}% off 30-day high`);
    }
    if (c.rsi !== null) {
      parts.push(`RSI ${Math.round(c.rsi)}`);
    }
    parts.push(`score ${c.score}/100`);
    parts.push(
      c.aboveSma200 ? 'uptrend' : c.isDowntrend ? 'downtrend' : 'sideways'
    );
    // News transparency (coverage parity): show n/a when uncovered.
    parts.push(c.newsScore === null ? 'news n/a' : `news ${c.newsScore.toFixed(2)}`);

    return parts.join(' · ');
  }

  /**
   * Splits new cash toward the portfolio target (e.g. 60% funds / 40% stocks):
   * the under-weight sleeve gets cash first. Pure arithmetic.
   */
  public splitRebalanceCash({
    cash,
    fundsRatio,
    fundsValue,
    stocksValue
  }: {
    cash: number;
    fundsRatio: number;
    fundsValue: number;
    stocksValue: number;
  }): { fundsCash: number; stocksCash: number } {
    const targetTotal = fundsValue + stocksValue + cash;
    const fundsGap = fundsRatio * targetTotal - fundsValue;
    const fundsCash = Math.max(0, Math.min(cash, fundsGap));

    return {
      fundsCash: Math.round(fundsCash * 100) / 100,
      stocksCash: Math.round((cash - fundsCash) * 100) / 100
    };
  }

  /**
   * Picks up to `count` diversified funds: the best (lowest-fee) fund per
   * category, ordering categories by current under-weight (least owned value
   * first) then fee. Deterministic.
   */
  public recommendFunds({
    candidates,
    count,
    valueByCategory
  }: {
    candidates: FundCandidate[];
    count: number;
    valueByCategory: Record<string, number>;
  }): FundCandidate[] {
    const bestPerCategory = new Map<string, FundCandidate>();

    // Within a category, prefer the fund with the best risk-adjusted momentum
    // (real performance data); fall back to the cheapest fee when neither
    // candidate has metrics yet (e.g. Nordnet-branded funds building history).
    const beats = (candidate: FundCandidate, previous: FundCandidate) => {
      const a = candidate.riskAdjustedMomentum;
      const b = previous.riskAdjustedMomentum;

      if (a != null && b != null && a !== b) {
        return a > b;
      }

      if (a != null && b == null) {
        return true;
      }

      if (a == null && b != null) {
        return false;
      }

      return candidate.feePct < previous.feePct;
    };

    for (const candidate of candidates) {
      const previous = bestPerCategory.get(candidate.category);

      if (!previous || beats(candidate, previous)) {
        bestPerCategory.set(candidate.category, candidate);
      }
    }

    // Under-represented categories first (diversification), then the better
    // data-driven pick.
    return [...bestPerCategory.values()]
      .sort(
        (a, b) =>
          (valueByCategory[a.category] ?? 0) -
            (valueByCategory[b.category] ?? 0) ||
          (b.riskAdjustedMomentum ?? -Infinity) -
            (a.riskAdjustedMomentum ?? -Infinity) ||
          a.feePct - b.feePct
      )
      .slice(0, count);
  }

  /** Splits a cash amount evenly across recommended funds (funds are fractional). */
  public sizeFundPicks(funds: FundCandidate[], cash: number): FundPick[] {
    const each =
      funds.length > 0 && cash > 0
        ? Math.round((cash / funds.length) * 100) / 100
        : 0;

    return funds.map((fund) => ({ ...fund, amount: each }));
  }

  /** Whole-share stock leg sized to a budget slice; flat fee when any shares buy. */
  private stockLeg(
    candidate: StrategyCandidate,
    budget: number
  ): StrategyLeg {
    const price = candidate.priceInBase;
    const shares = price > 0 ? Math.floor(budget / price) : 0;
    const fee = shares > 0 ? SIGNAL_BUY_FEE_USD : 0;

    return {
      category: candidate.category,
      conviction: this.computeConviction(candidate),
      cost: Math.round((shares * price + fee) * 100) / 100,
      fee,
      hitProbability:
        Math.round(Math.max(0, Math.min(1, candidate.reachProbability)) * 100) /
        100,
      name: candidate.name,
      rationale: this.buildRationale(candidate),
      shares,
      symbol: candidate.symbol,
      unitPrice: Math.round(price * 100) / 100
    };
  }

  /**
   * Trims a candidate basket so fees never eat more than
   * SIGNAL_STRATEGY_MAX_FEE_RATIO of the cash budget: drops the lowest-
   * conviction (last-ranked) pick and rechecks until the ratio clears the
   * threshold or only one ticker remains. Basket must already be ranked
   * best-first. Pure, no side effects.
   */
  private sizeForFees(
    picks: StrategyCandidate[],
    cash: number
  ): NetCapitalPlan {
    if (cash <= 0) {
      return { droppedCount: 0, feeRatio: 0, netCapital: 0, picks };
    }

    let basket = [...picks];

    while (basket.length > 1) {
      const feeRatio = (basket.length * SIGNAL_BUY_FEE_USD) / cash;

      if (feeRatio <= SIGNAL_STRATEGY_MAX_FEE_RATIO) {
        break;
      }

      basket = basket.slice(0, -1); // drop lowest-conviction (last-ranked) pick
    }

    const feeRatio = (basket.length * SIGNAL_BUY_FEE_USD) / cash;
    const netCapital = cash - basket.length * SIGNAL_BUY_FEE_USD;

    return {
      droppedCount: picks.length - basket.length,
      feeRatio,
      netCapital: Math.max(0, Math.round(netCapital * 100) / 100),
      picks: basket
    };
  }

  /**
   * Sizes a whole basket of stock legs against a shared net-capital pot,
   * minimizing aggregate leftover cash (not each leg's own even split).
   * Pass 1: even split, floor to whole shares per leg (prior behavior).
   * Pass 2: repeatedly hand the pooled leftover to the highest-conviction
   * (first-ranked) leg that can afford one more whole share, until none can.
   */
  private sizeBasket(
    picks: StrategyCandidate[],
    netCapital: number
  ): StrategyLeg[] {
    if (picks.length === 0) {
      return [];
    }

    const evenBudget = netCapital / picks.length;
    const legs = picks.map((c) => this.stockLeg(c, evenBudget));
    let leftover =
      Math.round(
        (netCapital - legs.reduce((sum, leg) => sum + leg.cost, 0)) * 100
      ) / 100;

    // Greedy second pass: give the pooled leftover to the best-ranked leg
    // that can afford one more whole share, repeat until none can.
    let progressed = true;

    while (progressed && leftover > 0) {
      progressed = false;

      for (let i = 0; i < picks.length; i++) {
        const price = picks[i].priceInBase;

        if (price > 0 && price <= leftover) {
          // Feed stockLeg the leg's PRINCIPAL (cost minus the already-charged
          // fee) plus price, NOT cost+price — stockLeg applies exactly one
          // flat fee whenever shares > 0, so re-deriving from principal
          // avoids double-charging the fee on this second call.
          const principal = legs[i].cost - legs[i].fee;
          legs[i] = this.stockLeg(picks[i], principal + price);
          leftover = Math.round((leftover - price) * 100) / 100;
          progressed = true;
          break; // restart from the highest-conviction leg each time
        }
      }
    }

    return legs;
  }

  /**
   * Flags candidates whose category is already a dominant fund-sleeve holding
   * (isRedundant = true) and returns the basket re-ranked so redundant picks
   * sort behind non-redundant ones of similar EV — de-prioritized, never
   * excluded. A no-op re-sort when fundValueByCategory is empty/all-zero.
   */
  private flagRedundancy(
    candidates: StrategyCandidate[],
    fundValueByCategory: Record<string, number>
  ): StrategyCandidate[] {
    const totalFundValue = Object.values(fundValueByCategory).reduce(
      (sum, value) => sum + value,
      0
    );

    if (totalFundValue <= 0) {
      return candidates;
    }

    return candidates
      .map((c) => {
        const categoryValue = c.category
          ? (fundValueByCategory[c.category] ?? 0)
          : 0;
        const categoryShare = categoryValue / totalFundValue;

        return {
          ...c,
          isRedundant: categoryShare > SIGNAL_STRATEGY_REDUNDANCY_THRESHOLD
        };
      })
      .sort((a, b) => {
        const evA =
          this.expectedValue(a) *
          (a.isRedundant ? SIGNAL_STRATEGY_REDUNDANCY_PENALTY : 1);
        const evB =
          this.expectedValue(b) *
          (b.isRedundant ? SIGNAL_STRATEGY_REDUNDANCY_PENALTY : 1);

        return evB - evA;
      });
  }

  /** Appends a one-line note when sizeForFees trimmed the basket for fees. */
  private describeSizing(base: string, sized: NetCapitalPlan): string {
    if (sized.droppedCount === 0) {
      return base;
    }

    const totalPicks = sized.picks.length + sized.droppedCount;
    const pct = Math.round(SIGNAL_STRATEGY_MAX_FEE_RATIO * 100);

    return `${base} Reduced from ${totalPicks} to ${sized.picks.length} picks — fees would exceed ${pct}% of budget on a larger basket.`;
  }

  private finalize({
    cash,
    description,
    legs,
    name
  }: {
    cash: number;
    description: string;
    legs: StrategyLeg[];
    name: string;
  }): InvestmentStrategy {
    const invested =
      Math.round(legs.reduce((sum, leg) => sum + leg.cost, 0) * 100) / 100;
    const fees =
      Math.round(legs.reduce((sum, leg) => sum + leg.fee, 0) * 100) / 100;
    const cashLeft = Math.round((cash - invested) * 100) / 100;

    return { cashLeft, description, fees, invested, legs, name };
  }

  private distinctByCategory(
    candidates: StrategyCandidate[]
  ): StrategyCandidate[] {
    const seen = new Set<string>();
    const result: StrategyCandidate[] = [];

    for (const candidate of candidates) {
      const key = candidate.category ?? candidate.symbol;

      if (!seen.has(key)) {
        seen.add(key);
        result.push(candidate);
      }
    }

    return result;
  }
}
