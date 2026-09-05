import { AccountService } from '@ghostfolio/api/app/account/account.service';
import { ActivitiesService } from '@ghostfolio/api/app/activities/activities.service';
import { WatchlistService } from '@ghostfolio/api/app/endpoints/watchlist/watchlist.service';
import { RedisCacheService } from '@ghostfolio/api/app/redis-cache/redis-cache.service';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { ExchangeRateDataService } from '@ghostfolio/api/services/exchange-rate-data/exchange-rate-data.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { NewsSentimentService } from '@ghostfolio/api/services/news-sentiment/news-sentiment.service';
import { OllamaService } from '@ghostfolio/api/services/ollama/ollama.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { AssetDetailService } from '@ghostfolio/api/services/signals/asset-detail.service';
import { BacktestService } from '@ghostfolio/api/services/signals/backtest.service';
import { resolveBuyCalibration } from '@ghostfolio/api/services/signals/buy-calibration';
import {
  CrossSectionalService,
  FxFactorLookup,
  monthsBefore
} from '@ghostfolio/api/services/signals/cross-sectional.service';
import { ForecastService } from '@ghostfolio/api/services/signals/forecast.service';
import { FundDataService } from '@ghostfolio/api/services/signals/fund-data.service';
import {
  computeSeriesMetrics,
  DatedClose,
  FundHistoryService,
  toTradingDayCloses
} from '@ghostfolio/api/services/signals/fund-history.service';
import { FundamentalsService } from '@ghostfolio/api/services/signals/fundamentals.service';
import { IndicatorsService } from '@ghostfolio/api/services/signals/indicators.service';
import {
  LeaderScreenService,
  canHaveExpenseRatio,
  leaderAlertKey,
  selectFreshBreakouts,
  selectStoppedLots
} from '@ghostfolio/api/services/signals/leader-screen.service';
import { MarketBreadthService } from '@ghostfolio/api/services/signals/market-breadth.service';
import {
  isLeaderScreenDue,
  isMonthlyPlanDue,
  MarketRegimeService
} from '@ghostfolio/api/services/signals/market-regime.service';
import {
  Bar,
  OhlcBarService,
  refreshRangeFor
} from '@ghostfolio/api/services/signals/ohlc-bar.service';
import { OhlcService } from '@ghostfolio/api/services/signals/ohlc.service';
import {
  classifySectorTailwind,
  ScreeningService
} from '@ghostfolio/api/services/signals/screening.service';
import {
  computeLiveTrackedKeys,
  readTrackedMetrics,
  SignalTradeTrackingService
} from '@ghostfolio/api/services/signals/signal-trade-tracking.service';
import {
  buildPerformanceSeries,
  computeTrailingPriceReturns,
  normalizeBenchmarkSeries,
  ordersToTrades,
  type PerformanceSeriesTrade
} from '@ghostfolio/api/services/signals/simulation-performance';
import {
  FundCandidate,
  StrategiesService,
  StrategyCandidate
} from '@ghostfolio/api/services/signals/strategies.service';
import { TelegramBotService } from '@ghostfolio/api/services/telegram-bot/telegram-bot.service';
import {
  allCatalogCompanies,
  categoryForSymbol
} from '@ghostfolio/common/company-catalog';
import {
  DEFAULT_CURRENCY,
  PORTFOLIO_PRICE_TARGETS,
  SIGNAL_BACKTEST_POSITION_SIZE,
  SIGNAL_NORDNET_COMMISSION_CLASS,
  SIGNAL_BUY_SCORE_MIN,
  SIGNAL_DEFAULT_BUY_DROP_PCT,
  SIGNAL_DEFAULT_CASH_THRESHOLD,
  SIGNAL_DEFAULT_TAKE_PROFIT_PCT,
  SIGNAL_FORECAST_HORIZON_DAYS,
  SIGNAL_HISTORY_FETCH_DAYS,
  SIGNAL_HORIZON_DAYS,
  SIGNAL_LEADER_ALERT_COOLDOWN_DAYS,
  SIGNAL_LEADER_STOP_PCT,
  SIGNAL_WATCHLIST_METRICS_CACHE_TTL,
  SIGNAL_OHLC_REFRESH_CONCURRENCY,
  SIGNAL_YAHOO_FEE_REFILL_CONCURRENCY,
  SIGNAL_RS_RANK_CACHE_KEY,
  SIGNAL_RS_RANK_CACHE_TTL,
  SIGNAL_INDEX_RATIO,
  SIGNAL_NEWS_BUY_FLOOR,
  SIGNAL_NOTIFICATION_COOLDOWN,
  SIGNAL_RECENT_SIGNAL_WINDOW,
  SIGNAL_EXIT_MODE,
  SIGNAL_FUND_RECOMMENDATION_COUNT,
  SIGNAL_MONTHLY_CONTRIBUTION_USD,
  SIGNAL_HOLD_TRAIL_PCT,
  SIGNAL_PORTFOLIO_FUNDS_RATIO,
  SIGNAL_REVERSAL_RSI_MAX,
  SIGNAL_REVERSAL_VOLUME_RATIO,
  SIGNAL_SEK_PER_USD_FALLBACK,
  SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD,
  SIGNAL_SCREEN_MIN_DOLLAR_VOLUME,
  SIGNAL_STOP_VOL_MULT,
  SIGNAL_SHORTLIST_MAX,
  SIGNAL_STRATEGY_CASH_DELTA,
  SIGNAL_STRATEGY_MIN_CASH,
  SIGNAL_TAG_PROVENANCE_BET,
  SIGNAL_TAG_PROVENANCE_DIP,
  SIGNAL_TAG_PROVENANCE_LEADER,
  SIGNAL_TAKE_PROFIT_FLOOR_PCT,
  SIGNAL_TAKE_PROFIT_VOL_MULT,
  SIGNAL_TYPE_UNTAGGED,
  SIGNAL_TRAIL_VOL_MULT,
  SIGNAL_TREND_TEMPLATE_PREFERRED_RS,
  SIGNAL_TT8_ALERT_MIN_RS,
  SIGNAL_TT8_COOLDOWN_DAYS,
  SignalExitMode
} from '@ghostfolio/common/config';
import { terPctForSymbol } from '@ghostfolio/common/etf-ter-catalog';
import {
  FUND_CATALOG,
  fundCategoryForSymbol,
  fundFeeForSymbol,
  isFundSymbol
} from '@ghostfolio/common/fund-catalog';
import { DATE_FORMAT } from '@ghostfolio/common/helper';
import { allIndexConstituents } from '@ghostfolio/common/index-constituents';
import {
  BacktestAllResponse,
  FundMetric,
  FundMetricsResponse,
  FundRecommendationResponse,
  InvestmentStrategiesResponse,
  LineChartItem,
  LeaderCandidate,
  LeaderCandidatesResponse,
  ShortlistEntry,
  ShortlistResponse,
  PortfolioReport,
  RsRankPublication,
  SignalLogResponse,
  SimulatedTrade,
  SimulationReadoutPeriod,
  SimulationResponse,
  SignalExitMarker,
  SimulationSummary,
  TrackedPosition,
  TradingSignal,
  TradingSignalsResponse,
  UserSettings,
  WatchlistMetric
} from '@ghostfolio/common/interfaces';
import {
  isNordicSymbol,
  nordnetCommissionUsd,
  nordnetRoundTripUsd
} from '@ghostfolio/common/nordnet-fees';
import { peerGroupFor, primarySector } from '@ghostfolio/common/sectors';
import { researchLinks } from '@ghostfolio/common/symbol-links';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AssetSubClass,
  DataSource,
  Prisma,
  Type as ActivityType
} from '@prisma/client';
import { differenceInCalendarDays, format, subDays } from 'date-fns';

/** Raw per-symbol SignalConfig row values (before asset-type calibration). */
interface StoredSignalConfig {
  buyDropPct: number;
  cashThreshold: number | null;
  isActiveTrade: boolean;
  takeProfitPct: number;
}

interface SignalConfigResolved {
  buyDropPct: number;
  buySigmaMult: number;
  cashThreshold: number | null;
  isActiveTrade: boolean;
  takeProfitPct: number;
}

interface UniverseItem {
  assetSubClass: AssetSubClass | null;
  averageBuyPrice: number | null;
  currency: string;
  dataSource: DataSource;
  name: string;
  owned: boolean;
  quantity: number;
  symbol: string;
}

interface SignalsComputation {
  baseCurrency: string;
  cashBalance: number;
  // Owned-position values (base currency), split for 60/40 rebalancing.
  fundsValue: number;
  stocksValue: number;
  // Owned fund value per category + every fund in the universe (for picks).
  fundCandidates: FundCandidate[];
  fundValueByCategory: Record<string, number>;
  // Owned fund value per symbol — the dollar-weighted input to the graduated
  // fund-overlap penalty in recommendFunds (real per-fund, not just category).
  fundValueBySymbol: Record<string, number>;
  // Every buyable stock with ranking metrics (full-universe, for strategies).
  stockCandidates: StrategyCandidate[];
  response: TradingSignalsResponse;
  // Next take-profit-trailing peak per "DATASOURCE:SYMBOL" key. A non-null value
  // means the position is trailing; null means watching / reset. Persisted by
  // the notify path so the exit state machine advances across runs.
  trailingByKey: Map<string, number | null>;
  // Keys that just transitioned WATCHING -> TRAILING this run (target reached).
  enteredTrailing: TradingSignal[];
  // Live price per symbol from this cycle's already-fetched quotes — reused by
  // SignalTradeTrackingService.checkTrackedTradesAndAlert to avoid a second fetch.
  livePriceBySymbol: Map<string, number>;
}

// Per-position exit evaluation: the signal to surface plus the next trailing peak.
interface SymbolEvaluation {
  // Buyable-stock metrics for expected-value ranking (every YAHOO stock, regardless
  // of whether a BUY/HOLD signal surfaces).
  candidate?: StrategyCandidate;
  enteredTrailing: boolean;
  nextTrailingPeak: number | null;
  signal: TradingSignal | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const average = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

// Property-store key: 'YYYY-MM' of the last sent monthly (25th) plan.
const PROPERTY_MONTHLY_PLAN_LAST_SENT = 'SIGNAL_MONTHLY_PLAN_LAST_SENT';
const PROPERTY_OHLC_REFRESH_LAST_RUN = 'SIGNAL_OHLC_REFRESH_LAST_RUN';
const PROPERTY_TT8_BASELINE_SEEDED = 'SIGNAL_TT8_BASELINE_SEEDED';
// 22:05 CET: both the European (~17:30) and US (22:00) closes have settled, and
// the leader screen at 22:30 gets bars gathered the same evening.
const OHLC_REFRESH_SLOT_HOUR = 22;
const OHLC_REFRESH_SLOT_MINUTE = 5;
/**
 * The one symbol whose bars are a known defect rather than data: a mutual fund
 * carrying OhlcBar rows with 100% zero volume, which makes both VCP volume
 * tests meaningless. `run-universe-cleanup.cjs` removes them; the gather must
 * not put them back.
 */
const OHLC_REFRESH_SKIP_SYMBOLS = new Set(['0P000134K9.F']);
const PROPERTY_LEADER_SCREEN_LAST_RUN = 'SIGNAL_LEADER_SCREEN_LAST_RUN';
const PROPERTY_SHORTLIST_LAST_RUN = 'SIGNAL_SHORTLIST_LAST_RUN';
const PROPERTY_TT8_ENTRANTS_LAST_RUN = 'SIGNAL_TT8_ENTRANTS_LAST_RUN';

/**
 * signalTypes that FIFO-match in their own queue and stay out of the headline
 * DIP/REVERSAL aggregates.
 *
 * All of these trade the same watchlist, so a shared queue would let one
 * strategy's exit close another's entry and report the pair under the buy
 * leg's label. Keeping DIP/REVERSAL on the original key leaves their historical
 * matching byte-for-byte unchanged.
 */
const ISOLATED_SIGNAL_TYPES = new Set(['LEADER', 'LEADER_GATED', 'TT8']);

/**
 * Every signalType a SignalLog BUY row may legitimately carry.
 *
 * Two vocabularies share this column and both are valid. The engine emits DIP /
 * REVERSAL / LEADER / LEADER_GATED / TT8 — those describe a SIGNAL. The tracker
 * writes BET / DIP / LEADER from an order's provenance tag — those describe a
 * POSITION. UNTAGGED means a real position exists and nobody has said where it
 * came from.
 */
const KNOWN_SIGNAL_TYPES = new Set([
  'BET',
  'DIP',
  'LEADER',
  'LEADER_GATED',
  'REVERSAL',
  'TT8',
  'UNTAGGED'
]);

/** Tracked statuses that mean the engine has told the user to get out. */
const EXITED_TRACKED_STATUSES = new Set(['STOP_HIT', 'TRAILING_EXIT']);

/**
 * Where a signal has got to, as four distinct facts.
 *
 * The engine recommending a sale and the user making one are different events,
 * and the previous two-state model (`sellRow ? 'CLOSED' : 'OPEN'`) could not
 * tell them apart. AMZN is the case that proves it: an exit was signalled on
 * 2026-08-03 and the position is still held, which is neither "open" nor "sold".
 *
 * The ladder runs downward — a sale outranks an exit signal, which outranks a
 * purchase — because each state implies the ones before it.
 */
export function resolveTradeStatus({
  exitSignalled,
  purchased,
  sold
}: {
  /** The engine sent a stop or trailing exit alert. */
  exitSignalled: boolean;
  /** A real BUY order is linked to this signal. */
  purchased: boolean;
  /** A real SELL order exists — whether or not any signal asked for it. */
  sold: boolean;
}): SimulatedTrade['status'] {
  if (sold) {
    return 'SOLD';
  }

  if (exitSignalled) {
    return 'CLOSED';
  }

  return purchased ? 'BOUGHT' : 'OPEN';
}

/**
 * signalTypes that get their own category chip in the Analytics log rather
 * than being lumped under the raw category ('BUY').
 */
const BUCKETED_SIGNAL_TYPES = new Set([
  'LEADER',
  'LEADER_GATED',
  'REVERSAL',
  'TT8'
]);
// Must mirror CronService.EVERY_WEEKDAY_AFTER_US_CLOSE ('30 22 * * 1-5') plus
// the 10-minute queue delay TradingSignalsService.addLeaderScreenToQueue adds,
// so the boot catch-up and the cron agree on what "today's run" means.
const LEADER_SCREEN_SLOT_HOUR = 22;
const LEADER_SCREEN_SLOT_MINUTE = 40;

@Injectable()
export class SignalsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SignalsService.name);
  // Symbols whose Yahoo expense-ratio fetch is already running in the
  // background, so overlapping watchlist refreshes do not stack duplicate
  // scrapes of the same symbol (see `refillYahooFeeCache`).
  private readonly yahooFeeRefillInFlight = new Set<string>();
  // Short-lived per-user memo of the watchlist metrics snapshot, keyed by user
  // id. See SIGNAL_WATCHLIST_METRICS_CACHE_TTL.
  //
  // Holds the PROMISE rather than the resolved value so that callers arriving
  // during a cold rebuild join the one in flight instead of each starting
  // their own. A snapshot spans ~930 symbols and allocates several hundred MB,
  // so two concurrent rebuilds are not merely wasteful — they are how a burst
  // of requests turned into an unresponsive server.
  private readonly watchlistMetricsCache = new Map<
    string,
    { expiresAt: number; value: Promise<Record<string, WatchlistMetric>> }
  >();

  public constructor(
    private readonly accountService: AccountService,
    private readonly activitiesService: ActivitiesService,
    private readonly assetDetailService: AssetDetailService,
    private readonly backtestService: BacktestService,
    private readonly dataProviderService: DataProviderService,
    private readonly exchangeRateDataService: ExchangeRateDataService,
    private readonly forecastService: ForecastService,
    private readonly fundamentalsService: FundamentalsService,
    private readonly fundDataService: FundDataService,
    private readonly fundHistoryService: FundHistoryService,
    private readonly indicatorsService: IndicatorsService,
    private readonly marketDataService: MarketDataService,
    private readonly crossSectionalService: CrossSectionalService,
    private readonly leaderScreenService: LeaderScreenService,
    private readonly marketBreadthService: MarketBreadthService,
    private readonly marketRegimeService: MarketRegimeService,
    private readonly ohlcBarService: OhlcBarService,
    private readonly newsSentimentService: NewsSentimentService,
    private readonly ohlcService: OhlcService,
    private readonly ollamaService: OllamaService,
    private readonly prismaService: PrismaService,
    private readonly propertyService: PropertyService,
    private readonly redisCacheService: RedisCacheService,
    private readonly screeningService: ScreeningService,
    private readonly signalTradeTrackingService: SignalTradeTrackingService,
    private readonly strategiesService: StrategiesService,
    private readonly telegramBotService: TelegramBotService,
    private readonly watchlistService: WatchlistService
  ) {}

  /**
   * Adds every company in the curated catalog to the user's watchlist so the
   * signal engine scores them. createWatchlistItem also creates the asset
   * profile and gathers history, so new symbols become evaluable after this.
   * Resilient per symbol: an unknown/unsupported ticker is recorded as failed,
   * never aborting the rest of the import.
   */
  public async importCatalog(userId: string): Promise<{
    added: string[];
    failed: { reason: string; symbol: string }[];
  }> {
    const added: string[] = [];
    const failed: { reason: string; symbol: string }[] = [];

    // The curated catalog carries an explicit dataSource per company; index
    // constituents are all YAHOO listings. De-duplicated so a name that is both
    // curated and an index member is imported once.
    const symbols = new Map<string, DataSource>();

    for (const { dataSource, symbol } of allCatalogCompanies()) {
      symbols.set(symbol, DataSource[dataSource]);
    }

    for (const symbol of allIndexConstituents()) {
      if (!symbols.has(symbol)) {
        symbols.set(symbol, DataSource.YAHOO);
      }
    }

    for (const [symbol, dataSource] of symbols) {
      try {
        await this.watchlistService.createWatchlistItem({
          dataSource,
          symbol,
          userId
        });
        added.push(symbol);
      } catch (error) {
        failed.push({ reason: `${error?.message ?? error}`, symbol });
      }
    }

    this.logger.log(
      `Catalog import for user ${userId}: ${added.length} added, ${failed.length} failed`
    );

    return { added, failed };
  }

  /**
   * Imports the curated fund catalog: each fund becomes a MANUAL asset whose
   * NAV is scraped from Avanza's public JSON, added to the watchlist, and (for
   * held funds) recorded as a position. Resilient per fund.
   */
  public async importFunds(userId: string): Promise<{
    failed: { reason: string; symbol: string }[];
    heldRecorded: string[];
    priced: string[];
  }> {
    const failed: { reason: string; symbol: string }[] = [];
    const heldRecorded: string[] = [];
    const priced: string[] = [];

    const account = await this.prismaService.account.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      where: { userId }
    });

    for (const fund of FUND_CATALOG) {
      try {
        // Nordnet-direct takes priority when known: precise (no fuzzy name
        // search) and covers Nordnet's own funds Avanza can't list. Only fall
        // back to an Avanza search, then a static seed, when it isn't set.
        const orderbookId = fund.nordnetUrl
          ? null
          : await this.fundDataService.resolveOrderbookId({
              isin: fund.isin,
              name: fund.name
            });

        const scraperConfiguration = fund.nordnetUrl
          ? this.fundDataService.buildNordnetScraperConfiguration(
              fund.nordnetUrl
            )
          : orderbookId
            ? this.fundDataService.buildScraperConfiguration(orderbookId)
            : fund.seedNav
              ? this.fundDataService.buildSeedScraperConfiguration(fund.seedNav)
              : null;

        if (!scraperConfiguration) {
          failed.push({
            reason: 'could not resolve on Avanza and no seed NAV',
            symbol: fund.symbol
          });

          continue;
        }

        const existing = await this.prismaService.symbolProfile.findUnique({
          where: {
            dataSource_symbol: {
              dataSource: DataSource.MANUAL,
              symbol: fund.symbol
            }
          }
        });

        let profileId: string;

        if (existing) {
          await this.prismaService.symbolProfile.update({
            data: {
              currency: fund.currency,
              isin: fund.isin,
              name: fund.name,
              scraperConfiguration:
                scraperConfiguration as unknown as Prisma.InputJsonValue
            },
            where: { id: existing.id }
          });
          profileId = existing.id;
        } else {
          const created = await this.prismaService.symbolProfile.create({
            data: {
              currency: fund.currency,
              dataSource: DataSource.MANUAL,
              isin: fund.isin,
              name: fund.name,
              scraperConfiguration:
                scraperConfiguration as unknown as Prisma.InputJsonValue,
              symbol: fund.symbol
            }
          });
          profileId = created.id;
        }

        // Profile now exists → add to watchlist (gathers NAV + connects).
        await this.watchlistService.createWatchlistItem({
          dataSource: DataSource.MANUAL,
          symbol: fund.symbol,
          userId
        });
        priced.push(fund.symbol);

        // Record the held position once (idempotent). Created directly via
        // Prisma so it links to THIS named profile — createActivity would
        // reassign MANUAL symbols to a random UUID (its custom-asset flow).
        if (fund.held && account) {
          const hasOrder = await this.prismaService.order.findFirst({
            where: { symbolProfileId: profileId, userId }
          });

          if (!hasOrder) {
            await this.prismaService.order.create({
              data: {
                account: {
                  connect: { id_userId: { id: account.id, userId } }
                },
                currency: fund.currency,
                date: new Date(),
                fee: 0,
                quantity: fund.held.quantity,
                SymbolProfile: { connect: { id: profileId } },
                type: ActivityType.BUY,
                unitPrice: fund.held.avgPrice,
                user: { connect: { id: userId } }
              }
            });
            heldRecorded.push(fund.symbol);
          }
        }
      } catch (error) {
        failed.push({
          reason: `${error?.message ?? error}`,
          symbol: fund.symbol
        });
      }
    }

    this.logger.log(
      `Fund import for user ${userId}: ${priced.length} priced, ${heldRecorded.length} holdings recorded, ${failed.length} failed`
    );

    return { failed, heldRecorded, priced };
  }

  /**
   * Backtests every YAHOO name in the universe and ranks them by edge over
   * buy-and-hold — the honest test of whether *trading* beats *holding*. Funds
   * (MANUAL) are excluded (no price history / not the strategy's domain).
   */
  public async backtestAll(
    userId: string,
    exitMode?: SignalExitMode
  ): Promise<BacktestAllResponse> {
    const baseCurrency = await this.getUserCurrency(userId);
    const universe = await this.getUniverse(userId, baseCurrency);
    const symbols = universe.filter(
      (entry) => entry.dataSource === DataSource.YAHOO
    );

    const rows: BacktestAllResponse['rows'] = [];

    for (const entry of symbols) {
      try {
        // Same asset-type calibration the live engine uses (ETFs get the
        // shallower dip floor / narrower sigma band).
        const { buyDropPct, buySigmaMult } = resolveBuyCalibration({
          assetSubClass: entry.assetSubClass
        });

        const result = await this.backtestService.backtest({
          buyDropPct,
          buySigmaMult,
          dataSource: DataSource.YAHOO,
          exitMode,
          symbol: entry.symbol
        });

        // Skip names with too little history to mean anything.
        if (result.tradingDays < 60) {
          continue;
        }

        rows.push({
          benchmarkPct: round2(result.benchmarkReturnPct),
          edgePct: round2(result.totalNetReturnPct - result.benchmarkReturnPct),
          maxDrawdownPct: round2(result.maxDrawdownPct),
          name: entry.name,
          netPct: round2(result.totalNetReturnPct),
          oosSharpe: round2(result.outOfSample.sharpe),
          sharpe: round2(result.sharpe),
          symbol: entry.symbol,
          trades: result.trades.length,
          winRate: round2(result.winRate * 100)
        });
      } catch (error) {
        this.logger.warn(`Backtest failed for ${entry.symbol}: ${error}`);
      }
    }

    rows.sort((a, b) => b.edgePct - a.edgePct);

    const edges = rows.map((r) => r.edgePct).sort((a, b) => a - b);
    const median = edges.length > 0 ? edges[Math.floor(edges.length / 2)] : 0;

    return {
      rows,
      summary: {
        avgEdgePct:
          rows.length > 0
            ? round2(edges.reduce((s, e) => s + e, 0) / rows.length)
            : 0,
        beatBenchmark: rows.filter((r) => r.edgePct > 0).length,
        evaluated: rows.length,
        medianEdgePct: round2(median)
      }
    };
  }

  /**
   * Computes budget-allocation strategies on demand (read-only): current buy
   * candidates ranked by score, sized to the available cash. All numbers are
   * produced deterministically by StrategiesService.
   */
  public async computeStrategies(
    userId: string,
    assumedCash?: number
  ): Promise<InvestmentStrategiesResponse> {
    const computation = await this.computeSignalsInternal(userId);

    return this.buildStrategiesResponse(computation, userId, assumedCash);
  }

  /** Computes strategies and pushes them to Telegram (on demand). */
  public async sendStrategies(userId: string): Promise<void> {
    const response = await this.computeStrategies(userId);

    await this.deliverStrategies(response);
  }

  public onApplicationBootstrap() {
    // Monthly-plan catch-up: if the machine was off on the 25th, send the
    // plan on the next start instead of silently skipping the month.
    setTimeout(() => {
      this.sendMonthlyPlanIfDue().catch((error) => {
        this.logger.error(`Monthly-plan boot catch-up failed: ${error}`);
      });
    }, 90_000);

    // The screens all read OhlcBar, so the gather has to finish before any of
    // them run. Sequenced rather than staggered on timers: the gather takes
    // minutes over the full universe, so a timer race would hand the screens
    // stale bars on exactly the boots where the catch-up matters most.
    setTimeout(() => {
      void this.runBootCatchUps();
    }, 120_000);
  }

  /**
   * Boot catch-up chain, in dependency order.
   *
   * `@nestjs/schedule` crons do not catch up, so a laptop asleep at 22:05 loses
   * the gather outright — and with it every screen that reads the bars. Each
   * step is isolated: one failure must not cancel the ones after it.
   */
  private async runBootCatchUps(): Promise<void> {
    const steps: [string, () => Promise<unknown>][] = [
      ['OHLC refresh', () => this.refreshOhlcBarsIfDue()],
      ['Leader screen', () => this.sendLeaderScreenIfDue()],
      ['Shortlist', () => this.sendShortlistIfDue()],
      ['Trend Template entrants', () => this.sendTrendTemplateEntrantsIfDue()]
    ];

    for (const [label, run] of steps) {
      try {
        await run();
      } catch (error) {
        this.logger.error(`${label} boot catch-up failed: ${error}`);
      }
    }
  }

  /**
   * Runs the leader screen if the most recent weekday slot has passed without
   * one. Returns how many breakouts were alerted across all users.
   */
  public async sendLeaderScreenIfDue(): Promise<number> {
    const now = new Date();
    const lastRunAt = await this.propertyService.getByKey<string>(
      PROPERTY_LEADER_SCREEN_LAST_RUN
    );

    if (
      !isLeaderScreenDue({
        hour: LEADER_SCREEN_SLOT_HOUR,
        lastRunAt,
        minute: LEADER_SCREEN_SLOT_MINUTE,
        now
      })
    ) {
      return 0;
    }

    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    let sent = 0;

    for (const { id } of users) {
      try {
        sent += await this.sendLeaderCandidates(id);
      } catch (error) {
        this.logger.error(`Leader screen failed for user ${id}`, error);
      }
    }

    // Recorded even when nothing was sent: the run happened, and a screen that
    // found no breakout must not re-run on every restart.
    await this.propertyService.put({
      key: PROPERTY_LEADER_SCREEN_LAST_RUN,
      value: JSON.stringify(now.toISOString())
    });

    this.logger.log(
      `Leader screen catch-up complete - ${sent} breakout(s) alerted`
    );

    return sent;
  }

  /**
   * Appends the newest daily bars for the whole YAHOO universe.
   *
   * Why this exists: `OhlcBar` had no writer inside the application at all. It
   * was filled once by `run-ohlc-backfill.cjs`, which skips any symbol that
   * already holds enough rows — so the table stopped advancing the day the
   * backfill finished, and the Trend Template, the VCP detector, ATR and the
   * cross-sectional RS percentile all silently kept reading that day's market.
   * `MarketData` stayed current the whole time, which is what made the staleness
   * so easy to miss: prices and scores moved, the leader-screen columns did not.
   *
   * Incremental by design — `getLatestDates` is one query and gives the gap per
   * symbol, so an ordinary night asks Yahoo for a 1-month range to collect one
   * missing session rather than refetching five years. Returns the number of
   * bars actually written.
   */
  public async refreshOhlcBars(): Promise<number> {
    const profiles = await this.prismaService.symbolProfile.findMany({
      orderBy: { symbol: 'asc' },
      select: { symbol: true },
      where: { dataSource: DataSource.YAHOO }
    });

    const latestDates = await this.ohlcBarService.getLatestDates(
      DataSource.YAHOO
    );
    const now = new Date();

    const queue = profiles
      .map(({ symbol }) => symbol)
      .filter((symbol) => !OHLC_REFRESH_SKIP_SYMBOLS.has(symbol));

    let written = 0;
    let failed = 0;

    // A worker pool rather than a Promise.all, for the reason given on
    // SIGNAL_OHLC_REFRESH_CONCURRENCY: a ~900-wide burst is the surest way to
    // get the whole run rate-limited.
    const worker = async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();

        if (!symbol) {
          return;
        }

        try {
          const bars = await this.ohlcService.getDatedBars(
            symbol,
            refreshRangeFor({ latestDate: latestDates[symbol], now })
          );

          if (!bars?.length) {
            failed++;
            continue;
          }

          // skipDuplicates against the (dataSource, date, symbol) unique index,
          // so the overlap an over-wide range produces costs nothing.
          written += await this.ohlcBarService.upsertMany({
            bars,
            dataSource: DataSource.YAHOO,
            symbol
          });
        } catch (error) {
          // One unreachable symbol must never abort the gather for the rest.
          failed++;
          this.logger.warn(`OHLC refresh failed for ${symbol}: ${error}`);
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(SIGNAL_OHLC_REFRESH_CONCURRENCY, queue.length) },
        () => worker()
      )
    );

    this.logger.log(
      `OHLC refresh complete - ${written} bar(s) written across ` +
        `${profiles.length} symbol(s), ${failed} without data`
    );

    return written;
  }

  /**
   * Runs the gather if the most recent weekday slot has passed without one.
   *
   * The catch-up matters more here than anywhere else: this runs at 22:05 on a
   * machine that is not always on at 22:05, and a missed night is not a missed
   * notification but a permanent hole in the bar history that nothing else
   * fills.
   */
  public async refreshOhlcBarsIfDue(): Promise<number> {
    const now = new Date();
    const lastRunAt = await this.propertyService.getByKey<string>(
      PROPERTY_OHLC_REFRESH_LAST_RUN
    );

    // Same generic "has the most recent weekday slot passed" test the leader
    // screen uses, parameterised to this slot.
    if (
      !isLeaderScreenDue({
        hour: OHLC_REFRESH_SLOT_HOUR,
        lastRunAt,
        minute: OHLC_REFRESH_SLOT_MINUTE,
        now
      })
    ) {
      return 0;
    }

    const written = await this.refreshOhlcBars();

    await this.propertyService.put({
      key: PROPERTY_OHLC_REFRESH_LAST_RUN,
      value: JSON.stringify(now.toISOString())
    });

    return written;
  }

  // The ~750 USD monthly contribution lands around the 25th — deliver the
  // full plan then, without waiting for the deposit to be logged.
  @Cron('0 9 25 * *')
  public async runMonthlyPlanCron() {
    try {
      await this.sendMonthlyPlanIfDue();
    } catch (error) {
      this.logger.error(`Monthly-plan cron failed: ${error}`);
    }
  }

  /** Sends the monthly plan when due (>= 25th, not yet sent this month). */
  public async sendMonthlyPlanIfDue(): Promise<boolean> {
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');
    const lastSentMonth = await this.propertyService.getByKey<string>(
      PROPERTY_MONTHLY_PLAN_LAST_SENT
    );

    if (
      !isMonthlyPlanDue({
        currentMonth,
        dayOfMonth: now.getDate(),
        lastSentMonth
      })
    ) {
      return false;
    }

    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    for (const { id } of users) {
      try {
        await this.sendMonthlyPlan(id);
      } catch (error) {
        this.logger.error(`Monthly plan failed for user ${id}`, error);
      }
    }

    await this.propertyService.put({
      key: PROPERTY_MONTHLY_PLAN_LAST_SENT,
      value: JSON.stringify(currentMonth)
    });

    this.logger.log(`Monthly plan sent (${currentMonth})`);

    return true;
  }

  /**
   * The 25th-of-month plan: assumes the expected monthly contribution when
   * the deposit has not been logged yet (a real, higher balance wins), and
   * says so explicitly in the header.
   */
  private async sendMonthlyPlan(userId: string): Promise<void> {
    const computation = await this.computeSignalsInternal(userId);
    const assumed = computation.cashBalance < SIGNAL_MONTHLY_CONTRIBUTION_USD;

    const response = await this.buildStrategiesResponse(
      computation,
      userId,
      SIGNAL_MONTHLY_CONTRIBUTION_USD
    );

    const header = assumed
      ? `📅 *Monthly plan (25th)* — assuming your ${SIGNAL_MONTHLY_CONTRIBUTION_USD} USD deposit (log it to refine)`
      : `📅 *Monthly plan (25th)*`;

    await this.deliverStrategies(response, header);
  }

  /**
   * Weekly fund recommendation: which diversified funds to buy for monthly
   * accumulation (under-weight category first, lower fee). Deterministic.
   */
  public async computeFundRecommendations(
    userId: string
  ): Promise<FundRecommendationResponse> {
    const [
      { baseCurrency, fundCandidates, fundValueByCategory, fundValueBySymbol },
      metrics,
      facts
    ] = await Promise.all([
      this.computeSignalsInternal(userId),
      this.getFundMetrics(userId),
      this.fundHistoryService.getFacts()
    ]);

    // Enrich candidates with real performance metrics so the per-category
    // pick is data-driven (risk-adjusted momentum), not fee-only.
    const metricsBySymbol = new Map(
      metrics.funds.map((fund) => [fund.symbol, fund])
    );

    const funds = this.strategiesService.recommendFunds({
      candidates: fundCandidates.map((candidate) => {
        const metric = metricsBySymbol.get(candidate.symbol);

        return {
          ...candidate,
          annualVolPct: metric?.annualVolPct,
          rating: metric?.rating,
          return6mPct: metric?.return6mPct,
          riskAdjustedMomentum: metric?.riskAdjustedMomentum
        };
      }),
      count: SIGNAL_FUND_RECOMMENDATION_COUNT,
      holdingsBySymbol: this.buildFundHoldingsBySymbol(facts),
      valueByCategory: fundValueByCategory,
      valueBySymbol: fundValueBySymbol
    });

    return {
      baseCurrency,
      generatedAt: new Date().toISOString(),
      picks: funds.map((fund) => ({ ...fund, amount: 0 }))
    };
  }

  /**
   * Fund holdings keyed by symbol, from cached FundFacts — the input
   * `recommendFunds` needs for its real per-fund overlap penalty (as opposed
   * to the coarser category-label check). Reused at every recommendFunds call
   * site rather than re-deriving inline.
   */
  private buildFundHoldingsBySymbol(
    facts: Record<string, { topHoldings?: { name: string; weight: number }[] }>
  ): Record<string, { name: string; weight: number }[]> {
    const result: Record<string, { name: string; weight: number }[]> = {};

    for (const [symbol, fact] of Object.entries(facts)) {
      if (fact.topHoldings?.length) {
        result[symbol] = fact.topHoldings;
      }
    }

    return result;
  }

  /**
   * Per-fund analytics for the 60% fund sleeve, computed from our own
   * accumulated NAV history and enriched with cached Avanza fund-guide facts
   * (rating, Sharpe, AUM, exposure). Ranked by risk-adjusted momentum
   * (6-month return / annualized volatility) so "interesting funds" surface
   * on data, not vibes. Falls back to Avanza's own period developments while
   * a fund's local history is still too short.
   */
  public async getFundMetrics(userId: string): Promise<FundMetricsResponse> {
    const watchlist = await this.getWatchlist(userId);
    const funds = watchlist.filter(
      ({ dataSource, symbol }) =>
        dataSource === DataSource.MANUAL || isFundSymbol(symbol)
    );

    const [historyBySymbol, facts] = await Promise.all([
      this.getHistory(funds),
      this.fundHistoryService.getFacts()
    ]);

    const round2 = (value: number | null | undefined) =>
      value == null ? undefined : Math.round(value * 100) / 100;

    const result: FundMetric[] = funds.map((fund) => {
      const closes = historyBySymbol[fund.symbol] ?? [];
      const series = computeSeriesMetrics(closes);
      const fundFacts = facts[fund.symbol];

      // Prefer Nordnet's official published period returns (complete and
      // authoritative); use our accumulated-history calc as a fallback.
      const return6mPct =
        round2(fundFacts?.developments?.sixMonths) ?? series.return6mPct;
      const annualVolPct =
        round2(fundFacts?.standardDeviation) ?? series.annualVolPct;

      const riskAdjustedMomentum =
        return6mPct != null && annualVolPct != null && annualVolPct > 0
          ? Math.round((return6mPct / annualVolPct) * 100) / 100
          : undefined;

      return {
        annualVolPct: annualVolPct ?? undefined,
        aum: fundFacts?.aum,
        category: fundCategoryForSymbol(fund.symbol) ?? 'global',
        currency: fund.currency,
        daysOfHistory: closes.length,
        feePct:
          fundFeeForSymbol(fund.symbol) ??
          fundFacts?.feePct ??
          fundFacts?.productFeePct ??
          0,
        maxDrawdownPct: series.maxDrawdownPct ?? undefined,
        name: fund.name,
        nav: closes[closes.length - 1]?.close,
        owners: fundFacts?.owners,
        rating: fundFacts?.rating,
        return1mPct:
          round2(fundFacts?.developments?.oneMonth) ?? series.return1mPct,
        return1yPct:
          round2(fundFacts?.developments?.oneYear) ?? series.return1yPct,
        return3mPct:
          round2(fundFacts?.developments?.threeMonths) ?? series.return3mPct,
        return6mPct: return6mPct ?? undefined,
        riskAdjustedMomentum,
        sharpeRatio: fundFacts?.sharpeRatio,
        symbol: fund.symbol,
        topHoldings: fundFacts?.topHoldings
      };
    });

    // Best risk-adjusted momentum first; funds without metrics sink to the end.
    result.sort(
      (a, b) =>
        (b.riskAdjustedMomentum ?? -Infinity) -
        (a.riskAdjustedMomentum ?? -Infinity)
    );

    return { funds: result, generatedAt: new Date().toISOString() };
  }

  /** Sends the weekly fund recommendation to one user. */
  public async sendFundRecommendations(userId: string): Promise<void> {
    const response = await this.computeFundRecommendations(userId);

    if (response.picks.length === 0) {
      return;
    }

    await this.telegramBotService.sendMessage(
      this.formatFundRecommendations(response)
    );
  }

  /** Sends the weekly fund recommendation to every non-demo user (scheduled job). */
  public async sendFundRecommendationsToAllUsers(): Promise<void> {
    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    for (const { id } of users) {
      try {
        await this.sendFundRecommendations(id);
      } catch (error) {
        this.logger.error(
          `Failed to send fund recommendations for user ${id}`,
          error
        );
      }
    }
  }

  private formatFundRecommendations(
    response: FundRecommendationResponse
  ): string {
    const lines = ['📅 *Weekly funds — best to buy this month*', ''];

    for (const pick of response.picks) {
      // Transparency for the graduated overlap penalty (de-prioritize, never
      // exclude — see SIGNAL_FUND_OVERLAP_PENALTY_FLOOR): only worth a note
      // once it's a meaningful share of the sleeve, not any nonzero overlap.
      const overlapNote =
        pick.overlapExposurePct && pick.overlapExposurePct > 10
          ? ` (↓ de-prioritized: ~${Math.round(pick.overlapExposurePct)}% of your fund sleeve already overlaps this fund's holdings)`
          : '';
      lines.push(
        `• ${pick.name} — ${pick.category}, fee ${pick.feePct}%${overlapNote}`
      );
    }

    lines.push(
      '',
      '_Diversified across markets; favouring under-weighted exposures and lower fees. Buy-and-hold, not active trades._'
    );

    return lines.join('\n');
  }

  private async buildStrategiesResponse(
    computation: SignalsComputation,
    userId: string,
    assumedCash?: number
  ): Promise<InvestmentStrategiesResponse> {
    const {
      baseCurrency,
      cashBalance,
      fundCandidates,
      fundsValue,
      fundValueByCategory,
      fundValueBySymbol,
      stockCandidates,
      stocksValue
    } = computation;

    // The monthly auto-plan can assume the expected deposit before it has
    // been logged; a real (higher) balance always wins.
    const effectiveCash = Math.max(cashBalance, assumedCash ?? 0);

    // Split fresh cash toward the 60/40 funds/stocks target.
    const { fundsCash, stocksCash } = this.strategiesService.splitRebalanceCash(
      {
        cash: effectiveCash,
        fundsRatio: SIGNAL_PORTFOLIO_FUNDS_RATIO,
        fundsValue,
        stocksValue
      }
    );

    const portfolioValue = fundsValue + stocksValue;
    const pct = (value: number) =>
      portfolioValue > 0 ? Math.round((value / portfolioValue) * 1000) / 10 : 0;

    // Funds sleeve → diversified, under-weight-first fund picks.
    const facts = await this.fundHistoryService.getFacts();
    const recommendedFunds = this.strategiesService.recommendFunds({
      candidates: fundCandidates,
      count: SIGNAL_FUND_RECOMMENDATION_COUNT,
      holdingsBySymbol: this.buildFundHoldingsBySymbol(facts),
      valueByCategory: fundValueByCategory,
      valueBySymbol: fundValueBySymbol
    });
    const fundPicks = this.strategiesService.sizeFundPicks(
      recommendedFunds,
      fundsCash
    );

    // Stocks sleeve → the WHOLE buyable universe, re-checked against recent
    // signals, ranked by expected value inside buildStrategies.
    const candidates = await this.enrichWithRecentSignals(
      stockCandidates.filter((c) => c.priceInBase > 0),
      userId
    );

    return {
      baseCurrency,
      cash: Math.round(effectiveCash * 100) / 100,
      fundPicks,
      generatedAt: new Date().toISOString(),
      rebalance: {
        currentFundsPct: pct(fundsValue),
        currentStocksPct: pct(stocksValue),
        fundsCash,
        fundsValue: Math.round(fundsValue * 100) / 100,
        stocksCash,
        stocksValue: Math.round(stocksValue * 100) / 100,
        targetFundsPct: Math.round(SIGNAL_PORTFOLIO_FUNDS_RATIO * 100)
      },
      strategies: this.strategiesService.buildStrategies({
        candidates,
        cash: stocksCash,
        fundValueByCategory
      })
    };
  }

  /**
   * Recent-signal control: re-check each candidate against its last signal —
   * tag a still-valid recent BUY (re-confirmation) and exclude anything recently
   * SELL/stopped, so we don't recommend re-buying what was just exited.
   */
  private async enrichWithRecentSignals(
    candidates: StrategyCandidate[],
    userId: string
  ): Promise<StrategyCandidate[]> {
    const states = await this.prismaService.signalState.findMany({
      where: { userId }
    });
    const stateByKey = new Map(states.map((state) => [state.key, state]));
    const now = Date.now();

    for (const candidate of candidates) {
      const state = stateByKey.get(`YAHOO:${candidate.symbol}`);
      const ageMs = state?.lastNotifiedAt
        ? now - state.lastNotifiedAt.getTime()
        : Infinity;

      if (ageMs > SIGNAL_RECENT_SIGNAL_WINDOW) {
        continue;
      }

      if (state?.lastSignal === 'SELL') {
        candidate.recentlyExited = true;
      } else if (state?.lastSignal === 'BUY' && !candidate.isDowntrend) {
        candidate.recentBuyDays = Math.floor(ageMs / 86_400_000);
      }
    }

    return candidates;
  }

  /**
   * Fires budget strategies when fresh cash becomes available (a top-up or a
   * sale), tracked via the per-user "CASH" SignalState row. No cash increase ⇒
   * no strategies. Reuses the notification cooldown to avoid repeats.
   */
  private async maybeSendStrategies({
    computation,
    now,
    userId
  }: {
    computation: SignalsComputation;
    now: Date;
    userId: string;
  }): Promise<void> {
    const { cashBalance, response } = computation;

    const state = await this.prismaService.signalState.findUnique({
      where: { userId_key: { key: 'CASH', userId } }
    });

    const lastSeenCash = state?.lastPrice ?? 0;
    const increased = cashBalance - lastSeenCash >= SIGNAL_STRATEGY_CASH_DELTA;
    const sellFired = response.sell.length > 0;
    const cooldownPassed =
      !state?.lastNotifiedAt ||
      now.getTime() - state.lastNotifiedAt.getTime() >=
        SIGNAL_NOTIFICATION_COOLDOWN;

    const shouldFire =
      cashBalance >= SIGNAL_STRATEGY_MIN_CASH &&
      (increased || sellFired) &&
      cooldownPassed;

    let notified = false;

    if (shouldFire) {
      const strategiesResponse = await this.buildStrategiesResponse(
        computation,
        userId
      );

      if (
        strategiesResponse.strategies.length > 0 ||
        strategiesResponse.fundPicks.length > 0
      ) {
        await this.deliverStrategies(strategiesResponse);
        notified = true;
      }
    }

    // Always track the latest cash so the next increase is measured correctly.
    await this.prismaService.signalState.upsert({
      create: {
        key: 'CASH',
        lastNotifiedAt: notified ? now : null,
        lastPrice: cashBalance,
        lastSignal: 'CASH',
        userId
      },
      update: {
        lastPrice: cashBalance,
        lastSignal: 'CASH',
        ...(notified ? { lastNotifiedAt: now } : {})
      },
      where: { userId_key: { key: 'CASH', userId } }
    });
  }

  /** Renders the deterministic strategies message + an optional Gemma note. */
  private async deliverStrategies(
    response: InvestmentStrategiesResponse,
    header?: string
  ): Promise<void> {
    // Advisory market-regime line (VIX + S&P vs 200-day). Never modifies the
    // EV math — deployment advice text only (docs §0.2 no-optimism).
    const regimeLine = await this.marketRegimeService.getRegimeLine();

    const message = [
      ...(header ? [header, ''] : []),
      ...(regimeLine ? [regimeLine, ''] : []),
      this.formatStrategiesMessage(response)
    ].join('\n');

    await this.telegramBotService.sendMessage(message);

    // Optional, guardrailed: Gemma only paraphrases the deterministic text — it
    // never computes any number. Omitted silently if Ollama is unavailable.
    const note = await this.ollamaService.interpretStrategies(message);

    if (note) {
      await this.telegramBotService.sendMessage(`🤖 *AI note:*\n${note}`);
    }
  }

  private formatStrategiesMessage(
    response: InvestmentStrategiesResponse
  ): string {
    const { baseCurrency, cash, fundPicks, rebalance, strategies } = response;

    const lines = [
      `💰 *Investment plan* — ${cash.toFixed(2)} ${baseCurrency} available`,
      ''
    ];

    // Lead with the 60/40 rebalance split.
    lines.push(
      `*Rebalance toward ${rebalance.targetFundsPct}% funds / ${100 - rebalance.targetFundsPct}% stocks*`,
      `  Now: funds ${rebalance.currentFundsPct}% / stocks ${rebalance.currentStocksPct}%`,
      `  This month → funds ${rebalance.fundsCash.toFixed(2)}, stocks ${rebalance.stocksCash.toFixed(2)} ${baseCurrency}`,
      ''
    );

    // Funds sleeve picks.
    if (fundPicks.length > 0 && rebalance.fundsCash > 0) {
      lines.push(
        `*Funds to buy* (${rebalance.fundsCash.toFixed(2)} ${baseCurrency})`
      );

      for (const pick of fundPicks) {
        lines.push(
          `  • ${pick.amount.toFixed(2)} ${baseCurrency} → ${pick.name} — ${pick.category}, fee ${pick.feePct}%`
        );
      }

      lines.push('');
    }

    if (strategies.length === 0) {
      lines.push(
        rebalance.stocksCash > 0
          ? `_No stocks currently meet the buy rules; hold the stock cash or wait for a setup._`
          : `_Stock sleeve is at/above target this month._`
      );

      return lines.join('\n');
    }

    lines.push(
      `*Stock options* (${rebalance.stocksCash.toFixed(2)} ${baseCurrency}) — ranked by expected value (prob × gain − loss, drift 0)`,
      ''
    );

    for (const strategy of strategies) {
      lines.push(`*${strategy.name}* — ${strategy.description}`);

      for (const leg of strategy.legs) {
        if (leg.shares > 0) {
          lines.push(
            `  • ${leg.shares}× ${leg.name} (${leg.symbol}) @ ${leg.unitPrice.toFixed(
              2
            )} = ${leg.cost.toFixed(2)}${leg.fee > 0 ? ` (incl. ${leg.fee} fee)` : ''}`
          );
          // The "why": expected value, probability, indicators.
          if (leg.rationale) {
            lines.push(`      ↳ ${leg.rationale}`);
          }
        } else if (leg.cost > 0) {
          // Fund leg (index): allocated by cash amount.
          lines.push(
            `  • ${leg.cost.toFixed(2)} ${baseCurrency} → ${leg.name} (${leg.symbol})`
          );
        } else {
          lines.push(
            `  • ${leg.name} (${leg.symbol}): need ~${leg.unitPrice.toFixed(
              2
            )} for 1 share (not affordable yet)`
          );
          if (leg.rationale) {
            lines.push(`      ↳ ${leg.rationale}`);
          }
        }
      }

      lines.push(
        `  Invested ${strategy.invested.toFixed(2)}, fees ${strategy.fees.toFixed(
          2
        )}, left ${strategy.cashLeft.toFixed(2)} ${baseCurrency}`,
        ''
      );
    }

    return lines.join('\n');
  }

  /**
   * Computes the current trading signals for a user (read-only; no notifications).
   */
  public async computeSignals(userId: string): Promise<TradingSignalsResponse> {
    const { response } = await this.computeSignalsInternal(userId);

    return response;
  }

  /**
   * Core signal computation. Reads the persisted trailing-peak state so the exit
   * state machine reflects prior runs, and returns the next trailing peaks for
   * the notify path to persist. Read-only itself (no DB writes, no Telegram).
   */
  private async computeSignalsInternal(
    userId: string
  ): Promise<SignalsComputation> {
    const baseCurrency = await this.getUserCurrency(userId);

    const [configs, universe, cashBalance, states, liveTrackedKeys] =
      await Promise.all([
        this.getSignalConfigs(userId),
        this.getUniverse(userId, baseCurrency),
        this.getCashBalance(userId, baseCurrency),
        this.prismaService.signalState.findMany({ where: { userId } }),
        this.getLiveTrackedKeys(userId)
      ]);

    const priorTrailingByKey = new Map(
      states.map((state) => [state.key, state.trailingPeak ?? null])
    );

    const response: TradingSignalsResponse = {
      buy: [],
      hold: [],
      reinvest: [],
      sell: []
    };
    const trailingByKey = new Map<string, number | null>();
    const enteredTrailing: TradingSignal[] = [];
    let fundsValue = 0;
    let stocksValue = 0;
    const fundValueByCategory: Record<string, number> = {};
    const fundValueBySymbol: Record<string, number> = {};
    const fundCandidates: FundCandidate[] = [];
    const stockCandidates: StrategyCandidate[] = [];

    if (universe.length === 0) {
      return {
        baseCurrency,
        cashBalance,
        enteredTrailing,
        fundCandidates,
        fundsValue,
        fundValueByCategory,
        fundValueBySymbol,
        livePriceBySymbol: new Map<string, number>(),
        response,
        stockCandidates,
        stocksValue,
        trailingByKey
      };
    }

    const items = universe.map(({ dataSource, symbol }) => {
      return { dataSource, symbol };
    });

    const [quotes, historyBySymbol] = await Promise.all([
      this.dataProviderService.getQuotes({ items, useCache: true }),
      this.getHistory(items)
    ]);

    const livePriceBySymbol = new Map<string, number>();

    for (const [symbol, quote] of Object.entries(quotes)) {
      if (quote?.marketPrice) {
        livePriceBySymbol.set(symbol, quote.marketPrice);
      }
    }

    let sellFired = false;

    for (const entry of universe) {
      const quote = quotes[entry.symbol];
      const livePrice = quote?.marketPrice;

      if (!livePrice) {
        continue;
      }

      const isFund =
        entry.dataSource === DataSource.MANUAL || isFundSymbol(entry.symbol);

      // Funds are tracking-only on the stock cadence: value the sleeve + collect
      // them as fund candidates, but do NOT run the stock BUY/exit evaluation.
      if (isFund) {
        const category = fundCategoryForSymbol(entry.symbol) ?? 'global';

        fundCandidates.push({
          category,
          currency: entry.currency,
          feePct: fundFeeForSymbol(entry.symbol) ?? 0,
          name: entry.name,
          symbol: entry.symbol
        });

        if (entry.owned) {
          const valueInBase = this.exchangeRateDataService.toCurrency(
            livePrice * entry.quantity,
            entry.currency,
            baseCurrency
          );
          fundsValue += valueInBase;
          fundValueByCategory[category] =
            (fundValueByCategory[category] ?? 0) + valueInBase;
          fundValueBySymbol[entry.symbol] =
            (fundValueBySymbol[entry.symbol] ?? 0) + valueInBase;
        }

        continue;
      }

      if (entry.owned) {
        stocksValue += this.exchangeRateDataService.toCurrency(
          livePrice * entry.quantity,
          entry.currency,
          baseCurrency
        );
      }

      const key = `${entry.dataSource}:${entry.symbol}`;
      // Trading days only: every window below (sma50/200, rsi14, macd,
      // bollinger20, momentum, the 30-day high) counts array elements, so
      // forward-filled weekend rows would shrink each one to ~5/7 of the
      // sessions it names and deflate σ by √(5/7).
      const closes = toTradingDayCloses(historyBySymbol[entry.symbol] ?? []);
      const config = this.resolveConfig(configs, entry);

      // News sentiment only gates potential BUYs (not active-trade exits). Fetch
      // it lazily for genuinely dipping symbols so the free-tier quota is spent
      // on a handful of names, never the whole watchlist.
      const newsScore = await this.resolveNewsScore({
        closes,
        config,
        entry,
        livePrice
      });
      const fundamentalsScore = await this.resolveFundamentalsScore({
        closes,
        config,
        entry,
        livePrice
      });

      // For owned active trades, drive the real stop/target/trail bands off a
      // more stable Yang-Zhang (OHLC) volatility — bounded to these few symbols.
      const volatilityOverride =
        entry.owned && config.isActiveTrade
          ? ((await this.ohlcService.getDailyVolatility(entry.symbol)) ??
            undefined)
          : undefined;

      // Reversal (bear-market) buy path: a cheap close-based structure check
      // first; only when it holds do we spend a volume fetch to confirm
      // capitulation. Bounds the OHLCV fetches to genuine reversal candidates.
      const reversal = !(entry.owned && config.isActiveTrade)
        ? this.indicatorsService.reversalStructure(
            closes,
            SIGNAL_REVERSAL_RSI_MAX
          )
        : undefined;
      const volumeRatio = reversal?.isReversal
        ? ((await this.ohlcService.getVolumeRatio(entry.symbol)) ?? undefined)
        : undefined;

      const {
        candidate,
        enteredTrailing: justEnteredTrailing,
        nextTrailingPeak,
        signal
      } = this.evaluateSymbol({
        baseCurrency,
        cashBalance,
        closes,
        config,
        entry,
        fundamentalsScore,
        isTrackedLive: liveTrackedKeys.has(key),
        livePrice,
        newsScore,
        priorTrailingPeak: priorTrailingByKey.get(key) ?? null,
        reversal,
        volatilityOverride,
        volumeRatio
      });

      if (candidate) {
        stockCandidates.push(candidate);
      }

      // Always record the next trailing state for owned active trades so it is
      // persisted (and reset to null when not trailing / after a sell).
      if (entry.owned && config.isActiveTrade) {
        trailingByKey.set(key, nextTrailingPeak);
      }

      if (!signal) {
        continue;
      }

      if (justEnteredTrailing) {
        enteredTrailing.push(signal);
      }

      if (signal.category === 'SELL') {
        sellFired = true;
        response.sell.push(signal);
      } else if (signal.category === 'BUY') {
        response.buy.push(signal);
      } else {
        response.hold.push(signal);
      }
    }

    const reinvest = this.evaluateReinvest({
      cashBalance,
      configs,
      sellFired
    });

    if (reinvest) {
      response.reinvest.push(reinvest);
    }

    // Rank: most attractive buys first, highest-probability sells first.
    response.buy.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    response.sell.sort(
      (a, b) => (b.hitTargetProbability ?? 0) - (a.hitTargetProbability ?? 0)
    );

    return {
      baseCurrency,
      cashBalance,
      enteredTrailing,
      fundCandidates,
      fundsValue: Math.round(fundsValue * 100) / 100,
      fundValueByCategory,
      fundValueBySymbol,
      livePriceBySymbol,
      response,
      stockCandidates,
      stocksValue: Math.round(stocksValue * 100) / 100,
      trailingByKey
    };
  }

  /**
   * Computes signals for a user and sends a Telegram notification for any
   * actionable signal whose category changed since the previous run.
   */
  public async evaluateAndNotify(userId: string): Promise<void> {
    const computation = await this.computeSignalsInternal(userId);
    const { enteredTrailing, response: signals, trailingByKey } = computation;

    const actionable: TradingSignal[] = [
      ...signals.sell,
      ...signals.buy,
      ...signals.reinvest
    ];

    const states = await this.prismaService.signalState.findMany({
      where: { userId }
    });
    const stateByKey = new Map(states.map((state) => [state.key, state]));

    const now = new Date();
    const changed: TradingSignal[] = [];

    // Track the categories we have observed this run for every key (incl. HOLD)
    // so we can keep the persisted state in sync and re-notify after a change.
    const currentByKey = new Map<string, TradingSignal>();

    for (const signal of [...actionable, ...signals.hold]) {
      currentByKey.set(this.getSignalKey(signal), signal);
    }

    for (const [key, signal] of currentByKey) {
      const previous = stateByKey.get(key);
      const isActionable = signal.category !== 'HOLD';

      const categoryChanged = previous?.lastSignal !== signal.category;
      const cooldownPassed =
        !previous?.lastNotifiedAt ||
        now.getTime() - previous.lastNotifiedAt.getTime() >=
          SIGNAL_NOTIFICATION_COOLDOWN;

      const shouldNotify = isActionable && categoryChanged && cooldownPassed;

      if (shouldNotify) {
        changed.push(signal);
      }

      // Persist the next trailing-peak for this key (undefined when the key is
      // not an owned active trade; null resets to the WATCHING phase).
      const nextTrailingPeak = trailingByKey.has(key)
        ? trailingByKey.get(key)
        : null;

      await this.prismaService.signalState.upsert({
        create: {
          key,
          lastNotifiedAt: shouldNotify ? now : null,
          lastPrice: signal.livePrice,
          lastSignal: signal.category,
          trailingPeak: nextTrailingPeak,
          userId
        },
        update: {
          lastPrice: signal.livePrice,
          lastSignal: signal.category,
          trailingPeak: nextTrailingPeak,
          ...(shouldNotify ? { lastNotifiedAt: now } : {})
        },
        where: { userId_key: { key, userId } }
      });
    }

    if (changed.length > 0) {
      await this.telegramBotService.sendMessage(this.formatMessage(changed));

      // Advisory pre-buy screen for the BUYs that just fired (also persisted
      // to SignalLog.metrics below). Falls back to the plain "paste into
      // Google" prompt when no screen data could be resolved, so behavior
      // without connectivity/keys is unchanged.
      await this.attachPreBuyScreens(userId, changed);

      const screenMessage = this.formatPreBuyScreens(changed);

      if (screenMessage) {
        await this.telegramBotService.sendMessage(screenMessage);
      } else {
        const newsPrompt = this.formatNewsPrompt(changed);

        if (newsPrompt) {
          await this.telegramBotService.sendMessage(newsPrompt);
        }
      }
    }

    // One-time alert when a position reaches its target and starts trailing.
    if (enteredTrailing.length > 0) {
      await this.telegramBotService.sendMessage(
        this.formatTrailingMessage(enteredTrailing)
      );
    }

    // Persist the triggered events (audit trail for the Analytics dashboard).
    await this.logSignalEvents(userId, [...changed, ...enteredTrailing]);

    // Propose budget strategies when fresh cash has become available.
    await this.maybeSendStrategies({ computation, now, userId });

    // Real-buy auto-detection + frozen-target alerting — independent of the
    // dynamic signal/exit-machine notify path above; best-effort so a bug
    // here never blocks the main notification cycle.
    try {
      await this.signalTradeTrackingService.detectAndTrackNewBuys(userId);
      await this.signalTradeTrackingService.checkTrackedTradesAndAlert(
        userId,
        computation.livePriceBySymbol
      );
    } catch (error) {
      this.logger.warn(
        `Tracked-trade check failed for user ${userId}: ${error?.message ?? error}`
      );
    }
  }

  /**
   * On-demand refresh of the tracked-trade detector/alerter (manual trigger
   * for verification/debugging — the cron path above calls the two steps
   * directly to avoid recomputing computeSignalsInternal twice).
   */
  public async refreshTrackedTrades(userId: string): Promise<void> {
    const { livePriceBySymbol } = await this.computeSignalsInternal(userId);

    await this.signalTradeTrackingService.detectAndTrackNewBuys(userId);
    await this.signalTradeTrackingService.checkTrackedTradesAndAlert(
      userId,
      livePriceBySymbol
    );
  }

  /**
   * The 5-minute intraday reversal check for real tracked positions past
   * their frozen take-profit target, across every user. Delegates to
   * SignalTradeTrackingService — thin wrapper so the Bull processor only
   * needs to depend on SignalsService, matching every other job here.
   */
  public async checkTrailingPositionsIntraday(): Promise<void> {
    await this.signalTradeTrackingService.checkTrailingPositionsIntraday();
  }

  /**
   * Appends one SignalLog row per actionable, triggered signal. Best-effort:
   * a logging failure must never break the notification path.
   */
  private async logSignalEvents(
    userId: string,
    signals: TradingSignal[]
  ): Promise<void> {
    if (signals.length === 0) {
      return;
    }

    try {
      await this.prismaService.signalLog.createMany({
        data: signals.map((signal) => this.toSignalLogInput(userId, signal))
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist ${signals.length} signal log row(s): ${
          error?.message ?? error
        }`
      );
    }
  }

  /** Maps a TradingSignal to a SignalLog row, deriving EV / levels. */
  private toSignalLogInput(
    userId: string,
    signal: TradingSignal
  ): Prisma.SignalLogCreateManyInput {
    const { livePrice, reachProbability, stopLossPct, targetGainPct } = signal;

    const expectedValue =
      reachProbability != null && targetGainPct != null && stopLossPct != null
        ? reachProbability * targetGainPct -
          (1 - reachProbability) * stopLossPct
        : null;

    return {
      adaptiveLevel: signal.adaptiveLevel ?? null,
      bearMarket: signal.bearMarket ?? false,
      bollingerPctB: signal.bollingerPctB ?? null,
      category: signal.category,
      // SignalLog.conviction is intentionally left unwritten: the metric drove
      // no decision anywhere and its 50 + EV*1000 rendering was unbounded and
      // misleading. The column is kept so historical rows stay readable.
      currency: signal.currency ?? null,
      dataSource: signal.dataSource,
      expectedValue,
      forecastLower: signal.forecastBand?.lower ?? null,
      forecastUpper: signal.forecastBand?.upper ?? null,
      livePrice: livePrice ?? null,
      macdHistogram: signal.macdHistogram ?? null,
      // Forward-compat Json column; keeps the log queryable by asset type
      // (metrics->>'assetSubClass') and preserves what the advisory pre-buy
      // screen said at fire time — without a schema migration.
      metrics:
        signal.assetSubClass || signal.preBuyScreen
          ? JSON.parse(
              JSON.stringify({
                assetSubClass: signal.assetSubClass,
                preBuyScreen: signal.preBuyScreen
              })
            )
          : undefined,
      name: signal.name ?? null,
      newsScore: signal.newsScore ?? null,
      reachProbability: reachProbability ?? null,
      reason: signal.reason ?? null,
      rsi: signal.rsi ?? null,
      score: signal.score ?? null,
      signalType: signal.signalType ?? null,
      stopLoss:
        livePrice != null && stopLossPct != null
          ? livePrice * (1 - stopLossPct)
          : null,
      suggestedAmount: signal.suggestedAmount ?? null,
      symbol: signal.symbol,
      takeProfit:
        livePrice != null && targetGainPct != null
          ? livePrice * (1 + targetGainPct)
          : null,
      trailingStop: null,
      userId
    };
  }

  /**
   * Reads the persisted signal log (newest first) with optional day-window /
   * category / symbol filters, plus 7d & 30d per-category summary counts.
   */
  public async getSignalLog(
    userId: string,
    filters: { category?: string; days?: number; symbol?: string } = {}
  ): Promise<SignalLogResponse> {
    // No default window. This used to fall back to 30 days, which silently hid
    // every older signal from the Analytics dashboard — including the AMZN dip
    // call a real purchase was made on. The rows were always in the table; the
    // dashboard simply could not see them, which from the outside is
    // indistinguishable from the engine never having fired. A caller that wants
    // a window now has to ask for one.
    const since =
      filters.days && filters.days > 0
        ? new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000)
        : undefined;

    const rows = await this.prismaService.signalLog.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        userId,
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.symbol ? { symbol: filters.symbol } : {})
      }
    });

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const last7d: Record<string, number> = {};
    const last30d: Record<string, number> = {};

    for (const row of rows) {
      // REVERSAL and LEADER signals are both stored as category='BUY' with a
      // distinguishing signalType. Bucket them under their own name so the
      // summary card shows the real count per strategy rather than lumping
      // three different playbooks into one 'BUY' total.
      const bucket = BUCKETED_SIGNAL_TYPES.has(row.signalType ?? '')
        ? row.signalType
        : row.category;

      last30d[bucket] = (last30d[bucket] ?? 0) + 1;

      if (row.createdAt.getTime() >= sevenDaysAgo) {
        last7d[bucket] = (last7d[bucket] ?? 0) + 1;
      }
    }

    // Recompute today's live metrics for every distinct symbol in the result so
    // the UI can compare "at signal time" vs "now" without a second round trip.
    const distinctSymbols = new Map<
      string,
      { dataSource: DataSource; symbol: string }
    >();

    for (const row of rows) {
      distinctSymbols.set(row.symbol, {
        dataSource: row.dataSource,
        symbol: row.symbol
      });
    }

    const currentMetrics = await this.computeMetricsSnapshot([
      ...distinctSymbols.values()
    ]);
    const now = Date.now();

    return {
      entries: rows.map((row) => {
        const current = currentMetrics.get(row.symbol);

        return {
          adaptiveLevel: row.adaptiveLevel ?? undefined,
          bearMarket: row.bearMarket,
          bollingerPctB: row.bollingerPctB ?? undefined,
          category: row.category,
          createdAt: row.createdAt.toISOString(),
          currency: row.currency ?? undefined,
          currentExpectedValue: current?.expectedValue,
          currentPrice: current?.livePrice,
          currentReachProbability: current?.reachProbability,
          currentRsi: current?.rsi,
          currentScore: current?.score,
          dataSource: row.dataSource,
          daysSinceSignal: differenceInCalendarDays(now, row.createdAt),
          expectedValue: row.expectedValue ?? undefined,
          forecastLower: row.forecastLower ?? undefined,
          forecastUpper: row.forecastUpper ?? undefined,
          id: row.id,
          livePrice: row.livePrice ?? undefined,
          macdHistogram: row.macdHistogram ?? undefined,
          name: row.name ?? undefined,
          newsScore: row.newsScore ?? undefined,
          reachProbability: row.reachProbability ?? undefined,
          reason: row.reason ?? undefined,
          rsi: row.rsi ?? undefined,
          score: row.score ?? undefined,
          signalType: row.signalType ?? undefined,
          stopLoss: row.stopLoss ?? undefined,
          suggestedAmount: row.suggestedAmount ?? undefined,
          symbol: row.symbol,
          takeProfit: row.takeProfit ?? undefined,
          trailingStop: row.trailingStop ?? undefined
        };
      }),
      summary: { last7d, last30d, total: rows.length }
    };
  }

  /**
   * Paper-trades every logged BUY signal: FIFO-matches it to the next SELL
   * logged for the same symbol, independent of the real engine's owned /
   * active-trade gating (each BUY row opens its own simulated lot, even if a
   * prior lot for that symbol is still open — this is a hypothetical parallel
   * ledger, not tied to real ownership). Reports realized return + an
   * annualised rate for closed trades, and unrealized (marked-to-market)
   * return for still-open ones.
   */
  public async computeSimulation(userId: string): Promise<SimulationResponse> {
    const rows = await this.prismaService.signalLog.findMany({
      orderBy: { createdAt: 'asc' },
      where: { category: { in: ['BUY', 'SELL'] }, userId }
    });

    type SignalLogRow = (typeof rows)[number];

    const openLotsByKey = new Map<string, SignalLogRow[]>();
    const closedPairs: { buyRow: SignalLogRow; sellRow: SignalLogRow }[] = [];

    for (const row of rows) {
      // LEADER lots are matched in their own bucket. Both strategies trade the
      // same watchlist, so a shared queue would let a DIP exit close a LEADER
      // entry (or vice versa) and report the pair under the buy leg's label.
      // Non-LEADER rows keep their original key, so historical DIP/REVERSAL
      // matching is byte-for-byte unchanged by this addition.
      const key = ISOLATED_SIGNAL_TYPES.has(row.signalType ?? '')
        ? `${row.signalType}:${row.dataSource}:${row.symbol}`
        : `${row.dataSource}:${row.symbol}`;

      if (row.category === 'BUY') {
        const queue = openLotsByKey.get(key) ?? [];
        queue.push(row);
        openLotsByKey.set(key, queue);
      } else if (row.category === 'SELL') {
        const buyRow = openLotsByKey.get(key)?.shift();

        if (buyRow) {
          closedPairs.push({ buyRow, sellRow: row });
        }
        // A SELL with no open lot (e.g. a real sale of a holding that pre-dates
        // the signal log) is silently dropped, never crashes the walk.
      }
    }

    const stillOpenRows = [...openLotsByKey.values()].flat();

    // A second way for a lot to close, and the one the engine actually uses.
    //
    // The FIFO walk above pairs BUY rows with SELL rows, and the engine has
    // never written a SELL row — the exit alerts that DID fire were recorded by
    // SignalTradeTrackingService as a terminal `trackedStatus` on the buy row
    // itself. So every exit the user was told to take was invisible here, and
    // the strategy curves ran on as if nothing had been sold. Reading the
    // tracked status closes them. The BUY/SELL walk is untouched.
    const exitRows = await this.resolveTrackedExits(stillOpenRows);
    const exitByRowId = new Map(exitRows.map((exit) => [exit.rowId, exit]));

    const openRows = stillOpenRows.filter((row) => !exitByRowId.has(row.id));
    const currentQuotes = await this.computeMetricsSnapshot(
      openRows.map(({ dataSource, symbol }) => ({ dataSource, symbol }))
    );

    // Real sales. A position that has been sold reads SOLD whether or not the
    // engine ever asked for it — XDJP.DE was sold on the user's own decision
    // and the log holds no exit signal for it at all. The price and date are
    // kept, not just the fact, so the exits table can show what the engine
    // advised beside what actually happened.
    const sellOrders = await this.prismaService.order.findMany({
      orderBy: { date: 'asc' },
      select: {
        date: true,
        fee: true,
        SymbolProfile: { select: { symbol: true } },
        unitPrice: true
      },
      where: { isDraft: false, type: 'SELL', userId }
    });

    const saleBySymbol = new Map(
      sellOrders.map((order) => [order.SymbolProfile.symbol, order])
    );
    const soldSymbols = new Set(saleBySymbol.keys());

    const now = new Date();

    const closedTrades = closedPairs
      .map(({ buyRow, sellRow }) =>
        this.buildSimulatedTrade({ buyRow, now, sellRow, soldSymbols })
      )
      .filter((trade): trade is SimulatedTrade => trade !== null);

    // Tracked exits reuse the same builder by handing it a sell leg made from
    // the alert — the date it fired and the price it fired at. The exit is kept
    // paired with the trade it produced so the chart marker needs no lookup.
    const trackedExits = stillOpenRows
      .filter((row) => exitByRowId.has(row.id))
      .map((buyRow) => {
        const exit = exitByRowId.get(buyRow.id);

        return {
          exit,
          trade: this.buildSimulatedTrade({
            buyRow,
            now,
            sellRow: { createdAt: exit.exitedAt, livePrice: exit.exitPrice },
            soldSymbols
          })
        };
      })
      .filter(({ trade }) => trade !== null);

    const trackedExitTrades = trackedExits.map(({ trade }) => trade);

    const openTrades = openRows
      .map((buyRow) =>
        this.buildSimulatedTrade({
          buyRow,
          currentPrice: currentQuotes.get(buyRow.symbol)?.livePrice,
          now,
          soldSymbols
        })
      )
      .filter((trade): trade is SimulatedTrade => trade !== null);

    const trades = [...closedTrades, ...trackedExitTrades, ...openTrades].sort(
      (a, b) => new Date(b.buyDate).getTime() - new Date(a.buyDate).getTime()
    );

    const exitMarkers: SignalExitMarker[] = trackedExits
      .filter(({ trade }) => trade.netReturnPct != null)
      .map(({ exit, trade }) => {
        const sale = saleBySymbol.get(trade.symbol);
        // Measured from the REAL fill, not the signal price — this column
        // answers "what did I actually make", where the one beside it answers
        // "what would following the advice have made".
        const realEntry = trade.realBuyPrice ?? trade.buyPrice;

        return {
          date: exit.exitedAt.toISOString().slice(0, 10),
          entryPrice: trade.buyPrice,
          exitPrice: exit.exitPrice,
          holdingDays: trade.holdingDays,
          name: trade.name,
          netReturnPct: trade.netReturnPct,
          reconstructed: exit.reconstructed,
          signalType: trade.signalType ?? SIGNAL_TYPE_UNTAGGED,
          soldDate: sale ? sale.date.toISOString().slice(0, 10) : undefined,
          soldNetReturnPct:
            sale && realEntry > 0
              ? round2((sale.unitPrice / realEntry - 1) * 100)
              : undefined,
          soldPrice: sale?.unitPrice,
          status: exit.status,
          symbol: trade.symbol
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const marketDataBySymbol = await this.fetchMarketDataBySymbol(trades);
    const todayStr = now.toISOString().slice(0, 10);

    const dipSeries = buildPerformanceSeries(
      trades.filter((trade) => trade.signalType === 'DIP'),
      marketDataBySymbol,
      todayStr
    );
    const reversalSeries = buildPerformanceSeries(
      trades.filter((trade) => trade.signalType === 'REVERSAL'),
      marketDataBySymbol,
      todayStr
    );
    const leaderSeries = buildPerformanceSeries(
      trades.filter((trade) => trade.signalType === 'LEADER'),
      marketDataBySymbol,
      todayStr
    );
    const leaderGatedSeries = buildPerformanceSeries(
      trades.filter((trade) => trade.signalType === 'LEADER_GATED'),
      marketDataBySymbol,
      todayStr
    );
    const tt8Series = buildPerformanceSeries(
      trades.filter((trade) => trade.signalType === 'TT8'),
      marketDataBySymbol,
      todayStr
    );

    // Every Trend Template entrant the engine has ever alerted — the running
    // record of what was RECOMMENDED, as opposed to tt8Series, which is the
    // much shorter list of entrants actually purchased. These are logged under
    // category 'WATCH', which the BUY/SELL query above deliberately excludes,
    // so they are fetched separately.
    const watchRows = await this.prismaService.signalLog.findMany({
      orderBy: { createdAt: 'asc' },
      where: { category: 'WATCH', signalType: 'TT8', userId }
    });

    const watchTrades: PerformanceSeriesTrade[] = watchRows
      .filter((row) => row.livePrice > 0)
      .map((row) => ({
        buyDate: row.createdAt.toISOString().slice(0, 10),
        buyPrice: row.livePrice,
        dataSource: row.dataSource,
        symbol: row.symbol
      }));

    // Real activities, FIFO-reconstructed. Funds are excluded: they are the
    // buy-and-hold core, bought on a schedule rather than a call, and folding
    // them in would blunt every comparison this chart exists to make.
    const orders = await this.prismaService.order.findMany({
      include: {
        SymbolProfile: {
          select: {
            assetSubClass: true,
            currency: true,
            dataSource: true,
            name: true,
            symbol: true
          }
        },
        tags: { select: { name: true } }
      },
      where: { type: { in: ['BUY', 'SELL'] }, userId }
    });

    // The engine's own most recent take-profit per symbol, as the fallback
    // target for a stock with no hand-set number. Read from the log rather than
    // recomputed: the point is to show the level the engine actually published.
    const takeProfitBySymbol = new Map<string, number>();

    for (const row of rows) {
      if (row.takeProfit != null) {
        takeProfitBySymbol.set(row.symbol, row.takeProfit);
      }
    }

    const trackedTrades = ordersToTrades(
      orders
        .filter(
          ({ SymbolProfile }) =>
            SymbolProfile.assetSubClass === 'STOCK' ||
            SymbolProfile.assetSubClass === 'ETF'
        )
        .map((order) => ({
          dataSource: order.SymbolProfile.dataSource,
          date: order.date.toISOString().slice(0, 10),
          fee: order.fee ?? 0,
          quantity: order.quantity,
          symbol: order.SymbolProfile.symbol,
          tags: order.tags.map(({ name }) => name),
          type: order.type,
          unitPrice: order.unitPrice
        }))
    );

    const extraMarketData = await this.fetchMarketDataBySymbol([
      ...watchTrades,
      ...trackedTrades
    ]);

    for (const [key, closes] of extraMarketData) {
      if (!marketDataBySymbol.has(key)) {
        marketDataBySymbol.set(key, closes);
      }
    }

    const watchLeaderSeries = buildPerformanceSeries(
      watchTrades,
      marketDataBySymbol,
      todayStr
    );
    const trackedSeries = buildPerformanceSeries(
      trackedTrades,
      marketDataBySymbol,
      todayStr
    );

    const byTag = (tag: string) =>
      buildPerformanceSeries(
        trackedTrades.filter((trade) => trade.tags.includes(tag)),
        marketDataBySymbol,
        todayStr
      );

    const trackedBetSeries = byTag(SIGNAL_TAG_PROVENANCE_BET);
    const trackedDipSeries = byTag(SIGNAL_TAG_PROVENANCE_DIP);
    const trackedLeaderSeries = byTag(SIGNAL_TAG_PROVENANCE_LEADER);

    const openTrackedTrades = trackedTrades.filter(({ sellDate }) => !sellDate);
    const trackedQuotes = await this.computeMetricsSnapshot(
      openTrackedTrades.map(({ dataSource, symbol }) => ({
        dataSource: dataSource as DataSource,
        symbol
      }))
    );
    const profileBySymbol = new Map(
      orders.map(({ SymbolProfile }) => [SymbolProfile.symbol, SymbolProfile])
    );

    const trackedPositions: TrackedPosition[] = openTrackedTrades.map(
      (trade) => {
        const profile = profileBySymbol.get(trade.symbol);
        const currentPrice = trackedQuotes.get(trade.symbol)?.livePrice;
        // A hand-set target wins; otherwise the engine's own take-profit for
        // this name, if it has ever produced one. An ETF gets neither.
        const targetPrice =
          profile?.assetSubClass === 'STOCK'
            ? (PORTFOLIO_PRICE_TARGETS[trade.symbol] ??
              takeProfitBySymbol.get(trade.symbol))
            : undefined;

        return {
          currency: profile?.currency ?? undefined,
          currentPrice,
          entryDate: trade.buyDate,
          entryPrice: trade.buyPrice,
          name: profile?.name ?? undefined,
          netReturnPct:
            currentPrice != null
              ? round2(
                  (currentPrice / trade.buyPrice - 1) * 100 -
                    (trade.feeDragPct ?? 0)
                )
              : undefined,
          provenance: trade.tags[0],
          quantity: round2(trade.quantity),
          symbol: trade.symbol,
          targetPrice,
          toTargetPct:
            targetPrice != null && currentPrice != null
              ? round2((targetPrice / currentPrice - 1) * 100)
              : undefined
        };
      }
    );

    const overallStart = [
      dipSeries,
      leaderGatedSeries,
      leaderSeries,
      reversalSeries,
      trackedBetSeries,
      trackedDipSeries,
      trackedLeaderSeries,
      trackedSeries,
      tt8Series,
      watchLeaderSeries
    ]
      .flat()
      .map((point) => point.date)
      .sort()[0];

    const benchmark = overallStart
      ? await this.buildBenchmarkSeries(overallStart)
      : undefined;
    const benchmarkSeries = benchmark?.series;
    const benchmarkReadout = benchmark?.readout;

    // netReturnPct/effectiveAnnualRatePct are undefined only in the rare case
    // where a matched SELL row itself is missing a price — filter those out
    // of the averages/win-rate rather than letting `undefined > 0`/NaN skew
    // them; the trade itself still appears in the table regardless.
    const numeric = (value: number | undefined): value is number =>
      value != null;

    // The headline numbers describe the DIP/REVERSAL engine and always have.
    // LEADER runs a different playbook entirely (buys strength, flat 7.5%
    // stop, no take-profit), so folding it in would redefine what those
    // figures mean rather than add to them. It gets its own breakdown below.
    const headlineTrades = closedTrades.filter(
      (trade) => !ISOLATED_SIGNAL_TYPES.has(trade.signalType)
    );
    const headlineOpenTrades = openTrades.filter(
      (trade) => !ISOLATED_SIGNAL_TYPES.has(trade.signalType)
    );

    const winningTrades = headlineTrades.filter(
      (trade) => numeric(trade.netReturnPct) && trade.netReturnPct > 0
    );

    // Per-signal-type breakdown, so the DIP-vs-REVERSAL evidence the user
    // found in the CSV export stays visible on the page itself.
    const typeBreakdown = (signalType: SimulatedTrade['signalType']) => {
      const ofType = closedTrades.filter(
        (trade) => trade.signalType === signalType
      );
      const wins = ofType.filter(
        (trade) => numeric(trade.netReturnPct) && trade.netReturnPct > 0
      );

      return {
        avgNetReturnPct: round2(
          average(ofType.map((trade) => trade.netReturnPct).filter(numeric))
        ),
        closedTrades: ofType.length,
        winRate: ofType.length > 0 ? round2(wins.length / ofType.length) : 0
      };
    };

    const dipBreakdown = typeBreakdown('DIP');
    const leaderBreakdown = typeBreakdown('LEADER');
    const leaderGatedBreakdown = typeBreakdown('LEADER_GATED');
    const reversalBreakdown = typeBreakdown('REVERSAL');
    const tt8Breakdown = typeBreakdown('TT8');

    const summary: SimulationSummary = {
      dipAvgNetReturnPct: dipBreakdown.avgNetReturnPct,
      dipClosedTrades: dipBreakdown.closedTrades,
      dipWinRate: dipBreakdown.winRate,
      leaderAvgNetReturnPct: leaderBreakdown.avgNetReturnPct,
      leaderClosedTrades: leaderBreakdown.closedTrades,
      leaderWinRate: leaderBreakdown.winRate,
      leaderGatedAvgNetReturnPct: leaderGatedBreakdown.avgNetReturnPct,
      leaderGatedClosedTrades: leaderGatedBreakdown.closedTrades,
      leaderGatedWinRate: leaderGatedBreakdown.winRate,
      tt8AvgNetReturnPct: tt8Breakdown.avgNetReturnPct,
      tt8ClosedTrades: tt8Breakdown.closedTrades,
      tt8WinRate: tt8Breakdown.winRate,
      reversalAvgNetReturnPct: reversalBreakdown.avgNetReturnPct,
      reversalClosedTrades: reversalBreakdown.closedTrades,
      reversalWinRate: reversalBreakdown.winRate,
      avgEffectiveAnnualRatePct: round2(
        average(
          headlineTrades
            .map((trade) => trade.effectiveAnnualRatePct)
            .filter(numeric)
        )
      ),
      avgNetReturnPct: round2(
        average(
          headlineTrades.map((trade) => trade.netReturnPct).filter(numeric)
        )
      ),
      closedTrades: headlineTrades.length,
      openTrades: headlineOpenTrades.length,
      // Commission is a percentage of trade value, so it is computed from the
      // assumed notional rather than counted as a flat charge per trade.
      totalFeesUsd:
        headlineTrades.length *
          this.roundTripCommission(SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD) +
        headlineOpenTrades.length *
          this.commission(SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD),
      winRate:
        headlineTrades.length > 0
          ? round2(winningTrades.length / headlineTrades.length)
          : 0
    };

    return {
      benchmarkReadout,
      benchmarkSeries,
      dipSeries,
      generatedAt: now.toISOString(),
      leaderGatedSeries,
      leaderSeries,
      reversalSeries,
      summary,
      trackedBetSeries,
      trackedDipSeries,
      trackedLeaderSeries,
      exitMarkers,
      trackedPositions,
      trackedSeries,
      trades,
      tt8Series,
      watchLeaderSeries
    };
  }

  /**
   * The exits that actually fired, for buy rows the BUY/SELL walk left open.
   *
   * `SignalTradeTrackingService` records a terminal `trackedStatus` on the buy
   * row rather than writing a SELL row, so these are the engine's real sell
   * alerts — the ones the user was told to act on.
   *
   * The price is taken from `trackedExitPrice` where the tracker recorded it.
   * Exits alerted before that field existed are RECONSTRUCTED from the stored
   * close on the alert date, which is close but not identical — a trailing exit
   * fires intraday. The flag is carried through so nothing presents an inferred
   * number as a recorded one.
   */
  private async resolveTrackedExits(
    rows: {
      id: string;
      dataSource: DataSource;
      metrics: Prisma.JsonValue | null;
      symbol: string;
    }[]
  ): Promise<
    {
      exitPrice: number;
      exitedAt: Date;
      reconstructed: boolean;
      rowId: string;
      status: string;
    }[]
  > {
    const TERMINAL = new Set(['STOP_HIT', 'TRAILING_EXIT']);
    const pending: {
      dataSource: DataSource;
      exitedAt: Date;
      price?: number;
      rowId: string;
      status: string;
      symbol: string;
    }[] = [];

    for (const row of rows) {
      const tracked = readTrackedMetrics(row.metrics);

      if (
        !tracked ||
        !TERMINAL.has(tracked.trackedStatus) ||
        !tracked.trackedAlertedAt
      ) {
        continue;
      }

      pending.push({
        dataSource: row.dataSource,
        exitedAt: new Date(tracked.trackedAlertedAt),
        price: tracked.trackedExitPrice,
        rowId: row.id,
        status: tracked.trackedStatus,
        symbol: row.symbol
      });
    }

    const needsPrice = pending.filter(({ price }) => price == null);
    const closesBySymbol = new Map<string, { date: Date; close: number }[]>();

    if (needsPrice.length > 0) {
      const closes = await this.prismaService.marketData.findMany({
        orderBy: { date: 'asc' },
        select: { date: true, marketPrice: true, symbol: true },
        where: {
          OR: needsPrice.map(({ dataSource, symbol }) => ({
            dataSource,
            symbol
          }))
        }
      });

      for (const close of closes) {
        const list = closesBySymbol.get(close.symbol) ?? [];
        list.push({ close: close.marketPrice, date: close.date });
        closesBySymbol.set(close.symbol, list);
      }
    }

    // Resolved per ENTRY, not per symbol: the same ticker can be exited more
    // than once, and keying the lookup by symbol alone would give both exits
    // whichever close happened to be written last.
    const reconstruct = (symbol: string, exitedAt: Date) => {
      const closes = closesBySymbol.get(symbol) ?? [];
      let found: number | undefined;

      for (const point of closes) {
        if (point.date > exitedAt) {
          break;
        }

        found = point.close;
      }

      return found;
    };

    return pending
      .map(({ exitedAt, price, rowId, status, symbol }) => {
        const exitPrice = price ?? reconstruct(symbol, exitedAt);

        // No recorded price and no stored close means the exit cannot be
        // priced at all. Leaving the lot open is the honest outcome — a
        // fabricated exit price would silently invent a return.
        return exitPrice == null
          ? null
          : {
              exitPrice,
              exitedAt,
              reconstructed: price == null,
              rowId,
              status
            };
      })
      .filter((exit): exit is NonNullable<typeof exit> => exit !== null);
  }

  /**
   * Fetches every symbol's stored daily closes touched by `trades`, from the
   * earliest buy date onward — the source data buildPerformanceSeries marks
   * open trades to market against, day by day.
   *
   * Takes only the three fields it reads rather than a whole SimulatedTrade, so
   * the order-derived and watch-derived trades can be passed without a cast.
   */
  private async fetchMarketDataBySymbol(
    trades: Pick<PerformanceSeriesTrade, 'buyDate' | 'dataSource' | 'symbol'>[]
  ): Promise<Map<string, { date: string; close: number }[]>> {
    const bySymbol = new Map<string, { date: string; close: number }[]>();

    if (trades.length === 0) {
      return bySymbol;
    }

    const earliestBuyDate = trades.reduce(
      (earliest, trade) =>
        trade.buyDate < earliest ? trade.buyDate : earliest,
      trades[0].buyDate
    );

    const keys = new Set(
      trades.map((trade) => `${trade.dataSource}:${trade.symbol}`)
    );

    const rows = await this.prismaService.marketData.findMany({
      orderBy: { date: 'asc' },
      select: { dataSource: true, date: true, marketPrice: true, symbol: true },
      where: {
        date: { gte: new Date(earliestBuyDate) },
        OR: [...keys].map((key) => {
          const [dataSource, symbol] = key.split(':') as [DataSource, string];

          return { dataSource, symbol };
        })
      }
    });

    for (const row of rows) {
      const key = `${row.dataSource}:${row.symbol}`;
      const list = bySymbol.get(key) ?? [];
      list.push({
        close: row.marketPrice,
        date: row.date.toISOString().slice(0, 10)
      });
      bySymbol.set(key, list);
    }

    return bySymbol;
  }

  /**
   * S&P 500 (^GSPC) — a live, Redis-cached fetch (see OhlcService), never
   * added to the watchlist so it stays out of the signal-scoring universe.
   * `series` is normalized to % change from the close nearest `startDate`
   * (for the chart overlay, comparable against dip/reversal/trackedSeries);
   * `readout` is computed from the SAME fetched closes before that
   * truncation, so it can answer genuine 3M/6M/YTD/1Y trailing returns even
   * though the engine's own series can't yet. Never throws — `undefined` on
   * any failure, and the chart/readout simply omit the benchmark.
   */
  private async buildBenchmarkSeries(startDate: string): Promise<
    | {
        readout: Partial<Record<SimulationReadoutPeriod, number>>;
        series: LineChartItem[] | undefined;
      }
    | undefined
  > {
    try {
      const closes = await this.ohlcService.getDailyClosesWithDates(
        '^GSPC',
        '2y'
      );

      if (!closes) {
        return undefined;
      }

      return {
        readout: computeTrailingPriceReturns(closes),
        series: normalizeBenchmarkSeries(closes, startDate)
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Builds one simulated trade from a BUY row, closed against `sellRow` (a
   * logged SELL) or marked-to-market against `currentPrice` (still open).
   * Returns null ONLY when the BUY itself has no usable reference price —
   * every other gap (a transient live-quote failure on an OPEN trade, or a
   * rare missing price on the matched SELL row) still returns the trade with
   * the return-based fields left undefined, rather than dropping the row.
   * Every logged BUY signal must show up here; a temporary quote hiccup
   * shouldn't erase it from the table.
   */
  private buildSimulatedTrade({
    buyRow,
    currentPrice,
    now,
    sellRow,
    soldSymbols = new Set<string>()
  }: {
    buyRow: {
      createdAt: Date;
      currency: string | null;
      dataSource: DataSource;
      expectedValue: number | null;
      livePrice: number | null;
      metrics: Prisma.JsonValue | null;
      name: string | null;
      reachProbability: number | null;
      rsi: number | null;
      score: number | null;
      signalType: string | null;
      stopLoss: number | null;
      symbol: string;
      takeProfit: number | null;
    };
    currentPrice?: number;
    now: Date;
    sellRow?: { createdAt: Date; livePrice: number | null };
    /** Symbols with a real SELL order — the position is gone, whatever the log says. */
    soldSymbols?: Set<string>;
  }): SimulatedTrade | null {
    const buyPrice = buyRow.livePrice;

    if (!buyPrice) {
      return null;
    }

    const sellPrice = sellRow ? (sellRow.livePrice ?? undefined) : currentPrice;
    const sellDate = sellRow ? sellRow.createdAt : now;
    // Elapsed time never depends on price, so it's always known — only the
    // return-based fields below are conditional on a resolved sellPrice.
    const holdingDays = Math.max(
      1,
      differenceInCalendarDays(sellDate, buyRow.createdAt)
    );

    let grossReturnPct: number | undefined;
    let netReturnPct: number | undefined;
    let effectiveAnnualRatePct: number | undefined;

    if (sellPrice) {
      grossReturnPct = (sellPrice / buyPrice - 1) * 100;
      // OPEN: only the buy leg's fee has actually been paid; the sell fee is
      // only charged once a matching SELL is logged and the trade closes.
      const roundTripFeeUsd = sellRow
        ? this.roundTripCommission(
            SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD,
            buyRow.symbol
          )
        : this.commission(
            SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD,
            buyRow.symbol
          );
      const feeDragPct =
        (roundTripFeeUsd / SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD) * 100;
      netReturnPct = grossReturnPct - feeDragPct;
      effectiveAnnualRatePct =
        (Math.pow(1 + netReturnPct / 100, 365 / holdingDays) - 1) * 100;
    }

    // Real-buy tracking (see SignalTradeTrackingService) — absent for any
    // signal the user never actually acted on, which is the common case.
    const tracked = readTrackedMetrics(buyRow.metrics);

    const vsSignalPct =
      sellPrice != null
        ? round2(((sellPrice - buyPrice) / buyPrice) * 100)
        : undefined;
    const vsBuyPct =
      tracked?.realBuyPrice != null && sellPrice != null
        ? round2(
            ((sellPrice - tracked.realBuyPrice) / tracked.realBuyPrice) * 100
          )
        : undefined;

    return {
      assumedNotionalUsd: SIGNAL_SIMULATION_ASSUMED_NOTIONAL_USD,
      buyDate: buyRow.createdAt.toISOString(),
      buyPrice,
      currency: buyRow.currency ?? undefined,
      expectedValueAtBuy: buyRow.expectedValue ?? undefined,
      // Only meaningful while still OPEN — once closed, sellPrice IS the exit.
      currentPrice: sellRow ? undefined : currentPrice,
      dataSource: buyRow.dataSource,
      effectiveAnnualRatePct:
        effectiveAnnualRatePct != null
          ? round2(effectiveAnnualRatePct)
          : undefined,
      grossReturnPct:
        grossReturnPct != null ? round2(grossReturnPct) : undefined,
      holdingDays,
      name: buyRow.name ?? undefined,
      netReturnPct: netReturnPct != null ? round2(netReturnPct) : undefined,
      reachProbabilityAtBuy: buyRow.reachProbability ?? undefined,
      realBuyDate: tracked?.realBuyDate ?? undefined,
      realBuyPrice: tracked?.realBuyPrice ?? undefined,
      rsiAtBuy: buyRow.rsi ?? undefined,
      scoreAtBuy: buyRow.score ?? undefined,
      sellDate: sellRow ? sellRow.createdAt.toISOString() : undefined,
      sellPrice: sellRow ? sellPrice : undefined,
      // An unrecognised type becomes UNTAGGED, never DIP.
      //
      // This fallback used to be 'DIP', on the reasoning that every row written
      // before signalType existed was a dip. That was true once and became the
      // single most misleading line in the file: it silently relabelled every
      // position the tracker typed as anything else — a BET, a LEADER, a
      // MANUAL — into the curve measuring the dip strategy, no matter what the
      // database said. Defaulting an unknown to a REAL category is how a
      // display bug becomes a wrong measurement.
      signalType: KNOWN_SIGNAL_TYPES.has(buyRow.signalType ?? '')
        ? (buyRow.signalType as SimulatedTrade['signalType'])
        : 'UNTAGGED',
      status: resolveTradeStatus({
        exitSignalled: EXITED_TRACKED_STATUSES.has(
          tracked?.trackedStatus ?? ''
        ),
        purchased: tracked != null,
        sold: sellRow != null || soldSymbols.has(buyRow.symbol)
      }),
      stopLoss: buyRow.stopLoss ?? undefined,
      symbol: buyRow.symbol,
      takeProfit: buyRow.takeProfit ?? undefined,
      tracked: tracked != null,
      trackedPeakPrice: tracked?.trackedPeakPrice ?? undefined,
      trackedStatus: tracked?.trackedStatus ?? undefined,
      vsBuyPct,
      vsSignalPct
    };
  }

  /** Lists the persisted per-symbol signal configuration for a user. */
  public getSignalConfigList(userId: string) {
    return this.prismaService.signalConfig.findMany({
      orderBy: [{ symbol: 'asc' }],
      where: { userId }
    });
  }

  /** Creates or updates the signal configuration for a symbol. */
  public updateSignalConfig({
    buyDropPct,
    cashThreshold,
    dataSource,
    excludeFromTracking,
    isActiveTrade,
    symbol,
    takeProfitPct,
    userId
  }: {
    buyDropPct?: number;
    cashThreshold?: number;
    dataSource: DataSource;
    excludeFromTracking?: boolean;
    isActiveTrade?: boolean;
    symbol: string;
    takeProfitPct?: number;
    userId: string;
  }) {
    const update: Prisma.SignalConfigUpdateInput = {};

    if (buyDropPct !== undefined) {
      update.buyDropPct = buyDropPct;
    }
    if (cashThreshold !== undefined) {
      update.cashThreshold = cashThreshold;
    }
    if (excludeFromTracking !== undefined) {
      update.excludeFromTracking = excludeFromTracking;
    }
    if (isActiveTrade !== undefined) {
      update.isActiveTrade = isActiveTrade;
    }
    if (takeProfitPct !== undefined) {
      update.takeProfitPct = takeProfitPct;
    }

    return this.prismaService.signalConfig.upsert({
      create: {
        buyDropPct: buyDropPct ?? SIGNAL_DEFAULT_BUY_DROP_PCT,
        cashThreshold: cashThreshold ?? null,
        dataSource,
        excludeFromTracking: excludeFromTracking ?? false,
        isActiveTrade: isActiveTrade ?? false,
        symbol,
        takeProfitPct: takeProfitPct ?? SIGNAL_DEFAULT_TAKE_PROFIT_PCT,
        userId
      },
      update,
      where: {
        userId_dataSource_symbol: { dataSource, symbol, userId }
      }
    });
  }

  /** Evaluates signals for every non-demo user (used by the scheduled job). */
  public async evaluateAllUsers(): Promise<void> {
    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    for (const { id } of users) {
      try {
        await this.evaluateAndNotify(id);
      } catch (error) {
        this.logger.error(
          `Failed to evaluate trading signals for user ${id}`,
          error
        );
      }
    }
  }

  /** Sends the heartbeat portfolio report for every non-demo user. */
  public async sendReportToAllUsers(): Promise<void> {
    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    for (const { id } of users) {
      try {
        await this.sendPortfolioReport(id);
      } catch (error) {
        this.logger.error(
          `Failed to send portfolio report for user ${id}`,
          error
        );
      }
    }
  }

  /** Computes and pushes the heartbeat report to Telegram for one user. */
  public async sendPortfolioReport(userId: string): Promise<void> {
    const report = await this.computePortfolioReport(userId);

    if (report.rows.length === 0) {
      return;
    }

    await this.telegramBotService.sendMessage(this.formatReportMessage(report));
  }

  /**
   * Builds a read-only snapshot of every owned holding: live price (native +
   * base currency), day/week change, and change vs the average buy price. Used
   * by the 4-hour heartbeat report and available for an API/PWA view.
   */
  public async computePortfolioReport(
    userId: string
  ): Promise<PortfolioReport> {
    const baseCurrency = await this.getUserCurrency(userId);
    const universe = await this.getUniverse(userId, baseCurrency);
    const owned = universe.filter((entry) => entry.owned);

    const report: PortfolioReport = {
      baseCurrency,
      rows: [],
      totalValueInBaseCurrency: 0
    };

    if (owned.length === 0) {
      return report;
    }

    const items = owned.map(({ dataSource, symbol }) => {
      return { dataSource, symbol };
    });

    const [quotes, historyBySymbol] = await Promise.all([
      this.dataProviderService.getQuotes({ items, useCache: true }),
      this.getHistory(items)
    ]);

    for (const entry of owned) {
      const livePrice = quotes[entry.symbol]?.marketPrice;

      if (!livePrice) {
        continue;
      }

      // Trading days only, so computeChanges' "5 bars back" is a real
      // trading week rather than ~3.5 sessions.
      const closes = toTradingDayCloses(historyBySymbol[entry.symbol] ?? []);
      const { dayChangePct, weekChangePct } = this.computeChanges(
        closes,
        livePrice
      );

      const livePriceInBaseCurrency = this.exchangeRateDataService.toCurrency(
        livePrice,
        entry.currency,
        baseCurrency
      );
      const valueInBaseCurrency = livePriceInBaseCurrency * entry.quantity;

      report.rows.push({
        currency: entry.currency,
        dataSource: entry.dataSource,
        dayChangePct,
        livePrice,
        livePriceInBaseCurrency,
        name: entry.name,
        referenceChangePct: entry.averageBuyPrice
          ? livePrice / entry.averageBuyPrice - 1
          : undefined,
        symbol: entry.symbol,
        valueInBaseCurrency,
        weekChangePct
      });

      report.totalValueInBaseCurrency += valueInBaseCurrency;
    }

    // Rank by base-currency position size (largest exposure first).
    report.rows.sort((a, b) => b.valueInBaseCurrency - a.valueInBaseCurrency);

    return report;
  }

  /**
   * Day change (vs the previous close) and week change (vs the close ~5 trading
   * days ago) relative to the live price. Returns fractions, or undefined when
   * there is not enough history.
   */
  private computeChanges(
    closes: number[],
    livePrice: number
  ): { dayChangePct?: number; weekChangePct?: number } {
    const previousClose = closes[closes.length - 1];
    const weekAgoClose = closes[closes.length - 6];

    return {
      dayChangePct:
        previousClose > 0 ? livePrice / previousClose - 1 : undefined,
      weekChangePct: weekAgoClose > 0 ? livePrice / weekAgoClose - 1 : undefined
    };
  }

  /**
   * Resolves a news-sentiment score for the BUY gate, but only for symbols that
   * could actually buy: skips active-trade exits (news isn't used there) and
   * non-dipping names (price above the fixed buy reference, so no BUY possible).
   * Returns null when news is unconfigured / uncovered (gate then skipped).
   */
  private async resolveNewsScore({
    closes,
    config,
    entry,
    livePrice
  }: {
    closes: number[];
    config: SignalConfigResolved;
    entry: UniverseItem;
    livePrice: number;
  }): Promise<number | null> {
    if (entry.owned && config.isActiveTrade) {
      return null;
    }

    if (!this.newsSentimentService.isConfigured()) {
      return null;
    }

    const recentHigh = Math.max(
      this.indicatorsService.highestClose(closes, 30) ?? livePrice,
      livePrice
    );

    // buyLevel is always <= recentHigh × (1 − buyDropPct); if price is above that
    // cheap reference there is no possible BUY, so don't spend a news request.
    if (livePrice > recentHigh * (1 - config.buyDropPct)) {
      return null;
    }

    const news = await this.newsSentimentService.getScore(entry.symbol);

    return news?.score ?? null;
  }

  /**
   * Fundamentals-overlay score, gated the same way as news: only for genuinely
   * dipping symbols, so the daily Yahoo `quoteSummary` volume stays bounded to
   * a handful of names per run (the 24h Redis cache carries the rest). It is
   * a second, independent signal shown alongside the technical score — not a
   * BUY gate, not yet folded into expected-value ranking.
   */
  private async resolveFundamentalsScore({
    closes,
    config,
    entry,
    livePrice
  }: {
    closes: number[];
    config: SignalConfigResolved;
    entry: UniverseItem;
    livePrice: number;
  }): Promise<number | null> {
    if (entry.owned && config.isActiveTrade) {
      return null;
    }

    const recentHigh = Math.max(
      this.indicatorsService.highestClose(closes, 30) ?? livePrice,
      livePrice
    );

    if (livePrice > recentHigh * (1 - config.buyDropPct)) {
      return null;
    }

    const snapshot = await this.fundamentalsService.getSnapshot(entry.symbol);

    return snapshot ? this.fundamentalsService.computeScore(snapshot) : null;
  }

  private evaluateSymbol({
    baseCurrency,
    cashBalance,
    closes,
    config,
    entry,
    fundamentalsScore = null,
    isTrackedLive = false,
    livePrice,
    newsScore = null,
    priorTrailingPeak,
    reversal,
    volatilityOverride,
    volumeRatio
  }: {
    baseCurrency: string;
    cashBalance: number;
    closes: number[];
    config: SignalConfigResolved;
    entry: UniverseItem;
    fundamentalsScore?: number | null;
    /** A real, still-open tracked trade already owns this position's exit. */
    isTrackedLive?: boolean;
    livePrice: number;
    newsScore?: number | null;
    priorTrailingPeak: number | null;
    reversal?: { isReversal: boolean; rsi: number | null };
    volatilityOverride?: number;
    volumeRatio?: number;
  }): SymbolEvaluation {
    const snapshot = this.indicatorsService.computeSnapshot(closes);
    const score = this.indicatorsService.computeScore(snapshot);
    const recentHigh = Math.max(
      this.indicatorsService.highestClose(closes, 30) ?? livePrice,
      livePrice
    );

    const base: TradingSignal = {
      assetSubClass: entry.assetSubClass ?? undefined,
      averageBuyPrice: entry.averageBuyPrice ?? undefined,
      baseCurrency,
      category: 'HOLD',
      currency: entry.currency,
      dataSource: entry.dataSource,
      livePrice,
      // Normalize to the base currency (USD) so candidates rank like-for-like.
      livePriceInBaseCurrency: this.exchangeRateDataService.toCurrency(
        livePrice,
        entry.currency,
        baseCurrency
      ),
      name: entry.name,
      quantity: entry.owned ? entry.quantity : undefined,
      reason: '',
      score,
      // Indicator snapshot carried on every signal (audit trail / analytics).
      bollingerPctB: snapshot.bollinger?.pctB,
      macdHistogram: snapshot.macd?.histogram,
      rsi: snapshot.rsi,
      sma200: snapshot.sma200 ?? undefined,
      symbol: entry.symbol
    };

    // Active trades are managed entirely by the exit state machine (stop-loss /
    // horizon take-profit / trailing). Core (non-active-trade) holdings skip
    // this and may still surface a dip-buy below.
    //
    // A position with a live tracked trade is deliberately excluded: that
    // system already owns the exit, anchored to the real fill price (see
    // getLiveTrackedKeys). Without this guard both would watch the same
    // holding with different levels and each raise its own SELL. Skipping
    // here makes the position behave like any other tracked holding — no
    // engine-side exit, still eligible for a dip-buy below.
    if (
      entry.owned &&
      config.isActiveTrade &&
      entry.averageBuyPrice &&
      !isTrackedLive
    ) {
      return this.evaluateExit({
        base,
        closes,
        config,
        entry,
        livePrice,
        priorTrailingPeak,
        // Prefer the OHLC Yang-Zhang estimate for the real stop/target/trail
        // bands; fall back to close-to-close when OHLC isn't available.
        volatility: volatilityOverride ?? snapshot.volatility
      });
    }

    // BUY: a confirmed dip — below the adaptive buy level, not in a downtrend,
    // composite score strong enough, today an up-day (reversal confirmation),
    // and news sentiment not negative (skipped when no news data).
    const buyLevel = this.indicatorsService.adaptiveBuyLevel({
      dropPct: config.buyDropPct,
      horizonDays: SIGNAL_HORIZON_DAYS,
      price: livePrice,
      recentHigh,
      sigmaMult: config.buySigmaMult,
      volatility: snapshot.volatility
    });
    const previousClose = closes[closes.length - 1];
    const isUpDay = !(previousClose > 0) || livePrice > previousClose;
    const scoreOk = score >= SIGNAL_BUY_SCORE_MIN;
    const newsOk = newsScore === null || newsScore >= SIGNAL_NEWS_BUY_FLOOR;
    const isDowntrend = this.indicatorsService.isDowntrend(snapshot);
    const candidateDropPct = (1 - livePrice / recentHigh) * 100;
    const isBuyZone =
      livePrice <= buyLevel && !isDowntrend && scoreOk && isUpDay && newsOk;

    // Per-trade payoff geometry (same bands the exit machine uses): the upside
    // target gain and the downside stop, as fractions — for the expected-value
    // ranking. annualVol is a liquidity/risk proxy (a cap excludes wild names).
    const band = snapshot.volatility * Math.sqrt(SIGNAL_HORIZON_DAYS);
    const targetGainPct = Math.max(
      SIGNAL_TAKE_PROFIT_FLOOR_PCT,
      SIGNAL_TAKE_PROFIT_VOL_MULT * band
    );
    const stopLossPct = SIGNAL_STOP_VOL_MULT * band;
    const annualVol = this.forecastService.annualise(snapshot.volatility);

    // Analytic TERMINAL probability of reaching the upside target over the
    // horizon — drift = 0 (the drift problem), so it is honest and comparable
    // across the whole universe. Cheap enough to compute for every stock.
    // Evaluated over the real expected HOLDING period, not the band-sizing
    // window: the target is a price level, and the honest question is whether
    // it is reached in the time the position is actually held.
    const returns = this.indicatorsService.logReturns(closes);
    const reachProbability =
      returns.length >= 2
        ? this.forecastService.reachProbability({
            dailyDrift: 0,
            dailyVolatility: this.forecastService.ewmaVolatility(returns),
            horizonDays: SIGNAL_FORECAST_HORIZON_DAYS,
            price: livePrice,
            target: livePrice * (1 + targetGainPct)
          })
        : 0;

    // Carry the payoff geometry / probability on the signal for logging + analytics.
    base.annualVol = annualVol;
    base.newsScore = newsScore ?? undefined;
    base.fundamentalsScore = fundamentalsScore ?? undefined;
    base.reachProbability = reachProbability;
    base.stopLossPct = stopLossPct;
    base.targetGainPct = targetGainPct;

    // Confirmed reversal of a downtrend = reversal structure + capitulation
    // volume (when volume data is available; flagged "vol n/a" otherwise).
    const reversalConfirmed =
      (reversal?.isReversal ?? false) &&
      (volumeRatio === undefined ||
        volumeRatio >= SIGNAL_REVERSAL_VOLUME_RATIO);

    // Every buyable stock becomes a candidate for the strategy EV ranking.
    const candidate: StrategyCandidate = {
      aboveSma200: snapshot.sma200 !== null && livePrice >= snapshot.sma200,
      annualVol,
      category: categoryForSymbol(entry.symbol),
      dropPct: candidateDropPct,
      fundamentalsScore: fundamentalsScore ?? undefined,
      isBuyZone,
      isDowntrend,
      isReversal: reversalConfirmed,
      name: entry.name,
      newsScore,
      pctB: snapshot.bollinger.pctB,
      priceInBase: base.livePriceInBaseCurrency,
      reachProbability,
      rsi: snapshot.rsi,
      score,
      stopLossPct,
      symbol: entry.symbol,
      targetGainPct,
      terPct: terPctForSymbol(entry.symbol) ?? undefined
    };

    if (isBuyZone) {
      const dropPct = candidateDropPct;
      const upPct =
        previousClose > 0 ? (livePrice / previousClose - 1) * 100 : 0;

      let suggestedAmount =
        cashBalance > 0
          ? this.forecastService.volatilityTargetedAmount({
              annualVolatility: this.forecastService.annualise(
                snapshot.volatility
              ),
              budget: cashBalance
            })
          : undefined;

      // Shrink the suggested size on negative (but above-floor) sentiment.
      if (suggestedAmount && newsScore !== null && newsScore < 0) {
        suggestedAmount =
          Math.round(suggestedAmount * Math.max(0.25, 1 + newsScore) * 100) /
          100;
      }

      const reasonParts = [
        `${entry.assetSubClass === AssetSubClass.ETF ? 'ETF dip: down' : 'Down'} ${dropPct.toFixed(1)}% off its 30-day high (buy zone <= ${buyLevel.toFixed(
          2
        )} ${entry.currency})`,
        `score ${score}/100`,
        `up ${upPct.toFixed(1)}% today`
      ];

      if (newsScore !== null) {
        reasonParts.push(`news ${newsScore.toFixed(2)}`);
      }

      if (fundamentalsScore !== null) {
        reasonParts.push(`fundamentals ${fundamentalsScore}/100`);
      }

      return {
        candidate,
        enteredTrailing: false,
        nextTrailingPeak: null,
        signal: {
          ...base,
          ...this.attachForecast({ closes, livePrice, target: buyLevel }),
          adaptiveLevel: buyLevel,
          bearMarket: false,
          category: 'BUY',
          reason: `${reasonParts.join('; ')}.`,
          signalType: 'DIP',
          suggestedAmount
        }
      };
    }

    // REVERSAL BUY: a beaten-down / bear-market name showing a confirmed reversal
    // (RSI turning up from oversold + higher-low + reclaimed 20-day) and
    // capitulation volume. Higher-risk and clearly flagged.
    if (reversalConfirmed) {
      const dropPct = candidateDropPct;
      const volNote =
        volumeRatio === undefined
          ? 'volume n/a'
          : `volume ${volumeRatio.toFixed(1)}× avg`;
      const reasonParts = [
        `⚠️ REVERSAL (bear-market, counter-trend)`,
        `down ${dropPct.toFixed(1)}% off 30-day high`,
        `RSI turning up from oversold (${Math.round(reversal?.rsi ?? 0)})`,
        `reclaimed 20-day + higher-low`,
        volNote
      ];

      if (newsScore !== null) {
        reasonParts.push(`news ${newsScore.toFixed(2)}`);
      }

      if (fundamentalsScore !== null) {
        reasonParts.push(`fundamentals ${fundamentalsScore}/100`);
      }

      const suggestedAmount =
        cashBalance > 0
          ? this.forecastService.volatilityTargetedAmount({
              annualVolatility: annualVol,
              budget: cashBalance
            })
          : undefined;

      return {
        candidate,
        enteredTrailing: false,
        nextTrailingPeak: null,
        signal: {
          ...base,
          ...this.attachForecast({ closes, livePrice, target: livePrice }),
          adaptiveLevel: this.indicatorsService.sma(closes, 20) ?? livePrice,
          bearMarket: true,
          category: 'BUY',
          reason: `${reasonParts.join('; ')}.`,
          signalType: 'REVERSAL',
          suggestedAmount
        }
      };
    }

    // Only surface HOLD rows for positions the user actually owns.
    if (entry.owned) {
      return {
        candidate,
        enteredTrailing: false,
        nextTrailingPeak: null,
        signal: { ...base, reason: 'Holding - no buy or sell trigger met.' }
      };
    }

    return {
      candidate,
      enteredTrailing: false,
      nextTrailingPeak: null,
      signal: null
    };
  }

  /**
   * Exit state machine for an owned active trade. Encodes two phases via the
   * persisted trailing peak: WATCHING (peak === null) reacts to the stop-loss
   * and take-profit target; TRAILING (peak !== null) rides the peak and exits
   * on a pullback. Returns the signal plus the next trailing peak to persist.
   */
  private evaluateExit({
    base,
    closes,
    config,
    entry,
    livePrice,
    priorTrailingPeak,
    volatility
  }: {
    base: TradingSignal;
    closes: number[];
    config: SignalConfigResolved;
    entry: UniverseItem;
    livePrice: number;
    priorTrailingPeak: number | null;
    volatility: number;
  }): SymbolEvaluation {
    const averageBuyPrice = entry.averageBuyPrice;
    // Distribute the round-trip commission across all held shares so the target
    // clears both the profit goal and commissions. The commission is a
    // percentage of position value, so it is derived from the real position.
    const positionValue = averageBuyPrice * entry.quantity;
    const roundTripFee = this.roundTripCommission(positionValue, entry.symbol);
    const feePerShare = entry.quantity > 0 ? roundTripFee / entry.quantity : 0;

    const target = this.indicatorsService.adaptiveTakeProfitLevel({
      averageBuyPrice,
      feePerShare,
      // Per-symbol takeProfitPct acts as an extra floor on top of the global one.
      floorPct: Math.max(SIGNAL_TAKE_PROFIT_FLOOR_PCT, config.takeProfitPct),
      horizonDays: SIGNAL_HORIZON_DAYS,
      volatility,
      volMult: SIGNAL_TAKE_PROFIT_VOL_MULT
    });
    const stop = this.indicatorsService.stopLossLevel({
      averageBuyPrice,
      horizonDays: SIGNAL_HORIZON_DAYS,
      volatility,
      volMult: SIGNAL_STOP_VOL_MULT
    });

    const totalFees = roundTripFee;
    const netGainPct = (price: number) =>
      (((price - averageBuyPrice) * entry.quantity - totalFees) /
        (averageBuyPrice * entry.quantity)) *
      100;

    // Hold-with-stop: no take-profit. A single wide peak-trailing stop lets
    // winners run; sell only when price falls SIGNAL_HOLD_TRAIL_PCT below the
    // running peak (cuts losses, locks big gains). The peak is persisted in
    // trailingPeak so it ratchets up across runs.
    if (SIGNAL_EXIT_MODE === 'hold-with-stop') {
      const peak = Math.max(priorTrailingPeak ?? averageBuyPrice, livePrice);
      const holdStop = peak * (1 - SIGNAL_HOLD_TRAIL_PCT);

      if (livePrice <= holdStop) {
        return {
          enteredTrailing: false,
          nextTrailingPeak: null,
          signal: {
            ...base,
            ...this.attachForecast({
              closes,
              livePrice,
              target: averageBuyPrice
            }),
            adaptiveLevel: holdStop,
            category: 'SELL',
            reason:
              livePrice > averageBuyPrice
                ? `🔒 Hold-stop: locking ${netGainPct(livePrice).toFixed(1)}% — pulled back ${Math.round(
                    SIGNAL_HOLD_TRAIL_PCT * 100
                  )}% from peak ${peak.toFixed(2)} ${entry.currency}.`
                : `🛑 Hold-stop: down to ${livePrice.toFixed(2)} ${entry.currency} (net ${netGainPct(
                    livePrice
                  ).toFixed(1)}%). Cut the loss.`
          }
        };
      }

      return {
        enteredTrailing: false,
        nextTrailingPeak: peak,
        signal: {
          ...base,
          adaptiveLevel: holdStop,
          reason:
            `Holding ${entry.symbol} (let it run): peak ${peak.toFixed(2)}, ` +
            `hold-stop ${holdStop.toFixed(2)} ${entry.currency} (net ${netGainPct(
              livePrice
            ).toFixed(1)}%).`
        }
      };
    }

    // WATCHING phase: no peak recorded yet.
    if (priorTrailingPeak === null) {
      if (livePrice <= stop) {
        return {
          enteredTrailing: false,
          nextTrailingPeak: null,
          signal: {
            ...base,
            ...this.attachForecast({ closes, livePrice, target: stop }),
            adaptiveLevel: stop,
            category: 'SELL',
            reason:
              `🛑 Stop-loss: down to ${livePrice.toFixed(2)} ${entry.currency} ` +
              `(net ${netGainPct(livePrice).toFixed(1)}% vs avg buy ${averageBuyPrice.toFixed(
                2
              )}). Cut the loss — stop at ${stop.toFixed(2)}.`
          }
        };
      }

      if (livePrice >= target) {
        const trail = this.indicatorsService.trailingStopLevel({
          horizonDays: SIGNAL_HORIZON_DAYS,
          peak: livePrice,
          volatility,
          volMult: SIGNAL_TRAIL_VOL_MULT
        });

        // Enter trailing: do not sell yet, ride the move; persist the peak.
        return {
          enteredTrailing: true,
          nextTrailingPeak: livePrice,
          signal: {
            ...base,
            adaptiveLevel: trail,
            category: 'HOLD',
            reason:
              `🎯 Target reached at ${livePrice.toFixed(2)} ${entry.currency} ` +
              `(net ${netGainPct(livePrice).toFixed(1)}%). Now trailing — ` +
              `will sell if it falls below ${trail.toFixed(2)}.`
          }
        };
      }

      return {
        enteredTrailing: false,
        nextTrailingPeak: null,
        signal: {
          ...base,
          reason:
            `Holding ${entry.symbol}: target ${target.toFixed(2)}, ` +
            `stop ${stop.toFixed(2)} ${entry.currency}.`
        }
      };
    }

    // TRAILING phase: ride the peak, exit on a pullback below the trailing stop.
    const peak = Math.max(priorTrailingPeak, livePrice);
    const trail = this.indicatorsService.trailingStopLevel({
      horizonDays: SIGNAL_HORIZON_DAYS,
      peak,
      volatility,
      volMult: SIGNAL_TRAIL_VOL_MULT
    });

    if (livePrice <= trail) {
      return {
        enteredTrailing: false,
        nextTrailingPeak: null,
        signal: {
          ...base,
          ...this.attachForecast({
            closes,
            livePrice,
            target: averageBuyPrice
          }),
          adaptiveLevel: trail,
          category: 'SELL',
          reason:
            `📉 Trailing exit: pulled back to ${livePrice.toFixed(2)} ` +
            `${entry.currency} from a peak of ${peak.toFixed(2)} ` +
            `(net ${netGainPct(livePrice).toFixed(1)}% vs avg buy). Lock in gains.`
        }
      };
    }

    return {
      enteredTrailing: false,
      nextTrailingPeak: peak,
      signal: {
        ...base,
        adaptiveLevel: trail,
        reason:
          `Trailing ${entry.symbol}: peak ${peak.toFixed(2)}, ` +
          `exit below ${trail.toFixed(2)} ${entry.currency} ` +
          `(net ${netGainPct(livePrice).toFixed(1)}%).`
      }
    };
  }

  private evaluateReinvest({
    cashBalance,
    configs,
    sellFired
  }: {
    cashBalance: number;
    configs: Map<string, StoredSignalConfig>;
    sellFired: boolean;
  }): TradingSignal | null {
    const configuredThresholds = [...configs.values()]
      .map(({ cashThreshold }) => cashThreshold)
      .filter((value): value is number => value !== null);

    const threshold =
      configuredThresholds.length > 0
        ? Math.min(...configuredThresholds)
        : SIGNAL_DEFAULT_CASH_THRESHOLD;

    if (cashBalance < threshold && !sellFired) {
      return null;
    }

    const indexAmount =
      Math.round(cashBalance * SIGNAL_INDEX_RATIO * 100) / 100;
    const stocksAmount = Math.round(cashBalance * 100) / 100 - indexAmount;

    return {
      category: 'REINVEST',
      dataSource: DataSource.MANUAL,
      livePrice: cashBalance,
      name: 'Cash',
      reason: sellFired
        ? `A sell signal fired and you hold cash. Deploy at your 80/20 target: ${indexAmount} to index funds, ${stocksAmount} to stocks.`
        : `Cash balance reached the reinvest threshold. Deploy at your 80/20 target: ${indexAmount} to index funds, ${stocksAmount} to stocks.`,
      suggestedAmount: cashBalance,
      symbol: 'REINVEST'
    };
  }

  private attachForecast({
    closes,
    livePrice,
    target
  }: {
    closes: number[];
    livePrice: number;
    target: number;
  }): Partial<TradingSignal> {
    const returns = this.indicatorsService.logReturns(closes);

    if (returns.length < 2) {
      return {};
    }

    const dailyVolatility = this.forecastService.ewmaVolatility(returns);

    // Drift estimated from a short history is dominated by noise ("the drift
    // problem") and biases probabilities toward whatever just ran up. For the
    // probability/band math we set drift = 0 (a risk-neutral, honest baseline).
    // We also use the analytic TERMINAL probability everywhere (P[end >= target])
    // — never the Monte-Carlo touch probability — so signals and strategies are
    // directly comparable.
    // Both are forecast outputs shown to the user, so both run over the real
    // expected holding period rather than the band-sizing window.
    return {
      forecastBand: this.forecastService.expectedMoveBand({
        dailyDrift: 0,
        dailyVolatility,
        horizonDays: SIGNAL_FORECAST_HORIZON_DAYS,
        price: livePrice
      }),
      hitTargetProbability: this.forecastService.reachProbability({
        dailyDrift: 0,
        dailyVolatility,
        horizonDays: SIGNAL_FORECAST_HORIZON_DAYS,
        price: livePrice,
        target
      })
    };
  }

  private resolveConfig(
    configs: Map<string, StoredSignalConfig>,
    entry: UniverseItem
  ): SignalConfigResolved {
    const stored = configs.get(`${entry.dataSource}:${entry.symbol}`);

    // Asset-type-aware dip calibration: ETFs get a shallower floor and a
    // narrower sigma band than stocks (see resolveBuyCalibration).
    const { buyDropPct, buySigmaMult } = resolveBuyCalibration({
      assetSubClass: entry.assetSubClass,
      storedBuyDropPct: stored?.buyDropPct
    });

    return {
      buyDropPct,
      buySigmaMult,
      cashThreshold: stored?.cashThreshold ?? null,
      isActiveTrade: stored?.isActiveTrade ?? false,
      takeProfitPct: stored?.takeProfitPct ?? SIGNAL_DEFAULT_TAKE_PROFIT_PCT
    };
  }

  private async getSignalConfigs(
    userId: string
  ): Promise<Map<string, StoredSignalConfig>> {
    const configs = await this.prismaService.signalConfig.findMany({
      where: { userId }
    });

    return new Map(
      configs.map((config) => [
        `${config.dataSource}:${config.symbol}`,
        {
          buyDropPct: config.buyDropPct,
          cashThreshold: config.cashThreshold,
          isActiveTrade: config.isActiveTrade,
          takeProfitPct: config.takeProfitPct
        }
      ])
    );
  }

  private async getUniverse(
    userId: string,
    baseCurrency: string
  ): Promise<UniverseItem[]> {
    const [{ activities }, watchlist] = await Promise.all([
      this.activitiesService.getActivities({
        userCurrency: baseCurrency,
        userId,
        types: [ActivityType.BUY, ActivityType.SELL]
      }),
      this.getWatchlist(userId)
    ]);

    const holdings = new Map<
      string,
      {
        assetSubClass: AssetSubClass | null;
        buyCost: number;
        buyQuantity: number;
        currency: string;
        dataSource: DataSource;
        name: string;
        netQuantity: number;
        symbol: string;
      }
    >();

    for (const activity of activities) {
      const profile = activity.SymbolProfile;

      if (!profile) {
        continue;
      }

      const key = `${profile.dataSource}:${profile.symbol}`;
      const next = holdings.get(key) ?? {
        assetSubClass: profile.assetSubClass ?? null,
        buyCost: 0,
        buyQuantity: 0,
        currency: profile.currency,
        dataSource: profile.dataSource,
        name: profile.name ?? profile.symbol,
        netQuantity: 0,
        symbol: profile.symbol
      };

      if (activity.type === ActivityType.BUY) {
        next.buyQuantity += activity.quantity;
        next.buyCost += activity.quantity * activity.unitPrice;
        next.netQuantity += activity.quantity;
      } else if (activity.type === ActivityType.SELL) {
        next.netQuantity -= activity.quantity;
      }

      holdings.set(key, next);
    }

    const universe = new Map<string, UniverseItem>();

    for (const [key, holding] of holdings) {
      if (holding.netQuantity <= 0) {
        continue;
      }

      universe.set(key, {
        assetSubClass: holding.assetSubClass,
        averageBuyPrice:
          holding.buyQuantity > 0
            ? holding.buyCost / holding.buyQuantity
            : null,
        currency: holding.currency,
        dataSource: holding.dataSource,
        name: holding.name,
        owned: true,
        quantity: holding.netQuantity,
        symbol: holding.symbol
      });
    }

    for (const item of watchlist) {
      const key = `${item.dataSource}:${item.symbol}`;

      if (!universe.has(key)) {
        universe.set(key, {
          assetSubClass: item.assetSubClass,
          averageBuyPrice: null,
          currency: item.currency,
          dataSource: item.dataSource,
          name: item.name,
          owned: false,
          quantity: 0,
          symbol: item.symbol
        });
      }
    }

    return [...universe.values()];
  }

  private async getWatchlist(userId: string): Promise<
    {
      assetSubClass: AssetSubClass | null;
      currency: string;
      dataSource: DataSource;
      name: string;
      sector: string | null;
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
            sectors: true,
            symbol: true
          }
        }
      },
      where: { id: userId }
    });

    return (
      user?.watchlist.map((profile) => ({
        assetSubClass: profile.assetSubClass ?? null,
        currency: profile.currency,
        dataSource: profile.dataSource,
        name: profile.name ?? profile.symbol,
        sector: primarySector(profile.sectors),
        symbol: profile.symbol
      })) ?? []
    );
  }

  /**
   * Live technical-indicator snapshot for a set of symbols, independent of the
   * BUY/SELL state machine (so it covers every watchlist entry, not just
   * owned/buy-zone ones). Cheap by design: no news/volume/OHLC fetches, only
   * the close-price history already cached for the signal engine.
   */
  /**
   * Minervini leader-screen fields for one symbol.
   *
   * Presented as a research surface in the watchlist, NOT as a buy trigger. The
   * event study run on 2026-08-21 found that breakout entries did not beat the
   * universe base rate at 21/63/126 days (t = -1.28 / -0.19 / +0.90), while the
   * existing DIP entry did (t = +3.07 / +4.66 / +4.24). The Trend Template does
   * show a real 126-day edge on its own (+1.45pp, t = 4.11), so it earns its
   * place as context — but the numbers do not yet justify firing on it.
   */
  private computeLeaderScreen({
    bars,
    livePrice,
    rsRank
  }: {
    bars: Bar[];
    livePrice?: number;
    rsRank: number | null;
  }): Partial<WatchlistMetric> {
    if (bars.length === 0) {
      return {};
    }

    const trend = this.leaderScreenService.trendTemplate({ bars, rsRank });
    const vcp = this.leaderScreenService.vcpStructure(bars);
    const rankedClose = bars[bars.length - 1].close;

    const screen: Partial<WatchlistMetric> = {
      // Everything else in this object is measured on `bars`, i.e. on the last
      // settled close. The row also carries a live price, so the distance
      // between the two is the one number that says how much has happened since
      // the screen was struck — see gapSinceRsAsOf.
      gapSinceRsAsOf:
        livePrice && rankedClose > 0 ? livePrice / rankedClose - 1 : undefined,
      rsRank: rsRank ?? undefined,
      trendTemplatePasses: trend?.passCount
    };

    if (!vcp) {
      return screen;
    }

    if (!vcp.isValid) {
      return { ...screen, vcpRejectedReason: vcp.rejectedReason ?? undefined };
    }

    const price = bars[bars.length - 1].close;

    return {
      ...screen,
      vcpContractions: vcp.contractions.length,
      vcpDepthsPct: vcp.contractions.map(({ depthPct }) =>
        Number((depthPct * 100).toFixed(1))
      ),
      vcpPivot: vcp.pivot,
      vcpPivotDistancePct:
        vcp.pivot > 0 ? (price - vcp.pivot) / vcp.pivot : undefined,
      vcpStatus: vcp.status,
      vcpVolumeRatio: vcp.breakoutVolumeRatio,
      // Only meaningful on a valid base: vcpStructure's rejection path reports
      // dryUpRatio 0, which reads as "extremely dry" rather than "not measured".
      vcpDryUpRatio: vcp.dryUpRatio
    };
  }

  /**
   * FX factors for the handful of (currency, date) pairs an RS pass needs.
   *
   * Relative strength ranks names quoted in ten different currencies against
   * each other. Comparing raw local-currency returns ranks a stock partly on
   * what its currency did, which is not strength — so both ends of every window
   * are converted into one numéraire first.
   *
   * USD, fixed, rather than the user's base currency: the ranking is published
   * to a single shared cache and read by everyone, so a user-dependent numéraire
   * would make one reader's percentiles wrong. Only consistency matters for a
   * ranking; the choice of unit does not.
   *
   * Precomputed because `toCurrencyAtDate` is async and DB-backed. The windows
   * share their cutoff dates across the whole universe, so this is ten
   * currencies times five dates — not one lookup per bar.
   */
  private async buildRsFxFactors({
    asOf,
    currencies
  }: {
    asOf: string | null;
    currencies: string[];
  }): Promise<{ factors: Map<string, number>; lookup: FxFactorLookup }> {
    const factors = new Map<string, number>();
    const lookup: FxFactorLookup = (currency, date) => {
      return factors.get(`${currency}:${date}`) ?? 1;
    };

    if (!asOf) {
      return { factors, lookup };
    }

    const dates = [
      asOf,
      ...[3, 6, 9, 12].map((months) => {
        return monthsBefore(asOf, months);
      })
    ];

    await Promise.all(
      currencies.map(async (currency) => {
        if (currency === DEFAULT_CURRENCY) {
          for (const date of dates) {
            factors.set(`${currency}:${date}`, 1);
          }

          return;
        }

        const resolved = await Promise.all(
          dates.map(async (date) => {
            try {
              return await this.exchangeRateDataService.toCurrencyAtDate(
                1,
                currency,
                DEFAULT_CURRENCY,
                new Date(`${date}T00:00:00.000Z`)
              );
            } catch {
              return undefined;
            }
          })
        );

        // All of a currency's boundaries or none of them. Converting one end of
        // a window and not the other would divide a USD price by a local one —
        // an error the size of the exchange rate itself, far worse than the
        // local-currency comparison this otherwise falls back to. The lookup
        // defaults to 1, so skipping a currency here simply leaves its names on
        // the footing they had before.
        if (resolved.some((factor) => !(factor > 0))) {
          return;
        }

        resolved.forEach((factor, index) => {
          factors.set(`${currency}:${dates[index]}`, factor);
        });
      })
    );

    return { factors, lookup };
  }

  /**
   * Publishes the cross-sectional RS map so per-symbol callers can read a rank
   * they cannot compute alone. Best-effort by design — see the call site.
   */
  private async publishRsRankMap({
    asOf,
    cohort,
    ranks
  }: {
    asOf: string | null;
    cohort: RsRankPublication['cohort'];
    ranks: { [symbol: string]: number };
  }): Promise<void> {
    const cohortSize = Object.keys(ranks).length;

    if (cohortSize === 0) {
      return;
    }

    const publication: RsRankPublication = {
      asOf,
      cohort,
      cohortSize,
      ranks
    };

    try {
      await this.redisCacheService.set(
        SIGNAL_RS_RANK_CACHE_KEY,
        JSON.stringify(publication),
        SIGNAL_RS_RANK_CACHE_TTL
      );
    } catch {
      // best-effort cache
    }
  }

  /**
   * Warms the Yahoo expense-ratio cache for symbols that missed it, OFF the
   * request path.
   *
   * Deliberately runs a small worker pool rather than a Promise.all: Yahoo
   * rate-limits bursts, and `getYahooEtfProfile`'s single retry is useless
   * when the burst that triggered the block is still in flight. A handful at
   * a time lets the retry actually succeed, which is what makes the cache
   * fill instead of churning.
   *
   * Never throws and is never awaited by a caller — a failure just means the
   * fee stays on its fallback until the next refresh.
   */
  private async refillYahooFeeCache(symbols: string[]) {
    const pending = symbols.filter((symbol) => {
      return !this.yahooFeeRefillInFlight.has(symbol);
    });

    if (pending.length === 0) {
      return;
    }

    for (const symbol of pending) {
      this.yahooFeeRefillInFlight.add(symbol);
    }

    const queue = [...pending];

    const worker = async () => {
      while (queue.length > 0) {
        const symbol = queue.shift();

        if (!symbol) {
          return;
        }

        try {
          // Result is discarded: this call's only job is to populate the
          // shared Redis cache that computeMetricsSnapshot reads from.
          await this.assetDetailService.getYahooEtfProfile(symbol);
        } catch {
          // getYahooEtfProfile has its own try/catch, but never let a
          // background warm-up surface an unhandled rejection.
        } finally {
          this.yahooFeeRefillInFlight.delete(symbol);
        }
      }
    };

    try {
      await Promise.all(
        Array.from(
          {
            length: Math.min(SIGNAL_YAHOO_FEE_REFILL_CONCURRENCY, queue.length)
          },
          () => worker()
        )
      );
    } finally {
      // Belt and braces: a worker that died before its finally ran must not
      // leave a symbol permanently marked in-flight.
      for (const symbol of pending) {
        this.yahooFeeRefillInFlight.delete(symbol);
      }
    }
  }

  private async computeMetricsSnapshot(
    items: {
      assetSubClass?: AssetSubClass | null;
      /** Quote currency, so relative strength can rank in one numéraire. */
      currency?: string;
      dataSource: DataSource;
      symbol: string;
    }[]
  ): Promise<Map<string, WatchlistMetric & { livePrice?: number }>> {
    const metrics = new Map<string, WatchlistMetric & { livePrice?: number }>();

    if (items.length === 0) {
      return metrics;
    }

    const [quotes, historyBySymbol, fundFacts, barsBySymbol] =
      await Promise.all([
        this.dataProviderService.getQuotes({ items, useCache: true }),
        this.getHistory(items),
        this.fundHistoryService.getFacts(),
        // Full OHLCV, for the leader-screen columns. Only YAHOO names have
        // bars; MANUAL funds are skipped and simply carry no screen fields.
        this.ohlcBarService.getBarsForSymbols({
          assetProfileIdentifiers: items.filter(
            ({ dataSource }) => dataSource === DataSource.YAHOO
          ),
          from: subDays(new Date(), SIGNAL_HISTORY_FETCH_DAYS)
        })
      ]);

    // Relative strength is cross-sectional, so it is computed once over the
    // whole universe rather than per symbol inside the loop.
    const rsAsOf = this.crossSectionalService.referenceDateFor({
      seriesBySymbol: barsBySymbol
    });
    const currencyBySymbol = Object.fromEntries(
      items
        .filter(({ currency }) => {
          return Boolean(currency);
        })
        .map(({ currency, symbol }) => {
          return [symbol, currency];
        })
    );
    const { lookup: rsFxFactor } = await this.buildRsFxFactors({
      asOf: rsAsOf,
      currencies: [...new Set(Object.values(currencyBySymbol))]
    });
    const rsRankBySymbol = this.crossSectionalService.rankMap({
      currencyBySymbol,
      fxFactor: rsFxFactor,
      seriesBySymbol: barsBySymbol
    });

    // Publish it for per-symbol readers that have no universe of their own —
    // AssetDetailService's Trend tab would otherwise have to re-rank every
    // watchlist name on each dialog open. Best-effort: a cache failure must not
    // fail the metrics refresh, and a missing rank degrades to "unranked".
    void this.publishRsRankMap({
      asOf: rsAsOf,
      cohort: 'watchlist',
      ranks: rsRankBySymbol
    });

    // Ongoing annual fee, resolved once per symbol before the loop: the
    // static ETF_TER_CATALOG only covers ~12 of the ~54 watchlist ETFs — for
    // any YAHOO item still missing a fee after the static/fund sources, fall
    // back to Yahoo's own real "Annual Report Expense Ratio (net)" (the same
    // live-fetched, cached Profile-page data already used for the Style Box,
    // see AssetDetailService.getYahooEtfProfile) so new ETFs get a real fee
    // automatically instead of needing a manual catalog entry.
    const yahooFeeBySymbol = new Map<string, number>();
    const needsYahooFee = items.filter(
      (item) =>
        item.dataSource === DataSource.YAHOO &&
        // Without this check every ordinary stock qualified too — ~700 of the
        // ~825 watched symbols — and each was scraped for a number that cannot
        // exist. Survivable at 280 symbols; the dominant cost of this method
        // once the universe grew past 800.
        canHaveExpenseRatio(item.assetSubClass) &&
        terPctForSymbol(item.symbol) == null &&
        fundFeeForSymbol(item.symbol) == null &&
        fundFacts[item.symbol]?.feePct == null &&
        fundFacts[item.symbol]?.productFeePct == null
    );

    if (needsYahooFee.length > 0) {
      // CACHE-ONLY on the request path. getYahooEtfProfile fetches a full
      // Yahoo Profile page with a 15s timeout plus a 1.5s-delayed retry, so a
      // single cold symbol can hold this method open for ~31s — and since
      // this used to run as one unbounded Promise.all, the caller waited for
      // the slowest of the whole set. An expense ratio changes about once a
      // year; it has no business blocking a page load. Misses are refilled in
      // the background and picked up by the next refresh.
      const misses: string[] = [];

      await Promise.all(
        needsYahooFee.map(async ({ symbol }) => {
          const profile =
            await this.assetDetailService.peekYahooEtfProfile(symbol);

          if (profile === undefined) {
            misses.push(symbol);
          } else if (profile.expenseRatioPct != null) {
            yahooFeeBySymbol.set(symbol, profile.expenseRatioPct);
          }
        })
      );

      if (misses.length > 0) {
        void this.refillYahooFeeCache(misses);
      }
    }

    for (const { symbol } of items) {
      const livePrice = quotes[symbol]?.marketPrice;
      const datedCloses = historyBySymbol[symbol] ?? [];
      // Trading days only for the indicator pipeline (SMA/RSI/MACD/σ); the
      // dated series still feeds computeSeriesMetrics, which is date-anchored
      // and handles its own filtering.
      const closes = toTradingDayCloses(datedCloses);

      if (!livePrice || closes.length === 0) {
        continue;
      }

      const snapshot = this.indicatorsService.computeSnapshot(closes);
      const score = this.indicatorsService.computeScore(snapshot);
      const annualVol = this.forecastService.annualise(snapshot.volatility);

      // Trailing returns: for MANUAL funds prefer Nordnet's official published
      // period returns (complete + authoritative; local NAV history only
      // accumulates forward), else compute from accumulated close history.
      const series = computeSeriesMetrics(datedCloses);
      const dev = fundFacts[symbol]?.developments;
      const pick = (official: number | undefined, computed: number | null) =>
        official ?? computed ?? undefined;

      // Ongoing annual fee: ETF TER catalog (stored as a FRACTION, e.g.
      // 0.0018 for 18bps — converted ×100 here to match the percent-number
      // convention every other source and the UI use, e.g. 0.2 = "0.2%";
      // this conversion was previously missing, so any ETF with only a
      // static catalog entry rendered as "0.00%"), else fund fee (Nordnet),
      // else Yahoo's real live-fetched expense ratio (see above).
      const catalogTerPct = terPctForSymbol(symbol);
      const feePct =
        (catalogTerPct != null ? catalogTerPct * 100 : undefined) ??
        fundFeeForSymbol(symbol) ??
        fundFacts[symbol]?.feePct ??
        fundFacts[symbol]?.productFeePct ??
        yahooFeeBySymbol.get(symbol);

      const band = snapshot.volatility * Math.sqrt(SIGNAL_HORIZON_DAYS);
      const targetGainPct = Math.max(
        SIGNAL_TAKE_PROFIT_FLOOR_PCT,
        SIGNAL_TAKE_PROFIT_VOL_MULT * band
      );
      const stopLossPct = SIGNAL_STOP_VOL_MULT * band;

      const returns = this.indicatorsService.logReturns(closes);
      // Band above sizes the levels; the probability of reaching them is a
      // forecast, so it runs over the real expected holding period.
      const reachProbability =
        returns.length >= 2
          ? this.forecastService.reachProbability({
              dailyDrift: 0,
              dailyVolatility: this.forecastService.ewmaVolatility(returns),
              horizonDays: SIGNAL_FORECAST_HORIZON_DAYS,
              price: livePrice,
              target: livePrice * (1 + targetGainPct)
            })
          : 0;

      const expectedValue =
        reachProbability * targetGainPct - (1 - reachProbability) * stopLossPct;

      const screen = this.computeLeaderScreen({
        bars: barsBySymbol[symbol] ?? [],
        livePrice,
        rsRank: rsRankBySymbol[symbol] ?? null
      });

      metrics.set(symbol, {
        ...screen,
        annualVol,
        bollingerPctB: snapshot.bollinger?.pctB,
        expectedValue,
        feePct: feePct ?? undefined,
        livePrice,
        macdHistogram: snapshot.macd?.histogram,
        reachProbability,
        return1mPct: pick(dev?.oneMonth, series.return1mPct),
        return1wPct: pick(dev?.oneWeek, series.return1wPct),
        return1yPct: pick(dev?.oneYear, series.return1yPct),
        return3mPct: pick(dev?.threeMonths, series.return3mPct),
        return6mPct: pick(dev?.sixMonths, series.return6mPct),
        rsi: snapshot.rsi,
        score,
        sma50: snapshot.sma50 ?? undefined,
        sma200: snapshot.sma200 ?? undefined
      });
    }

    return metrics;
  }

  /**
   * Nordnet commission for a single order, in USD.
   *
   * `fixed + pct x value` under the account's commission class, with a lower
   * fixed fee on Nordic venues. Both terms always apply. See
   * libs/common/src/lib/nordnet-fees.ts, which is the only place a fee figure
   * should ever live.
   */
  private commission(tradeValueUsd: number, symbol?: string): number {
    return nordnetCommissionUsd({
      commissionClass: SIGNAL_NORDNET_COMMISSION_CLASS,
      isNordic: symbol ? isNordicSymbol(symbol) : false,
      sekPerUsd: SIGNAL_SEK_PER_USD_FALLBACK,
      tradeValueUsd
    });
  }

  /** Buy + sell commission for a position of this size. */
  private roundTripCommission(tradeValueUsd: number, symbol?: string): number {
    return nordnetRoundTripUsd({
      commissionClass: SIGNAL_NORDNET_COMMISSION_CLASS,
      isNordic: symbol ? isNordicSymbol(symbol) : false,
      sekPerUsd: SIGNAL_SEK_PER_USD_FALLBACK,
      tradeValueUsd
    });
  }

  /**
   * The Trend Template shortlist: every name passing all 8 criteria, ranked by
   * quality.
   *
   * Deliberately does NOT require a VCP base, which is what separates it from
   * `computeLeaderCandidates`. Trend Template 8/8 is the one part of this
   * apparatus with a large-sample measured edge — +2.49pp at 126 days,
   * t=24.14, n=116,555 — and it is a statement about which names are worth
   * following over months, not about when to buy. Requiring a base would cut
   * 106 names to 3 and reintroduce the pivot timing the evidence rejects.
   *
   * Ranking is quality-first — RS, then the name's standing inside its peer
   * group, then how far it sits below its 52-week high. Distance to a pivot
   * appears nowhere, by design.
   */
  public async computeShortlist(userId: string): Promise<ShortlistResponse> {
    const universe = await this.getUniverse(userId, 'USD');
    const items = universe
      .filter(({ dataSource }) => dataSource === DataSource.YAHOO)
      .map(({ currency, dataSource, name, symbol }) => ({
        currency,
        dataSource,
        name,
        symbol
      }));

    const [barsBySymbol, quotes, profiles] = await Promise.all([
      this.ohlcBarService.getBarsForSymbols({
        assetProfileIdentifiers: items.map(({ dataSource, symbol }) => ({
          dataSource,
          symbol
        })),
        from: subDays(new Date(), SIGNAL_HISTORY_FETCH_DAYS)
      }),
      this.dataProviderService.getQuotes({
        items: items.map(({ dataSource, symbol }) => ({ dataSource, symbol })),
        useCache: true
      }),
      this.prismaService.symbolProfile.findMany({
        select: { sectors: true, symbol: true },
        where: { symbol: { in: items.map(({ symbol }) => symbol) } }
      })
    ]);

    // Same numéraire discipline as the other two ranking passes: this cohort
    // spans the same ten quote currencies, so ranking raw local returns would
    // rank part of the currency move as if it were strength.
    const shortlistCurrencyBySymbol = Object.fromEntries(
      items.map(({ currency, symbol }) => {
        return [symbol, currency];
      })
    );
    const { lookup: shortlistFxFactor } = await this.buildRsFxFactors({
      asOf: this.crossSectionalService.referenceDateFor({
        seriesBySymbol: barsBySymbol
      }),
      currencies: [...new Set(Object.values(shortlistCurrencyBySymbol))]
    });
    const rsRankBySymbol = this.crossSectionalService.rankMap({
      currencyBySymbol: shortlistCurrencyBySymbol,
      fxFactor: shortlistFxFactor,
      seriesBySymbol: barsBySymbol
    });

    // Peer group per symbol, reusing the same helper the pre-buy screen uses so
    // "Energy" means the same thing in both places.
    const groupBySymbol: { [symbol: string]: string | null } = {};

    for (const { sectors, symbol } of profiles) {
      groupBySymbol[symbol] = peerGroupFor({
        category: categoryForSymbol(symbol),
        sector: primarySector(sectors)
      });
    }

    const peerRanks = this.crossSectionalService.peerRankMap({
      groupBySymbol,
      rankBySymbol: rsRankBySymbol
    });

    // Group direction, from the same 3-month returns the pre-buy screen uses.
    const returnsByGroup = new Map<string, number[]>();

    for (const [symbol, group] of Object.entries(groupBySymbol)) {
      const bars = barsBySymbol[symbol];

      if (!group || !bars?.length) {
        continue;
      }

      const metrics = computeSeriesMetrics(
        bars.map(({ close, date }) => ({ close, date }))
      );

      if (metrics.return3mPct != null) {
        returnsByGroup.set(group, [
          ...(returnsByGroup.get(group) ?? []),
          metrics.return3mPct
        ]);
      }
    }

    const tailwindByGroup = new Map<
      string,
      ReturnType<typeof classifySectorTailwind>
    >();

    for (const [group, returns] of returnsByGroup) {
      tailwindByGroup.set(group, classifySectorTailwind(returns));
    }

    const entries: ShortlistEntry[] = [];
    let evaluated = 0;

    for (const item of items) {
      const bars = barsBySymbol[item.symbol] ?? [];

      if (bars.length === 0) {
        continue;
      }

      evaluated++;

      const trend = this.leaderScreenService.trendTemplate({
        bars,
        rsRank: rsRankBySymbol[item.symbol] ?? null
      });

      if (!trend?.passed) {
        continue;
      }

      const peer = peerRanks[item.symbol];
      const vcp = this.leaderScreenService.vcpStructure(bars);

      entries.push({
        belowHighPct: trend.belowHighPct,
        currency: item.currency,
        dataSource: item.dataSource,
        name: item.name,
        peerGroup: peer?.group,
        peerGroupPercentile: peer?.groupPercentile ?? undefined,
        peerRank: peer?.rankInGroup,
        peerSize: peer?.groupSize,
        price: quotes[item.symbol]?.marketPrice ?? bars[bars.length - 1].close,
        rsRank: trend.rsRank ?? undefined,
        sectorTailwind: peer?.group
          ? (tailwindByGroup.get(peer.group) ?? undefined)
          : undefined,
        symbol: item.symbol,
        vcpStatus: vcp?.isValid ? vcp.status : undefined
      });
    }

    // Quality first. Pivot distance is deliberately not a term here.
    entries.sort(
      (a, b) =>
        (b.rsRank ?? 0) - (a.rsRank ?? 0) ||
        (b.peerGroupPercentile ?? 0) - (a.peerGroupPercentile ?? 0) ||
        (a.peerRank ?? 99) - (b.peerRank ?? 99) ||
        a.belowHighPct - b.belowHighPct
    );

    const breadth = await this.marketBreadthService.get(barsBySymbol);

    return {
      breadth: breadth
        ? {
            breadth: breadth.breadth,
            healthy: breadth.healthy,
            total: breadth.total
          }
        : undefined,
      entries,
      evaluated,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Runs the entrant alert if today's slot has passed unserved.
   *
   * The same reason the leader screen needed one: a @nestjs/schedule cron does
   * not catch up, and this machine is a laptop that is regularly asleep at
   * 07:00. Shipping a daily alert without this would reproduce, exactly, the
   * bug that meant no leader signal ever arrived.
   *
   * Entrant detection is state-based rather than time-based — a name is fresh
   * if its cooldown has elapsed — so running late costs nothing but the delay.
   */
  public async sendTrendTemplateEntrantsIfDue(): Promise<number> {
    const today = format(new Date(), 'yyyy-MM-dd');
    const lastRunAt = await this.propertyService.getByKey<string>(
      PROPERTY_TT8_ENTRANTS_LAST_RUN
    );

    if (lastRunAt === today) {
      return 0;
    }

    const sent = await this.sendTrendTemplateEntrantsToAllUsers();

    await this.propertyService.put({
      key: PROPERTY_TT8_ENTRANTS_LAST_RUN,
      value: JSON.stringify(today)
    });

    return sent;
  }

  /**
   * Runs the entrant alert for every real user.
   *
   * One user's failure must not silence the others, so each is wrapped — the
   * same shape `sendLeaderCandidatesToAllUsers` uses.
   */
  public async sendTrendTemplateEntrantsToAllUsers(): Promise<number> {
    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    // First run after the bars started advancing again sees every crossing
    // missed while `OhlcBar` was frozen, all at once. Those are real 8/8 names
    // but days-old entries whose pivot has already moved, so they are recorded
    // as the baseline and not sent. Live alerting resumes on the next run.
    const seeded = await this.propertyService.getByKey<string>(
      PROPERTY_TT8_BASELINE_SEEDED
    );
    const seedOnly = !seeded;

    let sent = 0;

    for (const { id } of users) {
      try {
        sent += await this.sendTrendTemplateEntrants(id, { seedOnly });
      } catch (error) {
        this.logger.error(
          `Trend Template entrants failed for user ${id}`,
          error
        );
      }
    }

    if (seedOnly) {
      await this.propertyService.put({
        key: PROPERTY_TT8_BASELINE_SEEDED,
        value: JSON.stringify(new Date().toISOString())
      });

      this.logger.log(
        `Trend Template entrants - baseline seeded with ${sent} name(s), nothing sent`
      );

      return 0;
    }

    this.logger.log(`Trend Template entrants - ${sent} name(s) alerted`);

    return sent;
  }

  /** SignalState key for a Trend Template entrant's cooldown. */
  private getTrendTemplateKey({
    dataSource,
    symbol
  }: {
    dataSource: DataSource;
    symbol: string;
  }) {
    return `TT8:${dataSource}:${symbol}`;
  }

  /**
   * Alerts names that have just entered Trend Template 8/8 at RS >= 90.
   *
   * An ENTRANT alert, not a daily list. Measured over 94 trading days across
   * 752 names, new 8/8 entrants arrive at a mean of 13.4/day and spike to 142
   * when the cross-section re-ranks — unreadable within a week. Restricted to
   * RS >= 90 the same series is a mean of 3.9, a median of 2, and silent on 28
   * of 94 days.
   *
   * Entrants are recorded under category 'WATCH', NOT 'BUY': `computeSimulation`
   * only reads BUY/SELL, so these appear in the Analytics log without creating
   * ~1,000 phantom positions a year in the Simulation. A TT8 line is drawn only
   * from lots the user actually opened.
   */
  public async sendTrendTemplateEntrants(
    userId: string,
    { seedOnly = false }: { seedOnly?: boolean } = {}
  ): Promise<number> {
    const response = await this.computeShortlist(userId);

    const qualifying = response.entries.filter(({ rsRank }) => {
      return (rsRank ?? 0) >= SIGNAL_TT8_ALERT_MIN_RS;
    });

    if (qualifying.length === 0) {
      return 0;
    }

    const states = await this.prismaService.signalState.findMany({
      where: {
        key: {
          in: qualifying.map((entry) => this.getTrendTemplateKey(entry))
        },
        userId
      }
    });
    const lastNotifiedByKey = new Map(
      states.map(({ key, lastNotifiedAt }) => [key, lastNotifiedAt])
    );

    const now = new Date();
    const cooldownMs = SIGNAL_TT8_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    const fresh = qualifying.filter((entry) => {
      const lastNotifiedAt = lastNotifiedByKey.get(
        this.getTrendTemplateKey(entry)
      );

      return (
        !lastNotifiedAt ||
        now.getTime() - lastNotifiedAt.getTime() >= cooldownMs
      );
    });

    if (fresh.length === 0) {
      return 0;
    }

    // Seeding still writes the cooldowns — that is the whole point, so these
    // names are the baseline rather than tomorrow's "new" entrants.
    if (!seedOnly) {
      await this.telegramBotService.sendMessage(
        this.formatShortlist({
          breadth: response.breadth,
          entries: fresh,
          title: `${fresh.length} new Trend Template leader${fresh.length === 1 ? '' : 's'}`
        }),
        'HTML'
      );
    }

    await this.recordTrendTemplateEntrants({ entries: fresh, now, userId });

    return fresh.length;
  }

  /**
   * Marks the cooldown and writes the Analytics record for each alerted
   * entrant. Category 'WATCH' keeps these out of the Simulation ledger — see
   * `sendTrendTemplateEntrants`.
   */
  private async recordTrendTemplateEntrants({
    entries,
    now,
    userId
  }: {
    entries: ShortlistEntry[];
    now: Date;
    userId: string;
  }): Promise<void> {
    for (const entry of entries) {
      try {
        const key = this.getTrendTemplateKey(entry);

        await this.prismaService.signalState.upsert({
          create: {
            key,
            lastNotifiedAt: now,
            lastPrice: entry.price,
            lastSignal: 'WATCH',
            userId
          },
          update: { lastNotifiedAt: now, lastPrice: entry.price },
          where: { userId_key: { key, userId } }
        });
      } catch (error) {
        this.logger.warn(
          `Failed to persist TT8 cooldown for ${entry.symbol}: ${
            error?.message ?? error
          }`
        );
      }
    }

    try {
      await this.prismaService.signalLog.createMany({
        data: entries.map((entry) => {
          return {
            category: 'WATCH',
            currency: entry.currency ?? null,
            dataSource: entry.dataSource,
            livePrice: entry.price,
            metrics: JSON.parse(
              JSON.stringify({
                belowHighPct: entry.belowHighPct,
                peerGroup: entry.peerGroup,
                peerGroupPercentile: entry.peerGroupPercentile,
                peerRank: entry.peerRank,
                peerSize: entry.peerSize,
                rsRank: entry.rsRank,
                sectorTailwind: entry.sectorTailwind
              })
            ),
            name: entry.name ?? null,
            reason: `Entered Trend Template 8/8 at RS ${entry.rsRank ?? '?'}`,
            signalType: 'TT8',
            symbol: entry.symbol,
            userId
          };
        })
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist ${entries.length} TT8 log row(s): ${
          error?.message ?? error
        }`
      );
    }
  }

  /**
   * Runs the twice-monthly shortlist if its slot has passed unserved.
   *
   * Same reasoning as the leader screen's catch-up: a @nestjs/schedule cron does
   * not catch up, and this machine is a laptop that is frequently asleep at
   * 07:00. A 126-day signal loses nothing by being sent a few hours late.
   */
  public async sendShortlistIfDue(): Promise<number> {
    const now = new Date();
    const lastRunAt = await this.propertyService.getByKey<string>(
      PROPERTY_SHORTLIST_LAST_RUN
    );

    // Due once per calendar half-month: on/after the 1st, and on/after the 15th.
    const period = `${format(now, 'yyyy-MM')}-${now.getDate() >= 15 ? 'H2' : 'H1'}`;

    if (lastRunAt === period) {
      return 0;
    }

    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    let sent = 0;

    for (const { id } of users) {
      try {
        sent += await this.sendShortlist(id);
      } catch (error) {
        this.logger.error(`Shortlist failed for user ${id}`, error);
      }
    }

    await this.propertyService.put({
      key: PROPERTY_SHORTLIST_LAST_RUN,
      value: JSON.stringify(period)
    });

    this.logger.log(`Shortlist ${period} sent - ${sent} name(s)`);

    return sent;
  }

  /** The full standing shortlist, sent on the 1st and 15th. */
  public async sendShortlist(userId: string): Promise<number> {
    const response = await this.computeShortlist(userId);

    const qualifying = response.entries.filter(({ rsRank }) => {
      return (rsRank ?? 0) >= SIGNAL_TT8_ALERT_MIN_RS;
    });

    if (qualifying.length === 0) {
      this.logger.log('Shortlist: no name at RS >= 90 - nothing sent');

      return 0;
    }

    await this.telegramBotService.sendMessage(
      this.formatShortlist({
        breadth: response.breadth,
        entries: qualifying,
        title: `Trend Template shortlist - ${qualifying.length} leader${qualifying.length === 1 ? '' : 's'}`
      }),
      'HTML'
    );

    return qualifying.length;
  }

  /**
   * Two lines per name, HTML, capped at SIGNAL_SHORTLIST_MAX with the overflow
   * summarised rather than truncated silently.
   */
  private formatShortlist({
    breadth,
    entries,
    title
  }: {
    breadth?: { breadth: number; healthy: boolean; total: number };
    entries: ShortlistEntry[];
    title: string;
  }): string {
    const escape = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const lines: string[] = [];

    if (breadth) {
      lines.push(
        `${breadth.healthy ? '🟢' : '⚠️'} Market breadth ${(breadth.breadth * 100).toFixed(0)}% of ${breadth.total} above their 200-day`,
        ''
      );
    }

    lines.push(`<b>📈 ${escape(title)}</b>`, '');

    for (const entry of entries.slice(0, SIGNAL_SHORTLIST_MAX)) {
      const peer =
        entry.peerGroup && entry.peerRank && entry.peerSize
          ? `${escape(entry.peerGroup)} ${entry.peerRank}/${entry.peerSize}${
              entry.sectorTailwind
                ? ` ${entry.sectorTailwind.toLowerCase()}`
                : ''
            }`
          : 'no peer group';

      lines.push(
        `<b>${escape(entry.symbol)}</b> ${entry.price.toFixed(2)} · 8/8 · RS ${entry.rsRank ?? '?'}`,
        `   ${(entry.belowHighPct * 100).toFixed(1)}% off 52w high · ${peer}${
          entry.vcpStatus
            ? ` · base ${entry.vcpStatus.toLowerCase().replace('_', ' ')}`
            : ''
        }`,
        `   ${researchLinks({
          dataSource: entry.dataSource,
          symbol: entry.symbol
        })
          .map(({ label, url }) => `<a href="${url}">${label}</a>`)
          .join(' · ')}`
      );
    }

    if (entries.length > SIGNAL_SHORTLIST_MAX) {
      lines.push(
        '',
        `+${entries.length - SIGNAL_SHORTLIST_MAX} more on the Shortlist page`
      );
    }

    lines.push(
      '',
      '<i>Quality filter, not a buy trigger: 8/8 beat the base rate by +2.5pp over 126 days (t=24). Timing is yours.</i>'
    );

    return lines.join('\n');
  }

  /**
   * The Minervini leader shortlist: names passing all 8 Trend Template criteria
   * with a valid, tightening VCP base.
   *
   * NOT a buy signal, and deliberately so. The event study run on 2026-08-21
   * (`run-signal-edge-study.cjs`) measured forward returns after every signal
   * against the universe base rate and found breakout entries did NOT beat it
   * at 21/63/126 days (t = -1.28 / -0.19 / +0.90), while the existing DIP entry
   * did (t = +3.07 / +4.66 / +4.24). The Trend Template alone does show a real
   * 126-day edge (+1.45pp, t = 4.11), which is why the shortlist is worth
   * surfacing — but the evidence does not yet support firing on it. See
   * docs/TRADING_SIGNALS.md §0.3b.
   */
  public async computeLeaderCandidates(
    userId: string
  ): Promise<LeaderCandidatesResponse> {
    const universe = await this.getUniverse(userId, 'USD');
    const items = universe
      .filter(({ dataSource }) => dataSource === DataSource.YAHOO)
      .map(({ dataSource, symbol }) => ({ dataSource, symbol }));

    const [barsBySymbol, quotes] = await Promise.all([
      this.ohlcBarService.getBarsForSymbols({
        assetProfileIdentifiers: items,
        from: subDays(new Date(), SIGNAL_HISTORY_FETCH_DAYS)
      }),
      this.dataProviderService.getQuotes({ items, useCache: true })
    ]);

    const leaderRsAsOf = this.crossSectionalService.referenceDateFor({
      seriesBySymbol: barsBySymbol
    });
    const leaderCurrencyBySymbol = Object.fromEntries(
      universe.map(({ currency, symbol }) => {
        return [symbol, currency];
      })
    );
    const { lookup: leaderRsFxFactor } = await this.buildRsFxFactors({
      asOf: leaderRsAsOf,
      currencies: [...new Set(Object.values(leaderCurrencyBySymbol))]
    });
    const rsRankBySymbol = this.crossSectionalService.rankMap({
      currencyBySymbol: leaderCurrencyBySymbol,
      fxFactor: leaderRsFxFactor,
      seriesBySymbol: barsBySymbol
    });

    // Also published here, not only from the watchlist pass: this runs on the
    // nightly cron, so the Trend tab has a rank to show even when the watchlist
    // page has not been opened since the cache last expired. The cohort is
    // named because it is WIDER than the watchlist one (it includes holdings),
    // so the same symbol can carry a different percentile depending on which
    // pass published last — a reader showing the number must be able to say
    // what it was measured against.
    void this.publishRsRankMap({
      asOf: leaderRsAsOf,
      cohort: 'universe',
      ranks: rsRankBySymbol
    });

    const candidates: LeaderCandidate[] = [];
    let evaluated = 0;
    let trendPassCount = 0;

    for (const item of items) {
      const bars = barsBySymbol[item.symbol] ?? [];

      if (bars.length === 0) {
        continue;
      }

      evaluated++;

      const trend = this.leaderScreenService.trendTemplate({
        bars,
        rsRank: rsRankBySymbol[item.symbol] ?? null
      });

      if (!trend?.passed) {
        continue;
      }

      trendPassCount++;

      const vcp = this.leaderScreenService.vcpStructure(bars);

      if (!vcp?.isValid) {
        continue;
      }

      const price =
        quotes[item.symbol]?.marketPrice ?? bars[bars.length - 1].close;
      const atr = this.indicatorsService.atr(bars);
      const averageVolume = this.indicatorsService.averageVolume(
        bars.map(({ volume }) => volume)
      );

      // Liquidity: a breakout on an illiquid name is unfillable at the quoted
      // price, which is exactly the failure mode a backtest cannot see.
      const dollarVolume = averageVolume ? averageVolume * price : undefined;

      if (
        dollarVolume !== undefined &&
        dollarVolume < SIGNAL_SCREEN_MIN_DOLLAR_VOLUME
      ) {
        continue;
      }

      // Minervini's hard rule: never risk more than 7-8% on a position.
      const stopPrice = price * (1 - SIGNAL_LEADER_STOP_PCT);

      const screen = await this.screeningService.getScreen(item.symbol);

      candidates.push({
        analystTrend: screen?.analystTrend ?? undefined,
        atrPct: atr ? atr / price : undefined,
        dataSource: item.dataSource,
        daysToEarnings: screen?.daysToEarnings ?? undefined,
        dollarVolume,
        positionSize: SIGNAL_BACKTEST_POSITION_SIZE,
        price,
        rsRank: trend.rsRank ?? undefined,
        stopPrice,
        symbol: item.symbol,
        trendCriteria: trend.criteria as unknown as Record<string, boolean>,
        trendPasses: trend.passCount,
        vcpContractionsPct: vcp.contractions.map(({ depthPct }) =>
          Number((depthPct * 100).toFixed(1))
        ),
        vcpPivot: vcp.pivot,
        vcpPivotDistancePct:
          vcp.pivot > 0 ? (price - vcp.pivot) / vcp.pivot : undefined,
        vcpStatus: vcp.status,
        vcpVolumeRatio: vcp.breakoutVolumeRatio,
        vcpDryUpRatio: vcp.dryUpRatio
      });
    }

    // Actionable first (breakout, then at-pivot), then by relative strength.
    // A failed breakout ranks last of all: it is information, not a candidate.
    const statusRank = {
      AT_PIVOT: 1,
      BREAKOUT: 0,
      FAILED_BREAKOUT: 3,
      FORMING: 2
    };

    candidates.sort(
      (a, b) =>
        statusRank[a.vcpStatus ?? 'FORMING'] -
          statusRank[b.vcpStatus ?? 'FORMING'] ||
        (b.rsRank ?? 0) - (a.rsRank ?? 0)
    );

    const breadth = await this.marketBreadthService.get(barsBySymbol);

    return {
      breadth: breadth
        ? {
            breadth: breadth.breadth,
            healthy: breadth.healthy,
            total: breadth.total
          }
        : undefined,
      candidates,
      evaluated,
      generatedAt: new Date().toISOString(),
      trendPassCount
    };
  }

  /**
   * Telegram report for the leader shortlist — HTML, three lines per name.
   *
   * Deliberately short. The full scorecard (all 8 criteria with the number each
   * was decided on, both volume ratios, the contraction sequence) lives in the
   * ticker dialog's Trend tab and in GET /signals/leaders; repeating it here
   * only buries the two facts that decide whether to open the chart at all —
   * where price sits against the pivot, and whether volume confirms.
   *
   * The links are the point of the message: it is a prompt to go and read, not
   * a buy instruction. That caveat stays on the message rather than moving to
   * the docs, because the message is what gets read at 22:30.
   */
  public formatLeaderCandidates(response: LeaderCandidatesResponse): string {
    const { candidates, evaluated, trendPassCount } = response;

    if (candidates.length === 0) {
      return (
        `📋 <b>Leader screen</b> — no candidates\n` +
        `${trendPassCount}/${evaluated} names pass the Trend Template, none with a valid VCP base.`
      );
    }

    const lines = [
      `📋 <b>Leader screen</b> · ${trendPassCount}/${evaluated} pass the Trend Template`,
      ``
    ];

    for (const candidate of candidates.slice(0, 8)) {
      const {
        dataSource,
        price,
        rsRank,
        stopPrice,
        symbol,
        trendPasses,
        vcpDryUpRatio,
        vcpPivot,
        vcpPivotDistancePct,
        vcpStatus,
        vcpVolumeRatio
      } = candidate;

      const icon = vcpStatus === 'BREAKOUT' ? '🚀' : '⏳';
      const distance = (vcpPivotDistancePct ?? 0) * 100;

      lines.push(
        `${icon} <b>${this.escapeHtml(symbol)}</b> ${price.toFixed(2)} · ${trendPasses}/8 · RS ${rsRank ?? '—'}`
      );

      const detail = [
        `pivot ${vcpPivot?.toFixed(2)} ${distance >= 0 ? '+' : ''}${distance.toFixed(1)}%`,
        `vol ${vcpVolumeRatio?.toFixed(2)}×`,
        vcpDryUpRatio == null ? null : `dry ${vcpDryUpRatio.toFixed(2)}×`,
        stopPrice == null ? null : `stop ${stopPrice.toFixed(2)}`
      ].filter(Boolean);

      lines.push(detail.join(' · '));

      const links = researchLinks({ dataSource, symbol })
        .map(({ label, url }) => `<a href="${url}">${label}</a>`)
        .join(' · ');

      if (links) {
        lines.push(links);
      }

      lines.push('');
    }

    lines.push(
      `<i>Research shortlist, not a trigger. Measured 2026-08-21: breakout entries did not beat the universe base rate (t = −1.3 / −0.2 / +0.9 at 21/63/126d); the DIP path did.</i>`
    );

    return lines.join('\n');
  }

  /**
   * Escapes the three characters Telegram's HTML parse mode reserves. Applied
   * to symbols rather than assumed safe — a ticker is external data.
   */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Daily leader screen for every real user.
   *
   * Mirrors sendFundRecommendationsToAllUsers: one user's failure must not stop
   * the others, so each is wrapped rather than letting the loop throw.
   */
  public async sendLeaderCandidatesToAllUsers(): Promise<void> {
    const users = await this.prismaService.user.findMany({
      select: { id: true },
      where: { role: { not: 'DEMO' } }
    });

    let sent = 0;

    for (const { id } of users) {
      try {
        sent += await this.sendLeaderCandidates(id);
      } catch (error) {
        this.logger.error(`Failed to send leader screen for user ${id}`, error);
      }
    }

    // Shared with the boot catch-up, so a scheduled run that DID happen stops
    // the next restart from screening again.
    await this.propertyService.put({
      key: PROPERTY_LEADER_SCREEN_LAST_RUN,
      value: JSON.stringify(new Date().toISOString())
    });

    this.logger.log(`Leader screen complete - ${sent} breakout(s) alerted`);
  }

  /**
   * Alerts on leaders that have actually BROKEN OUT, and reports how many were
   * sent so a caller can tell "nothing qualified today" apart from "the send
   * is broken".
   *
   * Deliberately breakout-only. AT_PIVOT is a watch state, not an event: a
   * name can sit at its pivot for a fortnight, so alerting on it produced the
   * same two dozen names every evening — the failure mode that makes an alert
   * stop being read. A breakout is a dated event and is self-limiting without
   * any extra filtering: across 833 tracked names a typical session produces
   * about four. AT_PIVOT and FORMING remain visible in GET /signals/leaders,
   * the watchlist columns and the ticker dialog's Trend tab.
   *
   * No RS floor is applied on top. Every candidate here has already passed all
   * 8 Trend Template criteria, and criterion 8 *is* RS >= 70, so the floor is
   * present by construction. Adding the stricter preferred RS on top was
   * silently discarding most real breakouts — three of today's four.
   */
  public async sendLeaderCandidates(userId: string): Promise<number> {
    // Exits first: a lot that hit its stop today should close at today's
    // price, not sit open for another session behind the new entries.
    await this.closeStoppedLeaderLots(userId);

    const response = await this.computeLeaderCandidates(userId);

    const breakouts = response.candidates.filter(({ vcpStatus }) => {
      return vcpStatus === 'BREAKOUT';
    });

    if (breakouts.length === 0) {
      return 0;
    }

    // A breakout bar keeps testing as BREAKOUT for several sessions after the
    // event, so without a per-symbol cooldown one breakout would re-alert
    // every evening until the volume surge rolled out of the 50-day average.
    const states = await this.prismaService.signalState.findMany({
      where: {
        key: { in: breakouts.map((candidate) => leaderAlertKey(candidate)) },
        userId
      }
    });

    const now = new Date();
    const fresh = selectFreshBreakouts({
      candidates: breakouts,
      cooldownMs: SIGNAL_LEADER_ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
      lastNotifiedByKey: new Map(
        states.map(({ key, lastNotifiedAt }) => [key, lastNotifiedAt])
      ),
      now
    });

    if (fresh.length === 0) {
      this.logger.log(
        `Leader screen: ${breakouts.length} breakout(s) still within the ${SIGNAL_LEADER_ALERT_COOLDOWN_DAYS}-day cooldown - nothing sent`
      );

      return 0;
    }

    await this.telegramBotService.sendMessage(
      this.formatLeaderCandidates({ ...response, candidates: fresh }),
      'HTML'
    );

    // Only mark the cooldown and open the simulated lot AFTER the message is
    // away, so a failed send is retried tomorrow rather than silently
    // swallowed by its own cooldown.
    await this.recordLeaderAlerts({ candidates: fresh, now, userId });

    // The gated subset — Minervini's own funnel, which this engine never had:
    // market direction first, then leadership, then the setup. Recorded as its
    // own signalType so the gate becomes measurable against the ungated alert
    // rather than merely asserted. Historically ~11 events a year.
    const gated = response.breadth?.healthy
      ? fresh.filter(({ rsRank }) => {
          return (rsRank ?? 0) >= SIGNAL_TREND_TEMPLATE_PREFERRED_RS;
        })
      : [];

    if (gated.length > 0) {
      await this.recordLeaderAlerts({
        candidates: gated,
        now,
        signalType: 'LEADER_GATED',
        userId
      });

      this.logger.log(
        `Leader screen: ${gated.length} of ${fresh.length} breakout(s) also cleared healthy market + RS>=${SIGNAL_TREND_TEMPLATE_PREFERRED_RS}`
      );
    }

    return fresh.length;
  }

  /**
   * Marks the per-symbol cooldown and opens a simulated LEADER lot for each
   * breakout that was just alerted.
   *
   * The SignalLog row is what puts the Leader line on the Simulation chart.
   * It is written forward-only, at the moment the alert fires — there is no
   * backfill, because a breakout that was never alerted was never a signal
   * the user could have acted on, and inventing its history would make the
   * curve a backtest wearing a live-results label.
   *
   * Best-effort throughout: neither write may break the alert that already
   * went out.
   */
  private async recordLeaderAlerts({
    candidates,
    now,
    signalType = 'LEADER',
    userId
  }: {
    candidates: LeaderCandidate[];
    now: Date;
    signalType?: 'LEADER' | 'LEADER_GATED';
    userId: string;
  }): Promise<void> {
    // The gated variant is a second row for the SAME event, so it must not
    // re-stamp the cooldown the LEADER pass already set.
    for (const candidate of signalType === 'LEADER' ? candidates : []) {
      try {
        const key = leaderAlertKey(candidate);

        await this.prismaService.signalState.upsert({
          create: {
            key,
            lastNotifiedAt: now,
            lastPrice: candidate.price,
            lastSignal: 'BUY',
            userId
          },
          update: { lastNotifiedAt: now, lastPrice: candidate.price },
          where: { userId_key: { key, userId } }
        });
      } catch (error) {
        this.logger.warn(
          `Failed to persist leader cooldown for ${candidate.symbol}: ${
            error?.message ?? error
          }`
        );
      }
    }

    try {
      await this.prismaService.signalLog.createMany({
        data: candidates.map((candidate) => {
          return {
            category: 'BUY',
            currency: candidate.currency ?? null,
            dataSource: candidate.dataSource,
            livePrice: candidate.price,
            metrics: JSON.parse(
              JSON.stringify({
                rsRank: candidate.rsRank,
                trendPasses: candidate.trendPasses,
                vcpDryUpRatio: candidate.vcpDryUpRatio,
                vcpPivot: candidate.vcpPivot,
                vcpVolumeRatio: candidate.vcpVolumeRatio
              })
            ),
            name: candidate.name ?? null,
            reason: `VCP breakout above ${
              candidate.vcpPivot?.toFixed(2) ?? 'pivot'
            } on ${candidate.vcpVolumeRatio?.toFixed(2) ?? '?'}x volume${
              signalType === 'LEADER_GATED' ? ' (healthy market, RS>=90)' : ''
            }`,
            signalType,
            // Minervini's hard stop. Prefer the screen's own figure, which is
            // already reward/risk-checked, and fall back to the flat 7.5%.
            stopLoss:
              candidate.stopPrice ??
              candidate.price * (1 - SIGNAL_LEADER_STOP_PCT),
            suggestedAmount: candidate.positionSize ?? null,
            symbol: candidate.symbol,
            userId
          };
        })
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist ${candidates.length} ${signalType} signal log row(s): ${
          error?.message ?? error
        }`
      );
    }
  }

  /**
   * Closes any open simulated LEADER lot whose price has hit its stop, by
   * writing the matching SELL row.
   *
   * There is no take-profit leg on purpose: the doctrine this screen
   * implements is to cut at 7-8% and let winners run, so an open lot is
   * marked to market day by day and only ever closed by its stop. Run once
   * per daily screen, before new breakouts are alerted.
   */
  private async closeStoppedLeaderLots(userId: string): Promise<number> {
    const rows = await this.prismaService.signalLog.findMany({
      orderBy: { createdAt: 'asc' },
      where: {
        category: { in: ['BUY', 'SELL'] },
        signalType: { in: ['LEADER', 'LEADER_GATED', 'TT8'] },
        userId
      }
    });

    // Same FIFO walk computeSimulation does, restricted to the LEADER bucket.
    const openLotsByKey = new Map<string, (typeof rows)[number][]>();

    for (const row of rows) {
      // Same bucketing computeSimulation uses, so a LEADER exit can never
      // close a LEADER_GATED or TT8 lot.
      const key = `${row.signalType}:${row.dataSource}:${row.symbol}`;

      if (row.category === 'BUY') {
        openLotsByKey.set(key, [...(openLotsByKey.get(key) ?? []), row]);
      } else {
        openLotsByKey.get(key)?.shift();
      }
    }

    const openLots = [...openLotsByKey.values()].flat();

    if (openLots.length === 0) {
      return 0;
    }

    const quotes = await this.dataProviderService.getQuotes({
      items: openLots.map(({ dataSource, symbol }) => {
        return { dataSource, symbol };
      }),
      useCache: true
    });

    const stopped = selectStoppedLots({
      lots: openLots,
      priceBySymbol: new Map(
        openLots.map(({ symbol }) => [symbol, quotes[symbol]?.marketPrice])
      )
    });

    if (stopped.length === 0) {
      return 0;
    }

    try {
      await this.prismaService.signalLog.createMany({
        data: stopped.map((lot) => {
          return {
            category: 'SELL',
            currency: lot.currency,
            dataSource: lot.dataSource,
            livePrice: quotes[lot.symbol]?.marketPrice ?? lot.stopLoss,
            name: lot.name,
            reason: `Stopped out at ${lot.stopLoss?.toFixed(2)}`,
            signalType: lot.signalType,
            symbol: lot.symbol,
            userId
          };
        })
      });
    } catch (error) {
      this.logger.warn(
        `Failed to close ${stopped.length} leader lot(s): ${
          error?.message ?? error
        }`
      );

      return 0;
    }

    this.logger.log(`Leader screen: closed ${stopped.length} stopped lot(s)`);

    return stopped.length;
  }

  /**
   * Current score/RSI/MACD/Bollinger/reach/expected value for every watched
   * symbol, refreshed on demand (the watchlist UI polls this every 30 min).
   */
  public async getWatchlistMetrics(
    userId: string
  ): Promise<Record<string, WatchlistMetric>> {
    const cached = this.watchlistMetricsCache.get(userId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const value = (async () => {
      const watchlist = await this.getWatchlist(userId);
      const metrics = await this.computeMetricsSnapshot(watchlist);

      const result: Record<string, WatchlistMetric> = {};

      for (const [symbol, metric] of metrics) {
        // Strip the internal `livePrice` field (computeMetricsSnapshot's own
        // marked-to-market helper) before returning the public WatchlistMetric
        // shape — a shallow-copy + delete instead of a destructure-to-omit
        // avoids an unused-binding lint error while keeping the same result.
        const watchlistMetric: WatchlistMetric & { livePrice?: number } = {
          ...metric
        };
        delete watchlistMetric.livePrice;
        result[symbol] = watchlistMetric;
      }

      return result;
    })();

    // Published before it settles, so a concurrent caller joins this rebuild.
    this.watchlistMetricsCache.set(userId, {
      expiresAt: Date.now() + SIGNAL_WATCHLIST_METRICS_CACHE_TTL,
      value
    });

    // A rejection must not be cached for the full TTL — drop the entry so the
    // next caller retries, but only if it is still the one stored here.
    value.catch(() => {
      if (this.watchlistMetricsCache.get(userId)?.value === value) {
        this.watchlistMetricsCache.delete(userId);
      }
    });

    return value;
  }

  /**
   * `dataSource:symbol` keys for positions a real, still-open tracked trade is
   * already watching (see SignalTradeTrackingService).
   *
   * Two independent exit systems can otherwise watch the same holding: this
   * service's `evaluateExit` (for `isActiveTrade` positions) and the tracked
   * path, which freezes a stop/target against the REAL fill price at purchase
   * and then trails it on 5-minute bars. They use different levels and would
   * each raise their own SELL alert for the same position. The tracked entry
   * wins because it is anchored to the price actually paid and sizes its bands
   * from Yang-Zhang OHLC volatility rather than close-to-close.
   *
   * Only TRACKING/TRAILING count as live; STOP_HIT and TRAILING_EXIT are
   * finished trades and release the position back to the exit state machine.
   */
  private async getLiveTrackedKeys(userId: string): Promise<Set<string>> {
    return computeLiveTrackedKeys(
      await this.prismaService.signalLog.findMany({
        select: { dataSource: true, metrics: true, symbol: true },
        where: { category: 'BUY', userId }
      })
    );
  }

  private async getHistory(
    items: { dataSource: DataSource; symbol: string }[]
  ): Promise<{ [symbol: string]: DatedClose[] }> {
    // Only the close series is built below, so this takes the three-column
    // read rather than full MarketData models — at 400k+ rows per watchlist
    // snapshot the unread columns are the bulk of the cost.
    const marketData = await this.marketDataService.getDatedCloses({
      assetProfileIdentifiers: items,
      dateQuery: { gte: subDays(new Date(), SIGNAL_HISTORY_FETCH_DAYS) }
    });

    const bySymbol: { [symbol: string]: DatedClose[] } = {};

    // Rows come back ordered by date asc, so pushed closes stay ordered.
    for (const row of marketData) {
      (bySymbol[row.symbol] ??= []).push({
        close: row.marketPrice,
        date: row.date.toISOString().slice(0, 10)
      });
    }

    return bySymbol;
  }

  private async getCashBalance(
    userId: string,
    baseCurrency: string
  ): Promise<number> {
    try {
      const cashDetails = await this.accountService.getCashDetails({
        currency: baseCurrency,
        userId
      });

      return cashDetails.balanceInBaseCurrency ?? 0;
    } catch (error) {
      this.logger.warn(
        `Could not resolve cash balance for user ${userId}: ${error}`
      );

      return 0;
    }
  }

  private async getUserCurrency(userId: string): Promise<string> {
    const user = await this.prismaService.user.findUnique({
      select: { settings: { select: { settings: true } } },
      where: { id: userId }
    });

    const settings = user?.settings?.settings as UserSettings;

    return settings?.baseCurrency ?? DEFAULT_CURRENCY;
  }

  private getSignalKey(signal: TradingSignal): string {
    return signal.category === 'REINVEST'
      ? 'REINVEST'
      : `${signal.dataSource}:${signal.symbol}`;
  }

  /** Telegram message for positions that just reached target and began trailing. */
  private formatTrailingMessage(signals: TradingSignal[]): string {
    const lines = signals.map(
      (signal) => `🎯 *${signal.name}* (${signal.symbol})\n${signal.reason}`
    );

    return [`*Trailing activated*`, '', ...lines].join('\n');
  }

  private formatMessage(signals: TradingSignal[]): string {
    const emoji: Record<string, string> = {
      BUY: '🟢',
      REINVEST: '🔵',
      SELL: '🔴'
    };

    const lines = signals.map((signal) => {
      // Flag the higher-risk counter-trend reversal buy distinctly, and mark
      // ETF dips (shallower calibrated buy zone) so they read differently
      // from single-stock dips.
      const label =
        signal.signalType === 'REVERSAL'
          ? '⚠️ REVERSAL BUY (bear-market)'
          : signal.category === 'BUY' && signal.assetSubClass === 'ETF'
            ? '*BUY (ETF dip)*'
            : `*${signal.category}*`;
      const header =
        signal.category === 'REINVEST'
          ? `${emoji.REINVEST} *REINVEST*`
          : `${emoji[signal.category]} ${label} ${signal.name} (${signal.symbol})`;

      const details: string[] = [signal.reason];

      if (signal.category !== 'REINVEST') {
        details.push(
          `Price: ${signal.livePrice} ${signal.currency ?? ''}`.trim()
        );
      }

      if (signal.hitTargetProbability !== undefined) {
        details.push(
          `~${Math.round(signal.hitTargetProbability * 100)}% chance of hitting target in ${SIGNAL_FORECAST_HORIZON_DAYS} trading days`
        );
      }

      if (signal.suggestedAmount !== undefined) {
        details.push(`Suggested: ${signal.suggestedAmount}`);
      }

      return `${header}\n${details.join('\n')}`;
    });

    return `📊 *Trading signals* (${format(new Date(), DATE_FORMAT)})\n\n${lines.join('\n\n')}`;
  }

  /**
   * Fetches the advisory pre-buy screen for every YAHOO BUY signal that just
   * fired and attaches it to the signal (`preBuyScreen`), so both the Telegram
   * block and the persisted SignalLog row carry it. Sector tailwind and the
   * 200-day trend are computed in-house (watchlist peer returns / the signal's
   * own snapshot) — only analyst/EPS/earnings/headlines need a network fetch,
   * and only for the handful of symbols that actually fired (never the whole
   * watchlist; Finnhub free tier = 60 calls/min). Best-effort: any failure
   * just leaves the field absent.
   */
  private async attachPreBuyScreens(
    userId: string,
    signals: TradingSignal[]
  ): Promise<void> {
    const buySignals = signals.filter(
      (signal) =>
        signal.category === 'BUY' && signal.dataSource === DataSource.YAHOO
    );

    if (buySignals.length === 0) {
      return;
    }

    try {
      const watchlist = await this.getWatchlist(userId);
      const yahooItems = watchlist.filter(
        (item) => item.dataSource === DataSource.YAHOO
      );

      // Peer 3-month returns per peer group (for the sector tailwind), computed
      // once for only the groups that actually fired.
      //
      // The group is the provider's sector where known, falling back to the
      // curated catalog category — see `peerGroupFor`. Sector is the better
      // grouping precisely because it is coarser: the curated taxonomy produces
      // peer groups of one or two names, and a median over two names is noise.
      const peerGroupBySymbol = new Map<string, string | null>();

      for (const { sector, symbol } of yahooItems) {
        peerGroupBySymbol.set(
          symbol,
          peerGroupFor({ category: categoryForSymbol(symbol), sector })
        );
      }

      const firedCategories = new Set(
        buySignals
          .map((signal) => peerGroupBySymbol.get(signal.symbol) ?? null)
          .filter((group): group is string => group !== null)
      );

      const peersByCategory = new Map<string, string[]>();

      for (const item of yahooItems) {
        const category = peerGroupBySymbol.get(item.symbol) ?? null;

        if (category && firedCategories.has(category)) {
          const peers = peersByCategory.get(category) ?? [];
          peers.push(item.symbol);
          peersByCategory.set(category, peers);
        }
      }

      const peerSymbols = [...peersByCategory.values()].flat();
      const peerHistory = await this.getHistory(
        yahooItems.filter(({ symbol }) => peerSymbols.includes(symbol))
      );

      const tailwindByCategory = new Map<
        string,
        ReturnType<typeof classifySectorTailwind>
      >();

      for (const [category, symbols] of peersByCategory) {
        const peerReturns = symbols
          .map(
            (symbol) =>
              computeSeriesMetrics(peerHistory[symbol] ?? []).return3mPct
          )
          .filter((value): value is number => value != null);

        tailwindByCategory.set(category, classifySectorTailwind(peerReturns));
      }

      for (const signal of buySignals) {
        const screen = await this.screeningService.getScreen(signal.symbol);
        const category = peerGroupBySymbol.get(signal.symbol) ?? null;
        const sectorTailwind = category
          ? (tailwindByCategory.get(category) ?? null)
          : null;
        const trend200d =
          signal.sma200 != null
            ? signal.livePrice >= signal.sma200
              ? 'ABOVE'
              : 'BELOW'
            : null;

        if (screen === null && sectorTailwind === null && trend200d === null) {
          continue;
        }

        signal.preBuyScreen = {
          analystTrend: screen?.analystTrend ?? undefined,
          daysToEarnings: screen?.daysToEarnings ?? undefined,
          epsRevisionTrend: screen?.epsRevisionTrend ?? undefined,
          headlines: screen?.headlines?.length ? screen.headlines : undefined,
          nextEarningsDate: screen?.nextEarningsDate ?? undefined,
          sectorTailwind: sectorTailwind ?? undefined,
          trend200d: trend200d ?? undefined
        };
      }
    } catch (error) {
      this.logger.warn(
        `Pre-buy screen failed: ${error?.message ?? error} — signals sent without it`
      );
    }
  }

  /**
   * Renders the attached pre-buy screens as one Telegram message. Advisory by
   * design (unvalidated as hard rules) — REVERSAL buys get the harder framing
   * because the simulation evidence shows they lose without a real catalyst.
   * Returns null when no signal carries a screen.
   */
  private formatPreBuyScreens(signals: TradingSignal[]): string | null {
    const seen = new Set<string>();
    const blocks: string[] = [];

    for (const signal of signals) {
      if (!signal.preBuyScreen || seen.has(signal.symbol)) {
        continue;
      }

      seen.add(signal.symbol);

      const screen = signal.preBuyScreen;
      const category = categoryForSymbol(signal.symbol);
      const lines: string[] = [`*${signal.name} (${signal.symbol})*`];

      if (signal.signalType === 'REVERSAL') {
        lines.push('⚠️ REVERSAL — confirm a real catalyst before buying:');
      }

      const trendParts: string[] = [];

      if (screen.trend200d) {
        trendParts.push(
          screen.trend200d === 'ABOVE'
            ? '200d trend: ▲ above'
            : '200d trend: ▼ below'
        );
      }

      if (screen.sectorTailwind) {
        trendParts.push(
          `Sector${category ? ` (${category})` : ''}: ${screen.sectorTailwind}`
        );
      }

      if (trendParts.length > 0) {
        lines.push(trendParts.join(' · '));
      }

      const analystParts: string[] = [];

      if (screen.analystTrend) {
        analystParts.push(`Analysts: ${screen.analystTrend}`);
      }

      if (screen.epsRevisionTrend) {
        analystParts.push(`EPS estimates: ${screen.epsRevisionTrend}`);
      }

      if (analystParts.length > 0) {
        lines.push(analystParts.join(' · '));
      }

      if (screen.nextEarningsDate) {
        const days = screen.daysToEarnings;
        lines.push(
          `Earnings: ${screen.nextEarningsDate}${days != null ? ` (in ${days}d)` : ''}`
        );
      }

      if (screen.headlines?.length) {
        lines.push(
          ...screen.headlines.map(
            (headline) =>
              `• ${headline.title}${headline.source ? ` (${headline.source})` : ''}`
          )
        );
      }

      blocks.push(lines.join('\n'));
    }

    if (blocks.length === 0) {
      return null;
    }

    return [
      '📋 *Pre-buy screen* (advisory — informs, never blocks)',
      ...blocks
    ].join('\n\n');
  }

  /**
   * Deterministic copy-paste search string for the stocks that just signalled,
   * so the user can paste it into Google for news. Returns null when there are
   * no real stocks (e.g. only a REINVEST fired).
   */
  private formatNewsPrompt(signals: TradingSignal[]): string | null {
    const seen = new Set<string>();
    const parts: string[] = [];

    for (const signal of signals) {
      if (signal.category !== 'BUY' && signal.category !== 'SELL') {
        continue;
      }

      if (seen.has(signal.symbol)) {
        continue;
      }

      seen.add(signal.symbol);
      parts.push(`${signal.name} (${signal.symbol})`);
    }

    if (parts.length === 0) {
      return null;
    }

    return [
      '🔎 Paste into Google for news:',
      `${parts.join(', ')} latest news, earnings & analyst ratings ${format(new Date(), 'MMMM yyyy')}`
    ].join('\n');
  }

  private formatReportMessage(report: PortfolioReport): string {
    const pct = (value: number | undefined) => {
      if (value === undefined) {
        return 'n/a';
      }

      const sign = value >= 0 ? '+' : '';

      return `${sign}${(value * 100).toFixed(1)}%`;
    };

    const trend = (value: number | undefined) =>
      value === undefined ? '⚪️' : value >= 0 ? '🟢' : '🔴';

    const lines = report.rows.map((row) => {
      const priceNative = `${row.livePrice.toFixed(2)} ${row.currency}`;
      const priceBase =
        row.currency === report.baseCurrency
          ? ''
          : ` (${row.livePriceInBaseCurrency.toFixed(2)} ${report.baseCurrency})`;

      return [
        `${trend(row.dayChangePct)} *${row.symbol}* — ${priceNative}${priceBase}`,
        `Day ${pct(row.dayChangePct)} · Week ${pct(row.weekChangePct)} · vs buy ${pct(row.referenceChangePct)}`
      ].join('\n');
    });

    const total = `${report.totalValueInBaseCurrency.toFixed(2)} ${report.baseCurrency}`;

    return [
      `📈 *Portfolio report* (${format(new Date(), DATE_FORMAT)})`,
      '',
      lines.join('\n\n'),
      '',
      `*Total:* ${total}`
    ].join('\n');
  }
}
