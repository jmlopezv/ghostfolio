import { ActivitiesService } from '@ghostfolio/api/app/activities/activities.service';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  computeSeriesMetrics,
  FundHistoryService
} from '@ghostfolio/api/services/signals/fund-history.service';
import { LeaderScreenService } from '@ghostfolio/api/services/signals/leader-screen.service';
import { OhlcBarService } from '@ghostfolio/api/services/signals/ohlc-bar.service';
import { SymbolProfileService } from '@ghostfolio/api/services/symbol-profile/symbol-profile.service';
import {
  SIGNAL_ASSET_DETAIL_INPUT_CACHE_TTL,
  SIGNAL_HISTORY_FETCH_DAYS,
  SIGNAL_RS_MIN_UNIVERSE,
  SIGNAL_RS_RANK_CACHE_KEY
} from '@ghostfolio/common/config';
import {
  AssetDetailResponse,
  AssetHolding,
  AssetOverlap,
  AssetPeriodReturn,
  AssetStyleBox,
  CorrelationMatrixResponse,
  RsRankPublication,
  TrendTemplateSnapshot
} from '@ghostfolio/common/interfaces';

import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Type as ActivityType } from '@prisma/client';
import { subDays } from 'date-fns';
import * as https from 'node:https';
import YahooFinance from 'yahoo-finance2';

const STYLE_BOX_CACHE_TTL = 24 * 60 * 60 * 1000;
// Transient Yahoo fetch failures (rate-limit/bot-detection blips) get a much
// shorter negative-cache window than a genuine "no data" result, so they
// self-heal instead of freezing a fund into a fallback for a full day.
const STYLE_BOX_NEGATIVE_CACHE_TTL = 60 * 60 * 1000;
const STYLE_BOX_NONE = 'NONE';
// Bumped whenever the computed shape/methodology changes, so 24h-cached
// blobs from an older version are never served under new logic.
// v3: reverted the constituent-based median-market-cap estimate (v2) after
// live-testing found it produced currency-scale garbage and structurally
// biased LARGE misclassifications — bumping again so those bad v2-cached
// blobs are never served.
// v4: now prefers Yahoo's own real Morningstar classification (see
// `getYahooEtfProfile`) over the ratio-based estimate, and adds
// `sizeStyleSource` to the shape.
// v5: adds `expenseRatioPct` (Yahoo's real "Annual Report Expense Ratio
// (net)"), fetched from the same Profile page.
const STYLE_BOX_CACHE_VERSION = 'v5';

const YAHOO_PROFILE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Legal-form / share-class noise stripped so the same company matches across
// Yahoo and Nordnet naming (e.g. "Apple Inc" ↔ "Apple", "Volvo AB" ↔ "Volvo").
const NAME_NOISE =
  /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|lp|ag|sa|nv|se|ab|asa|oyj|oy|spa|s\.p\.a|group|holdings?|the|class\s+[a-c]|series\s+[a-c]|adr|reg|cls|[a-c]-shares?)\b/g;

/** Canonical form of a holding name for cross-source overlap matching. */
export function normalizeHoldingName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,/#!$%^*;:{}=_`~()'"-]/g, ' ')
    .replace(NAME_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Holdings-weight overlap of two funds/ETFs: the sum of the shared minimum
 * weight over holdings whose normalized names match. Weights are fractions,
 * so the result is 0-100 (%). Also returns the shared holding display names
 * and, per shared name, the exact min-weight it contributed to the overlap
 * (so callers can compute "what % of this overlap is X" without re-deriving
 * the matching logic).
 */
export function holdingsOverlap(
  a: AssetHolding[],
  b: AssetHolding[]
): {
  overlapPct: number;
  shared: string[];
  sharedDetail: { name: string; weight: number }[];
} {
  if (!a?.length || !b?.length) {
    return { overlapPct: 0, shared: [], sharedDetail: [] };
  }

  const bByName = new Map<string, { name: string; weight: number }>();

  for (const holding of b) {
    const key = normalizeHoldingName(holding.name);

    if (key) {
      const existing = bByName.get(key);
      bByName.set(key, {
        name: holding.name,
        weight: (existing?.weight ?? 0) + holding.weight
      });
    }
  }

  let overlap = 0;
  const shared: string[] = [];
  const sharedDetail: { name: string; weight: number }[] = [];

  for (const holding of a) {
    const key = normalizeHoldingName(holding.name);
    const match = key ? bByName.get(key) : undefined;

    if (match) {
      const contributed = Math.min(holding.weight, match.weight);
      overlap += contributed;
      shared.push(holding.name);
      sharedDetail.push({ name: holding.name, weight: contributed });
    }
  }

  return {
    overlapPct: Math.round(overlap * 100 * 10) / 10,
    shared,
    sharedDetail
  };
}

/**
 * Of a holdings-overlap's shared weight (see `sharedDetail` above), the % that
 * belongs to names the user already owns directly as individual stocks
 * elsewhere in their portfolio — 0-100. Lets the Correlation tab show not
 * just "how similar" two assets are, but "how much of that similarity is
 * exposure you already have."
 */
export function ownedSharedShare(
  sharedDetail: { name: string; weight: number }[],
  ownedHoldingNames: Set<string>
): number {
  if (!sharedDetail.length) {
    return 0;
  }

  const total = sharedDetail.reduce((sum, s) => sum + s.weight, 0);

  if (total <= 0) {
    return 0;
  }

  const owned = sharedDetail.reduce(
    (sum, s) =>
      sum +
      (ownedHoldingNames.has(normalizeHoldingName(s.name)) ? s.weight : 0),
    0
  );

  return Math.round((owned / total) * 100 * 10) / 10;
}

/**
 * Yahoo Finance's own Profile page renders the real Morningstar Style Box as
 * one of exactly 9 static images (`https://s.yimg.com/lq/i/fi/3_0stylelargeeq{N}.gif`,
 * N=1-9) — not a per-symbol render. Decoded live against known funds (Vanguard
 * Value=eq1, S&P 500=eq2, Vanguard Growth=eq3, iShares World Small Cap /
 * Russell 2000=eq8): N-1 is a row-major index into the 3×3 grid, rows = size
 * (Large/Mid/Small), columns = style (Value/Blend/Growth) — i.e.
 * `N = size*3 + style + 1`. Since there are only 9 possible images total,
 * decoding which one Yahoo picked gives the exact real classification
 * (no heuristic), and needs no per-image asset management as new ETFs are
 * added — just this arithmetic.
 */
export function parseYahooStyleBoxIndex(html: string): number | undefined {
  const match = /stylelargeeq(\d)\.gif/.exec(html);
  const index = match ? parseInt(match[1], 10) : NaN;

  return index >= 1 && index <= 9 ? index : undefined;
}

/**
 * Yahoo Finance's ETF Profile page has an "ETF Operations" table with the
 * fund's real "Annual Report Expense Ratio (net)" — the same page already
 * fetched for the Style Box, so this is extracted from that same HTML
 * (confirmed live, e.g. VVSM.DE → 0.35%) rather than a second request.
 */
export function parseYahooExpenseRatioPct(html: string): number | undefined {
  const match =
    /Annual Report Expense Ratio \(net\)<\/td>\s*<td[^>]*>([0-9.]+)%<\/td>/.exec(
      html
    );
  const pct = match ? parseFloat(match[1]) : NaN;

  return Number.isFinite(pct) && pct >= 0 ? pct : undefined;
}

const STYLE_BOX_SIZES: AssetStyleBox['size'][] = ['LARGE', 'MID', 'SMALL'];
const STYLE_BOX_STYLES: AssetStyleBox['style'][] = ['VALUE', 'BLEND', 'GROWTH'];

/** Converts Yahoo's 1-9 style-box image index into a {size, style} cell. */
export function styleBoxIndexToCell(
  index: number
): { size: AssetStyleBox['size']; style: AssetStyleBox['style'] } | undefined {
  if (!(index >= 1 && index <= 9)) {
    return undefined;
  }

  const zeroBased = index - 1;

  return {
    size: STYLE_BOX_SIZES[Math.floor(zeroBased / 3)],
    style: STYLE_BOX_STYLES[zeroBased % 3]
  };
}

/**
 * FALLBACK ONLY — used when `parseYahooStyleBoxIndex` can't get Yahoo's real
 * classification (fetch failed, or Yahoo has no style box for this listing).
 * Derived Morningstar-style 3×3 cell from Yahoo equity-holdings inputs.
 *
 * Style (value/blend/growth) mirrors the shape of Morningstar's real
 * methodology (an "Overall Value Score" netted against an "Overall Growth
 * Score", not a single combined vote): Morningstar's actual 10-factor model
 * scores 5 value ratios (P/E, P/B, P/S, P/CF, dividend yield) and 5 growth
 * rates (LT projected/historical earnings growth, sales/cash-flow/book-value
 * growth) independently, then nets growth-minus-value into a continuum —
 * Value (<100), Core/Blend (100-200), Growth (>200) on their 0-300 scale.
 * (Sources: Morningstar's Style Box glossary and methodology paper.)
 *
 * We only have 4 of the 5 value ratios (no dividend yield in Yahoo's
 * `equityHoldings`) and 1 of the 5 growth rates (`threeYearEarningsGrowth`)
 * — so this is an honest approximation of that shape, not the real
 * proprietary model: each available ratio contributes a 0-100 "cheapness"
 * score (linearly ramped between a cheap and an expensive reference point,
 * clamped), averaged into an overall value score; the one growth rate is
 * similarly ramped into a growth score; growth-minus-value nets into the
 * VALUE/BLEND/GROWTH call. Degrades gracefully — re-normalizes over whichever
 * factors are actually present, same pattern as `computeScore` elsewhere in
 * this codebase.
 *
 * Size uses median market cap against approximate dollar breakpoints
 * (Morningstar's real model uses cumulative-market-cap percentile within a
 * regional peer "style zone", which needs a full market dataset we don't
 * have — this is a documented approximation of it).
 */
export function classifyStyleBox(inputs: {
  medianMarketCap?: number;
  priceToBook?: number;
  priceToCashflow?: number;
  priceToEarnings?: number;
  priceToSales?: number;
  threeYearEarningsGrowth?: number;
}): { size?: AssetStyleBox['size']; style?: AssetStyleBox['style'] } {
  const {
    medianMarketCap,
    priceToBook,
    priceToCashflow,
    priceToEarnings,
    priceToSales,
    threeYearEarningsGrowth
  } = inputs;

  let size: AssetStyleBox['size'];

  if (medianMarketCap != null && medianMarketCap > 0) {
    // Approximate Morningstar giant/large ($34bn+), mid ($8-34bn), small/micro
    // (<$8bn) breakpoints, collapsed into our 3-row grid.
    size =
      medianMarketCap >= 34e9
        ? 'LARGE'
        : medianMarketCap >= 8e9
          ? 'MID'
          : 'SMALL';
  }

  // cheap → 100, expensive → 0, linear ramp between the two reference points.
  const cheapnessScore = (
    value: number | undefined,
    cheapAt: number,
    expensiveAt: number
  ): number | undefined => {
    if (value == null || value <= 0) {
      return undefined;
    }

    const ramp = (100 * (expensiveAt - value)) / (expensiveAt - cheapAt);

    return Math.min(100, Math.max(0, ramp));
  };

  const valueSignals = [
    cheapnessScore(priceToEarnings, 12, 40),
    cheapnessScore(priceToBook, 1, 6),
    cheapnessScore(priceToSales, 0.5, 5),
    cheapnessScore(priceToCashflow, 5, 25)
  ].filter((value): value is number => value != null);

  const valueScore =
    valueSignals.length > 0
      ? valueSignals.reduce((a, b) => a + b, 0) / valueSignals.length
      : undefined;

  const growthScore =
    threeYearEarningsGrowth != null
      ? Math.min(
          100,
          Math.max(
            0,
            (100 * (threeYearEarningsGrowth - -0.05)) / (0.25 - -0.05)
          )
        )
      : undefined;

  let style: AssetStyleBox['style'];

  if (valueScore != null || growthScore != null) {
    // Missing side defaults to a neutral 50 so one-sided data still nets
    // sensibly instead of forcing an extreme classification off one signal.
    const net = (growthScore ?? 50) - (valueScore ?? 50);
    style = net >= 15 ? 'GROWTH' : net <= -15 ? 'VALUE' : 'BLEND';
  }

  return { size, style };
}

/**
 * Assembles the fund/ETF detail view payload: holdings, a derived style box
 * (ETFs), and the holdings-overlap correlation of the selected asset with
 * every other watchlist fund/ETF (portfolio-owned ones flagged). Fund holdings
 * come from Nordnet (FundFacts), ETF holdings from the stored Yahoo profile
 * (live-fetched + persisted when missing). Never throws for the style box.
 */
@Injectable()
export class AssetDetailService {
  private readonly logger = new Logger(AssetDetailService.name);

  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey']
  });

  // Watchlist-wide inputs that every asset-detail call rebuilds identically.
  // See SIGNAL_ASSET_DETAIL_INPUT_CACHE_TTL.
  private readonly holdingsCache = new Map<
    string,
    { expiresAt: number; value: Promise<Map<string, AssetHolding[]>> }
  >();

  private readonly ownershipCache = new Map<
    string,
    {
      expiresAt: number;
      value: Promise<{ ownedKeys: Set<string>; ownedStockNames: Set<string> }>;
    }
  >();

  public constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly fundHistoryService: FundHistoryService,
    private readonly leaderScreenService: LeaderScreenService,
    private readonly marketDataService: MarketDataService,
    private readonly ohlcBarService: OhlcBarService,
    private readonly prismaService: PrismaService,
    private readonly redisCacheService: RedisCacheService,
    private readonly symbolProfileService: SymbolProfileService
  ) {}

  /**
   * Serves `cache` for `userId`, building at most one value per TTL window.
   *
   * The promise is stored before it settles, so callers arriving mid-build
   * join it rather than starting a second one; a rejection is evicted so a
   * transient failure is not held for the rest of the window.
   */
  private memoizeByUser<T>(
    cache: Map<string, { expiresAt: number; value: Promise<T> }>,
    userId: string,
    build: () => Promise<T>
  ): Promise<T> {
    const cached = cache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = build();

    cache.set(userId, {
      expiresAt: Date.now() + SIGNAL_ASSET_DETAIL_INPUT_CACHE_TTL,
      value
    });

    value.catch(() => {
      if (cache.get(userId)?.value === value) {
        cache.delete(userId);
      }
    });

    return value;
  }

  public async getAssetDetail(
    userId: string,
    dataSource: DataSource,
    symbol: string
  ): Promise<AssetDetailResponse> {
    const [facts, watchlist, ownership] = await Promise.all([
      this.fundHistoryService.getFacts(),
      this.getWatchlist(userId),
      this.memoizeByUser(this.ownershipCache, userId, () => {
        return this.getOwnership(userId);
      })
    ]);
    const { ownedKeys, ownedStockNames } = ownership;

    const selected = watchlist.find(
      (item) => item.dataSource === dataSource && item.symbol === symbol
    );

    // Holdings of every watchlist fund/ETF, keyed by "dataSource:symbol".
    // Watchlist-wide and identical for every symbol, so it is memoised rather
    // than reloading ~870 symbol profiles once per dialog open.
    const holdingsByKey = await this.memoizeByUser(
      this.holdingsCache,
      userId,
      () => {
        return this.collectHoldings(watchlist, facts);
      }
    );
    const key = `${dataSource}:${symbol}`;
    const holdings = holdingsByKey.get(key) ?? [];

    const overlaps: AssetOverlap[] = [];

    for (const item of watchlist) {
      const itemKey = `${item.dataSource}:${item.symbol}`;

      if (itemKey === key) {
        continue;
      }

      const other = holdingsByKey.get(itemKey);

      if (!other?.length || holdings.length === 0) {
        continue;
      }

      const { overlapPct, shared, sharedDetail } = holdingsOverlap(
        holdings,
        other
      );

      if (overlapPct > 0) {
        overlaps.push({
          assetSubClass: item.assetSubClass ?? undefined,
          dataSource: item.dataSource,
          name: item.name,
          overlapPct,
          owned: ownedKeys.has(itemKey),
          ownedSharedPct: ownedSharedShare(sharedDetail, ownedStockNames),
          sharedCount: shared.length,
          sharedHoldings: shared.slice(0, 10),
          symbol: item.symbol
        });
      }
    }

    overlaps.sort((a, b) => b.overlapPct - a.overlapPct);

    const styleBox =
      dataSource === DataSource.YAHOO
        ? await this.getStyleBox(symbol)
        : this.getFundStyleBox(facts[symbol]);

    return {
      assetSubClass: selected?.assetSubClass ?? undefined,
      currency: selected?.currency ?? undefined,
      dataSource,
      holdings,
      name: selected?.name ?? symbol,
      overlaps,
      owned: ownedKeys.has(key),
      returns: await this.getReturns(dataSource, symbol, facts),
      sectors: await this.getSectors(dataSource, symbol),
      styleBox,
      symbol,
      trendTemplate: await this.getTrendTemplate(dataSource, symbol)
    };
  }

  /**
   * Minervini scorecard for the ticker dialog's Trend tab.
   *
   * Lives here rather than on the watchlist row because the dialog is opened
   * from four places (watchlist, Analytics, Correlation, Simulation) and only
   * the watchlist has a metrics row to pass down; hanging it off the detail
   * fetch the dialog already makes gives one code path for all four.
   *
   * `rsRank` is cross-sectional and cannot be derived from one symbol, so it is
   * read from the map the watchlist-metrics pass publishes. A cold cache means
   * UNRANKED, not a failed criterion — ranking one name against itself would be
   * meaningless, and calling that a failure would understate a real leader.
   */
  private async getTrendTemplate(
    dataSource: DataSource,
    symbol: string
  ): Promise<TrendTemplateSnapshot | undefined> {
    if (dataSource !== DataSource.YAHOO) {
      return undefined;
    }

    try {
      const bars = await this.ohlcBarService.getBars({ dataSource, symbol });
      const { rsAsOf, rsCohortSize, rsRank, rsUnavailableReason } =
        await this.getCachedRsRank(symbol);
      const trend = this.leaderScreenService.trendTemplate({ bars, rsRank });

      if (!trend) {
        return undefined;
      }

      const vcp = this.leaderScreenService.vcpStructure(bars);
      const price = trend.values.price;

      const snapshot: TrendTemplateSnapshot = {
        aboveLowPct: trend.aboveLowPct,
        belowHighPct: trend.belowHighPct,
        criteria: trend.criteria as unknown as Record<string, boolean>,
        passCount: trend.passCount,
        rsAsOf,
        rsCohortSize,
        rsRank: trend.rsRank,
        rsUnavailableReason,
        sma200RisingDays: trend.sma200RisingDays,
        values: trend.values
      };

      if (!vcp) {
        return snapshot;
      }

      if (!vcp.isValid) {
        return {
          ...snapshot,
          vcpRejectedReason: vcp.rejectedReason ?? undefined
        };
      }

      return {
        ...snapshot,
        vcp: {
          baseDays: vcp.baseDays,
          breakoutVolumeRatio: vcp.breakoutVolumeRatio,
          depthsPct: vcp.contractions.map(({ depthPct }) =>
            Number((depthPct * 100).toFixed(1))
          ),
          dryUpRatio: vcp.dryUpRatio,
          pivot: vcp.pivot,
          pivotDistancePct: vcp.pivot > 0 ? (price - vcp.pivot) / vcp.pivot : 0,
          status: vcp.status
        }
      };
    } catch (error) {
      this.logger.warn(`Trend template failed for ${symbol}: ${error}`);

      return undefined;
    }
  }

  /**
   * The symbol's RS percentile from the published map, with the cohort it was
   * measured against — and, when there is no rank, WHY.
   *
   * The three causes are genuinely different and used to be reported as one:
   * an expired publication, a symbol with too little history to be scored, and
   * a cohort too small for a percentile to mean anything. Only the first is a
   * fault, and it stayed invisible for as long as the dialog blamed the third.
   */
  private async getCachedRsRank(symbol: string): Promise<{
    rsAsOf?: string;
    rsCohortSize?: number;
    rsRank: number | null;
    rsUnavailableReason?: TrendTemplateSnapshot['rsUnavailableReason'];
  }> {
    let publication: RsRankPublication | undefined;

    try {
      const cached = await this.redisCacheService.get(SIGNAL_RS_RANK_CACHE_KEY);

      if (cached) {
        publication = JSON.parse(cached) as RsRankPublication;
      }
    } catch {
      // A malformed or unreachable cache is indistinguishable from an empty
      // one for this purpose: there is no rank to show either way.
    }

    if (!publication?.ranks) {
      return { rsRank: null, rsUnavailableReason: 'NOT_PUBLISHED' };
    }

    const shared = {
      rsAsOf: publication.asOf ?? undefined,
      rsCohortSize: publication.cohortSize
    };
    const rsRank = publication.ranks[symbol];

    if (rsRank === undefined) {
      return {
        ...shared,
        rsRank: null,
        // The publisher drops a symbol only when the ranking excluded it, and
        // `CrossSectionalService.rank` excludes on history alone — unless the
        // whole cohort fell under the floor, in which case nothing is ranked.
        rsUnavailableReason:
          publication.cohortSize < SIGNAL_RS_MIN_UNIVERSE
            ? 'UNIVERSE_TOO_SMALL'
            : 'INSUFFICIENT_HISTORY'
      };
    }

    return { ...shared, rsRank };
  }

  /**
   * Full ETF↔ETF holdings-overlap matrix for every ETF in the watchlist —
   * the "see all of them at once" view the per-asset Correlation tab can't
   * give you. Reuses the exact same `collectHoldings`/`holdingsOverlap`
   * logic as `getAssetDetail`, just applied pairwise across every ETF
   * instead of "selected vs everyone else". Overlap is symmetric, so only
   * the upper triangle is computed and mirrored (roughly half the work for
   * ~54 ETFs: ~1,431 pairs instead of ~2,862).
   */
  public async getCorrelationMatrix(
    userId: string
  ): Promise<CorrelationMatrixResponse> {
    const [facts, watchlist, ownership] = await Promise.all([
      this.fundHistoryService.getFacts(),
      this.getWatchlist(userId),
      this.getOwnership(userId)
    ]);
    const { ownedKeys } = ownership;

    const etfs = watchlist.filter((item) => item.assetSubClass === 'ETF');
    const holdingsByKey = await this.collectHoldings(etfs, facts);

    const symbols = etfs.map((item) => ({
      dataSource: item.dataSource,
      name: item.name,
      // Reflects current net activity quantities live — automatically
      // updates as positions are bought/sold, no separate bookkeeping.
      owned: ownedKeys.has(`${item.dataSource}:${item.symbol}`),
      symbol: item.symbol
    }));

    const n = symbols.length;
    const matrix: number[][] = Array.from({ length: n }, () =>
      new Array(n).fill(0)
    );

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 100;
      const holdingsA =
        holdingsByKey.get(`${symbols[i].dataSource}:${symbols[i].symbol}`) ??
        [];

      for (let j = i + 1; j < n; j++) {
        const holdingsB =
          holdingsByKey.get(`${symbols[j].dataSource}:${symbols[j].symbol}`) ??
          [];
        const { overlapPct } = holdingsOverlap(holdingsA, holdingsB);

        matrix[i][j] = overlapPct;
        matrix[j][i] = overlapPct;
      }
    }

    return { generatedAt: new Date().toISOString(), matrix, symbols };
  }

  /** Watchlist funds + ETFs (the correlation universe). */
  private async getWatchlist(userId: string): Promise<
    {
      assetSubClass: string | null;
      currency: string;
      dataSource: DataSource;
      name: string;
      symbol: string;
    }[]
  > {
    const user = await this.prismaService.user.findUnique({
      select: {
        watchlist: {
          select: {
            assetSubClass: true,
            currency: true,
            dataSource: true,
            name: true,
            symbol: true
          }
        }
      },
      where: { id: userId }
    });

    return (user?.watchlist ?? [])
      .filter(
        (profile) =>
          profile.dataSource === DataSource.MANUAL ||
          profile.assetSubClass === 'ETF' ||
          profile.assetSubClass === 'MUTUALFUND'
      )
      .map((profile) => ({
        assetSubClass: profile.assetSubClass ?? null,
        currency: profile.currency,
        dataSource: profile.dataSource,
        name: profile.name ?? profile.symbol,
        symbol: profile.symbol
      }));
  }

  /**
   * Ownership data derived from the user's net activity positions:
   * `ownedKeys` = "dataSource:symbol" for anything currently held
   * (netQuantity > 0, any asset type); `ownedStockNames` = normalized company
   * names of currently-held individual STOCK positions only — used to answer
   * "of this overlap, how much do I already own directly" on the Correlation
   * tab (a fund/ETF a user owns isn't itself a "holding name" to match).
   */
  private async getOwnership(
    userId: string
  ): Promise<{ ownedKeys: Set<string>; ownedStockNames: Set<string> }> {
    const { activities } = await this.activitiesService.getActivities({
      types: [ActivityType.BUY, ActivityType.SELL],
      // Only net quantities are read below, so the base currency is irrelevant.
      userCurrency: 'USD',
      userId
    });

    const net = new Map<string, number>();
    const nameByKey = new Map<
      string,
      { name: string; assetSubClass: string | null }
    >();

    for (const activity of activities) {
      const profile = activity.SymbolProfile;

      if (!profile) {
        continue;
      }

      const netKey = `${profile.dataSource}:${profile.symbol}`;
      const delta =
        activity.type === ActivityType.BUY
          ? activity.quantity
          : -activity.quantity;
      net.set(netKey, (net.get(netKey) ?? 0) + delta);
      nameByKey.set(netKey, {
        assetSubClass: profile.assetSubClass ?? null,
        name: profile.name ?? profile.symbol
      });
    }

    const ownedKeys = new Set(
      [...net.entries()].filter(([, qty]) => qty > 0).map(([k]) => k)
    );

    const ownedStockNames = new Set(
      [...ownedKeys]
        .map((k) => nameByKey.get(k))
        .filter((info) => info?.assetSubClass === 'STOCK')
        .map((info) => normalizeHoldingName(info.name))
        .filter((name) => name.length > 0)
    );

    return { ownedKeys, ownedStockNames };
  }

  /**
   * Trailing 1D/1W/1M/3M/6M/1Y % returns for the Chart tab's period buttons.
   * Funds use Nordnet's own already-parsed official period returns (real
   * numbers, no computation); stocks/ETFs are computed from our own stored
   * price history via the same windowing `computeSeriesMetrics` already uses
   * for the watchlist/fund-metrics views (no separate implementation).
   * Never throws — a fetch/compute failure just yields no buttons.
   */
  private async getReturns(
    dataSource: DataSource,
    symbol: string,
    facts: Record<
      string,
      {
        developments?: {
          oneDay?: number;
          oneMonth?: number;
          oneWeek?: number;
          oneYear?: number;
          sixMonths?: number;
          threeMonths?: number;
        };
      }
    >
  ): Promise<AssetPeriodReturn[]> {
    if (dataSource === DataSource.MANUAL) {
      const developments = facts[symbol]?.developments;

      if (!developments) {
        return [];
      }

      const periods: [AssetPeriodReturn['period'], number | undefined][] = [
        ['1D', developments.oneDay],
        ['1W', developments.oneWeek],
        ['1M', developments.oneMonth],
        ['3M', developments.threeMonths],
        ['6M', developments.sixMonths],
        ['1Y', developments.oneYear]
      ];

      return periods
        .filter(
          (entry): entry is [AssetPeriodReturn['period'], number] =>
            entry[1] != null
        )
        .map(([period, pct]) => ({ period, pct }));
    }

    try {
      const marketData = await this.marketDataService.getRange({
        assetProfileIdentifiers: [{ dataSource, symbol }],
        dateQuery: { gte: subDays(new Date(), SIGNAL_HISTORY_FETCH_DAYS) }
      });

      const closes = marketData.map((row) => {
        return {
          close: row.marketPrice,
          date: row.date.toISOString().slice(0, 10)
        };
      });

      if (closes.length < 2) {
        return [];
      }

      const metrics = computeSeriesMetrics(closes);
      const previous = closes[closes.length - 2].close;
      const oneDayPct =
        previous > 0
          ? Math.round(
              (closes[closes.length - 1].close / previous - 1) * 100 * 100
            ) / 100
          : null;

      const results: AssetPeriodReturn[] = [];
      const add = (period: AssetPeriodReturn['period'], pct: number | null) => {
        if (pct != null) {
          results.push({ period, pct });
        }
      };

      add('1D', oneDayPct);
      add('1W', metrics.return1wPct);
      add('1M', metrics.return1mPct);
      add('3M', metrics.return3mPct);
      add('6M', metrics.return6mPct);
      add('1Y', metrics.return1yPct);

      return results;
    } catch (error) {
      this.logger.warn(
        `Returns fetch failed for ${dataSource}:${symbol}: ${error}`
      );

      return [];
    }
  }

  private async collectHoldings(
    watchlist: {
      assetSubClass: string | null;
      dataSource: DataSource;
      symbol: string;
    }[],
    facts: Record<string, { topHoldings?: { name: string; weight: number }[] }>
  ): Promise<Map<string, AssetHolding[]>> {
    const result = new Map<string, AssetHolding[]>();

    const yahooItems = watchlist.filter(
      (item) => item.dataSource === DataSource.YAHOO
    );

    // Funds (Nordnet) — from the cached facts.
    for (const item of watchlist) {
      if (item.dataSource === DataSource.MANUAL) {
        const topHoldings = facts[item.symbol]?.topHoldings ?? [];
        result.set(
          `${item.dataSource}:${item.symbol}`,
          topHoldings.map(({ name, weight }) => ({ name, weight }))
        );
      }
    }

    // ETFs — from the stored Yahoo profile.
    if (yahooItems.length > 0) {
      const profiles = await this.symbolProfileService.getSymbolProfiles(
        yahooItems.map(({ dataSource, symbol }) => ({ dataSource, symbol }))
      );

      for (const profile of profiles) {
        result.set(
          `${profile.dataSource}:${profile.symbol}`,
          (profile.holdings ?? []).map((holding) => ({
            name: holding.name,
            weight: holding.allocationInPercentage
          }))
        );
      }
    }

    return result;
  }

  private async getSectors(
    dataSource: DataSource,
    symbol: string
  ): Promise<{ name: string; weight: number }[]> {
    if (dataSource !== DataSource.YAHOO) {
      return [];
    }

    const [profile] = await this.symbolProfileService.getSymbolProfiles([
      { dataSource, symbol }
    ]);

    return (profile?.sectors ?? []).map((sector) => ({
      name: sector.name,
      weight: sector.weight
    }));
  }

  /** Fund style box = Nordnet category + Morningstar rating (no 3×3). */
  private getFundStyleBox(facts?: {
    nordnetCategory?: string;
    rating?: number;
  }): AssetStyleBox | undefined {
    if (!facts?.nordnetCategory && facts?.rating == null) {
      return undefined;
    }

    return {
      category: facts?.nordnetCategory,
      morningStarRating: facts?.rating
    };
  }

  /** ETF style box from Yahoo equity-holdings inputs, Redis-cached 24h. */
  private async getStyleBox(
    symbol: string
  ): Promise<AssetStyleBox | undefined> {
    const cacheKey = `style-box:${STYLE_BOX_CACHE_VERSION}:${symbol}`;

    try {
      const cached = await this.redisCacheService.get(cacheKey);

      if (cached === STYLE_BOX_NONE) {
        return undefined;
      }

      if (cached) {
        return JSON.parse(cached) as AssetStyleBox;
      }
    } catch {
      // ignore cache read errors
    }

    let styleBox: AssetStyleBox | undefined;

    try {
      // Independent try/catches (not a bare Promise.all) — the yahoo-finance2
      // library call and our own Profile-page scrape hit Yahoo through
      // completely different paths (one needs their internal "crumb" auth,
      // the other is a plain page fetch); confirmed live that the library
      // call can fail (Yahoo rate-limiting its own crumb endpoint) while our
      // scrape succeeds — a bare Promise.all would have discarded that
      // success too, since one rejected promise fails the whole group.
      const [summaryResult, yahooProfile] = await Promise.all([
        this.yahooFinance
          .quoteSummary(symbol, {
            modules: ['topHoldings', 'fundProfile', 'defaultKeyStatistics']
          })
          .catch((error) => {
            this.logger.warn(`quoteSummary failed for ${symbol}: ${error}`);

            return undefined;
          }),
        this.getYahooEtfProfile(symbol)
      ]);
      const summary = summaryResult;
      const morningstarCell = yahooProfile.cell;

      const equity = summary?.topHoldings?.equityHoldings;
      const top = summary?.topHoldings;

      if (
        equity ||
        top ||
        morningstarCell ||
        yahooProfile.expenseRatioPct != null
      ) {
        // Yahoo returns fund P/E, P/B, P/S and P/CF as reciprocals (e.g.
        // 0.041 = P/E 24.2) — confirmed live for all 4 ratios, not just P/E
        // and P/B; invert small values back to real ratios.
        const priceToEarnings = this.asRatio(equity?.priceToEarnings);
        const priceToBook = this.asRatio(equity?.priceToBook);
        const priceToSales = this.asRatio(equity?.priceToSales);
        const priceToCashflow = this.asRatio(equity?.priceToCashflow);

        // Yahoo's own aggregate medianMarketCap is essentially never
        // populated for European-listed UCITS ETFs (confirmed live: 0/54
        // watchlist ETFs had it) — only used now as an input to the
        // ESTIMATED fallback below when the real Morningstar cell (from
        // `getYahooEtfProfile`) isn't available. A constituent-based
        // estimate of this field was tried and reverted (currency-scale
        // garbage + structurally biased LARGE misclassifications — see
        // git history) — left undefined rather than shipping a
        // confidently-wrong number.
        const medianMarketCap = equity?.medianMarketCap;

        // Prefer Yahoo's OWN real Morningstar classification (the exact
        // single cell their Profile page shows) over our own ratio-based
        // estimate — only fall back to the estimate when Yahoo has no
        // classification for this specific listing. When falling back, we
        // deliberately do NOT also fill in a guessed size — see the
        // frontend, which only draws a single-cell grid for MORNINGSTAR and
        // shows ratios only (no misleading multi-cell highlight) otherwise.
        const estimated = classifyStyleBox({
          medianMarketCap,
          priceToBook,
          priceToCashflow,
          priceToEarnings,
          priceToSales,
          threeYearEarningsGrowth: equity?.threeYearEarningsGrowth
        });
        const size = morningstarCell?.size ?? estimated.size;
        const style = morningstarCell?.style ?? estimated.style;
        const sizeStyleSource: AssetStyleBox['sizeStyleSource'] | undefined =
          morningstarCell
            ? 'MORNINGSTAR'
            : size || style
              ? 'ESTIMATED'
              : undefined;

        styleBox = {
          bondPct: this.toPct(top?.bondPosition),
          cashPct: this.toPct(top?.cashPosition),
          category:
            summary?.fundProfile?.categoryName ??
            summary?.defaultKeyStatistics?.category ??
            undefined,
          expenseRatioPct: yahooProfile.expenseRatioPct,
          medianMarketCap,
          morningStarRating:
            summary?.defaultKeyStatistics?.morningStarOverallRating ??
            undefined,
          otherPct: this.toPct(top?.otherPosition),
          priceToBook,
          priceToCashflow,
          priceToEarnings,
          priceToSales,
          size,
          sizeStyleSource,
          stockPct: this.toPct(top?.stockPosition),
          style,
          threeYearEarningsGrowth: equity?.threeYearEarningsGrowth
        };
      }
    } catch (error) {
      this.logger.warn(`Style box fetch failed for ${symbol}: ${error}`);
    }

    try {
      await this.redisCacheService.set(
        cacheKey,
        styleBox ? JSON.stringify(styleBox) : STYLE_BOX_NONE,
        STYLE_BOX_CACHE_TTL
      );
    } catch {
      // best-effort cache
    }

    return styleBox;
  }

  /**
   * v3: v2 cached a transient failure for the full 24h TTL — bumped so those
   * stale negative-cache entries are never served, and split into a short
   * negative TTL going forward (see `getYahooEtfProfile`).
   */
  private getYahooEtfProfileCacheKey(symbol: string) {
    return `yahoo-etf-profile:v3:${symbol}`;
  }

  /**
   * The cached half of `getYahooEtfProfile`, with NO network fetch: returns
   * the cached profile, `{}` for a cached "nothing here", or `undefined` on a
   * cache miss.
   *
   * This exists so a caller working over a whole watchlist can render
   * immediately from whatever is already cached and refill the misses in the
   * background, instead of blocking its response on Yahoo. `getYahooEtfProfile`
   * fetches with a 15s timeout plus a retry, so a single cold symbol can hold
   * a request open for ~31s — unacceptable on a page load for a number as
   * slow-moving as an annual expense ratio.
   */
  public async peekYahooEtfProfile(symbol: string): Promise<
    | {
        cell?: { size: AssetStyleBox['size']; style: AssetStyleBox['style'] };
        expenseRatioPct?: number;
      }
    | undefined
  > {
    try {
      const cached = await this.redisCacheService.get(
        this.getYahooEtfProfileCacheKey(symbol)
      );

      if (cached === STYLE_BOX_NONE) {
        return {};
      }

      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // ignore cache read errors — treated as a miss
    }

    return undefined;
  }

  /**
   * Fetches the REAL Morningstar Style Box classification AND the real
   * annual expense ratio ("Annual Report Expense Ratio (net)") straight from
   * Yahoo Finance's own public Profile page — ONE fetch serves both, since
   * they live in the same HTML response (`getStyleBox` and the watchlist fee
   * resolution in `SignalsService` both call this). A plain HTTP GET works
   * reliably (confirmed live; no headless browser needed), same approach
   * already used for Nordnet fund pages elsewhere in this codebase, PROVIDED
   * two things: (1) the request carries a full realistic browser header set
   * (a bare User-Agent alone gets rejected by Yahoo's bot detection with a
   * JS-challenge 404); (2) it's sent via Node's classic `https` module with
   * an explicitly raised `maxHeaderSize`, NOT the global `fetch()` — Yahoo's
   * response carries a multi-KB Content-Security-Policy header that
   * overflows `fetch()`'s underlying undici parser (`UND_ERR_HEADERS_OVERFLOW`,
   * confirmed live), a limitation with no per-call fetch() workaround.
   *
   * Retries once on a failed/empty fetch — live-verified that Yahoo
   * occasionally rejects a request transiently (a burst of requests in quick
   * succession can trip rate-limiting) even with the correct headers, and a
   * single retry recovers most of those.
   *
   * An empty result has two very different causes, and they are cached
   * differently:
   *
   *  - **The fetch failed** (both attempts returned nothing, or threw) — a
   *    transient rate-limit/bot-detection blip. Cached for a SHORT TTL (1h)
   *    so it self-heals quickly instead of freezing a fund into the fallback
   *    estimate for a full day — this is exactly what happened live (VVSM.DE
   *    cached a transient failure during a testing burst, then kept showing
   *    the multi-cell estimated fallback for 24h even though a fresh fetch
   *    succeeded immediately).
   *  - **The page loaded and simply has neither data point** — a permanent
   *    fact about the symbol (an ordinary stock has no expense ratio and no
   *    Morningstar style box). Cached for the FULL 24h TTL. Treating this as
   *    a transient failure meant every such symbol was re-scraped hourly,
   *    forever, which is what turned the watchlist fee lookup into a
   *    self-renewing fetch storm.
   */
  public async getYahooEtfProfile(symbol: string): Promise<{
    cell?: { size: AssetStyleBox['size']; style: AssetStyleBox['style'] };
    expenseRatioPct?: number;
  }> {
    const cacheKey = this.getYahooEtfProfileCacheKey(symbol);
    const cached = await this.peekYahooEtfProfile(symbol);

    if (cached) {
      return cached;
    }

    let result: {
      cell?: { size: AssetStyleBox['size']; style: AssetStyleBox['style'] };
      expenseRatioPct?: number;
    } = {};
    // Distinguishes "the page loaded and has no data" (permanent, 24h) from
    // "we never got the page" (transient, 1h) — see the doc comment above.
    let fetchFailed = true;

    try {
      let html = await this.fetchYahooProfileHtml(symbol);

      if (!html) {
        // One retry — a short-lived rate-limit/transient block is common
        // enough (confirmed live) to be worth a single extra attempt.
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        html = await this.fetchYahooProfileHtml(symbol);
      }

      if (html) {
        fetchFailed = false;

        const index = parseYahooStyleBoxIndex(html);
        const cell = index != null ? styleBoxIndexToCell(index) : undefined;
        const expenseRatioPct = parseYahooExpenseRatioPct(html);

        result = { cell, expenseRatioPct };
      }
    } catch (error) {
      this.logger.warn(
        `Yahoo ETF profile fetch failed for ${symbol}: ${error}`
      );
    }

    const isEmpty = !result.cell && result.expenseRatioPct == null;

    try {
      await this.redisCacheService.set(
        cacheKey,
        isEmpty ? STYLE_BOX_NONE : JSON.stringify(result),
        // Only a failed fetch is worth retrying in an hour. A page that
        // loaded and genuinely carries no fee/style box keeps the full TTL.
        isEmpty && fetchFailed
          ? STYLE_BOX_NEGATIVE_CACHE_TTL
          : STYLE_BOX_CACHE_TTL
      );
    } catch {
      // best-effort cache
    }

    return result;
  }

  /**
   * Fetches a Yahoo Finance Profile page's raw HTML via Node's classic
   * `https` module (NOT the global `fetch()` — see `getYahooEtfProfile`'s
   * doc comment for why). 15s timeout; resolves `undefined` on any error or
   * non-200 status rather than throwing, so callers can treat "no data" and
   * "fetch failed" the same way.
   */
  private fetchYahooProfileHtml(symbol: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      const req = https.get(
        `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/profile/`,
        {
          headers: {
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': YAHOO_PROFILE_USER_AGENT
          },
          maxHeaderSize: 65536,
          timeout: 15_000
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            resolve(undefined);

            return;
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
          res.on('error', () => resolve(undefined));
        }
      );

      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(undefined));
    });
  }

  private toPct(fraction?: number): number | undefined {
    return fraction == null ? undefined : Math.round(fraction * 100 * 10) / 10;
  }

  /** Yahoo reports fund P/E, P/B, P/S and P/CF as yields (<1) — invert to real ratios. */
  private asRatio(value?: number): number | undefined {
    if (value == null || value <= 0) {
      return undefined;
    }

    return Math.round((value < 1 ? 1 / value : value) * 100) / 100;
  }
}
