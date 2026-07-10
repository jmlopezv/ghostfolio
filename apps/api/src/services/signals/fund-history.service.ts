import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { FUND_CATALOG } from '@ghostfolio/common/fund-catalog';
import { nordnetUrlForName } from '@ghostfolio/common/nordnet-fund-urls';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AssetSubClass, DataSource } from '@prisma/client';

const NORDNET_BASE_URL = 'https://www.nordnet.se';
// Nordnet's public price-time-series CDN (the fund chart's own data source).
const NORDNET_CDN_URL =
  'https://api.prod.nntech.io/market-data/v3/price-time-series';
// Below this many local closes a fund has no usable daily curve for the
// technical indicators, so we backfill one from Nordnet's price CDN.
const MIN_CLOSES_FOR_INDICATORS = 30;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Property-store keys (global key-value table; survives reboots).
export const PROPERTY_FUND_FACTS = 'SIGNAL_FUND_FACTS';
export const PROPERTY_FUND_HISTORY_LAST_SYNC = 'SIGNAL_FUND_HISTORY_LAST_SYNC';

// Re-sync when the last successful run is older than this (self-healing after
// machine-off days: the on-boot catch-up compares against this window).
const SYNC_STALE_AFTER_MS = 20 * 60 * 60 * 1000;
const PER_FUND_DELAY_MS = 300;

export interface FundFacts {
  aum?: number;
  /** Ongoing annual charge (Årlig avgift) as a percent, e.g. 0.2. */
  feePct?: number;
  /** Number of Nordnet customers holding the fund (popularity proxy). */
  owners?: number;
  isin?: string;
  /** Nordnet's own category label (e.g. "Korea", "Global, Mix bolag"). */
  nordnetCategory?: string;
  developments?: {
    oneDay?: number;
    oneMonth?: number;
    oneWeek?: number;
    oneYear?: number;
    sixMonths?: number;
    threeMonths?: number;
    threeYears?: number;
    thisYear?: number;
  };
  navDate?: string;
  productFeePct?: number;
  rating?: number;
  sharpeRatio?: number;
  standardDeviation?: number;
  topCountries?: { name: string; weight: number }[];
  topHoldings?: { name: string; weight: number }[];
  topSectors?: { name: string; weight: number }[];
  updatedAt: string;
}

export interface FundSyncSummary {
  navRowsInserted: number;
  skipped: string[];
  synced: string[];
}

// Fund profiles were seeded with ASCII-transliterated names ("Lansforsakringar
// Varlden") but Avanza's search only matches the real Swedish spellings — this
// word-level map restores the diacritics for the search query.
const SWEDISH_WORD_FIXES: Record<string, string> = {
  foretagsobligation: 'Företagsobligation',
  granslos: 'Gränslös',
  hallbar: 'Hållbar',
  hallbara: 'Hållbara',
  indexnara: 'Indexnära',
  lansforsakringar: 'Länsförsäkringar',
  rantefond: 'Räntefond',
  tillvaxt: 'Tillväxt',
  tillvaxtmarknad: 'Tillväxtmarknad',
  tillvaxtmarknader: 'Tillväxtmarknader',
  varlden: 'Världen',
  varldsnaturfonden: 'Världsnaturfonden'
};

/** Restores Swedish diacritics in a transliterated fund name (word-by-word). */
export function restoreSwedishFundName(name: string): string {
  return name
    .split(' ')
    .map((word) => SWEDISH_WORD_FIXES[word.toLowerCase()] ?? word)
    .join(' ');
}

export interface NordnetFundDetails {
  category?: string;
  /** Trading currency from the "Handlas i" row (e.g. 'USD', 'SEK'). */
  currency?: string;
  /** Årlig avgift (ongoing annual charge) as a percent, e.g. 0.2 for 0.20%. */
  feePct?: number;
  /** Top holdings with weights (fraction), canonical {name, weight} shape. */
  holdings?: { name: string; weight: number }[];
  isin?: string;
  /** Latest official NAV from the page's dehydrated state (date + value). */
  latestNav?: { date: string; value: number };
  /** Management fee % (förvaltningsavgift). */
  managementFeePct?: number;
  /** orderBook UUID — the identifier for Nordnet's price-time-series CDN. */
  orderbookId?: string;
  owners?: number;
  rating?: number;
  /** Period returns (DAY_1/WEEK_1/MONTH_1/MONTH_3/MONTH_6/YTD/YEAR_1/YEAR_3/...). */
  returns?: { development: number; period: string }[];
  /** Sharpe ratio published by Nordnet. */
  sharpeRatio?: number;
  /** Annualized standard deviation % published by Nordnet. */
  standardDeviation?: number;
}

/**
 * Parses the server-rendered "Detaljer" facts off a Nordnet fund page
 * (`{nordnetUrl}?details`) — this works anonymously and covers every fund
 * Nordnet sells, including Nordnet's own funds Avanza can't list. The number
 * of owners ("Antal ägare hos Nordnet") only exists here.
 */
export function parseNordnetFundDetails(html: string): NordnetFundDetails {
  const cellAfter = (label: string) => {
    const match = html.match(
      new RegExp(`rowheader">${label}</span>[\\s\\S]{0,800}?role="cell"[^>]*>([^<]+)`)
    );

    return match?.[1]?.trim();
  };

  const ownersText = cellAfter('Antal ägare hos Nordnet');
  const owners = ownersText
    ? parseInt(ownersText.replace(/[^\d]/g, ''), 10)
    : undefined;

  const isinText = cellAfter('ISIN');
  const isin = /^[A-Z]{2}[0-9A-Z]{10}$/.test(isinText ?? '')
    ? isinText
    : undefined;

  // Morningstar rating from the embedded schema.org JSON-LD.
  const ratingMatch = html.match(/"ratingValue":"(\d)"/);

  // The page ships a dehydrated JSON state (quotes escaped as \") whose FIRST
  // navInfo block belongs to the page's own fund: the latest official NAV and
  // period returns out to 10y — server-rendered even for Nordnet's own funds
  // that no other public source covers.
  let latestNav: { date: string; value: number } | undefined;
  let returns: { development: number; period: string }[] | undefined;

  const navMatch = html.match(
    /\\"latestNav\\":\{\\"date\\":\\"([0-9-]+)\\",\\"value\\":([0-9.]+)/
  );

  if (navMatch) {
    const value = parseFloat(navMatch[2]);

    if (value > 0) {
      latestNav = { date: navMatch[1], value };
    }
  }

  // orderBook UUID — the identifier Nordnet's price-time-series CDN keys on.
  const orderbookMatch = html.match(
    /\\"orderBook\\":\{\\"id\\":\\"([0-9a-f-]{36})\\"/
  );
  const orderbookId = orderbookMatch?.[1];

  const returnsStart = html.indexOf('\\"returns\\":[');

  if (returnsStart >= 0) {
    const window = html.slice(returnsStart, returnsStart + 1500);
    const pairs = [
      ...window.matchAll(
        /\\"development\\":(-?[0-9.]+),\\"period\\":\\"([A-Z_0-9]+)\\"/g
      )
    ].map(([, development, period]) => ({
      development: parseFloat(development),
      period
    }));

    if (pairs.length > 0) {
      returns = pairs;
    }
  }

  const currencyText = cellAfter('Handlas i');

  // Årlig avgift (ongoing charge). The page's own fund is the FIRST fees block
  // in the dehydrated state: {managementFee, ongoingCost, totalFee}.
  const numberAfter = (key: string): number | undefined => {
    const match = html.match(
      new RegExp(`\\\\"${key}\\\\":(-?[0-9.]+)`)
    );

    if (!match) {
      return undefined;
    }

    const parsed = parseFloat(match[1]);

    return Number.isFinite(parsed) ? parsed : undefined;
  };

  // Årlig avgift (ongoing charge). Prefer the RENDERED header value — it is the
  // fund's own figure and unambiguous ("0,45" with a Swedish decimal comma).
  // Fall back to the dehydrated-state fees block (whose FIRST occurrence can be
  // a 0% platform-fee block rather than the fund's, so it's the weaker source).
  let feePct: number | undefined;
  const renderedFee = html.match(
    /rlig avgift<\/span><span[^>]*>([0-9]+,[0-9]+)/
  );

  if (renderedFee) {
    const parsed = parseFloat(renderedFee[1].replace(',', '.'));

    if (Number.isFinite(parsed) && parsed >= 0) {
      feePct = parsed;
    }
  }

  if (feePct == null) {
    const feeBlock = html.match(/\\"fees\\":\{[^}]*?\\"totalFee\\":([0-9.]+)/);

    if (feeBlock && Number.isFinite(parseFloat(feeBlock[1]))) {
      feePct = parseFloat(feeBlock[1]);
    }
  }

  // Top holdings from the dehydrated state's holdings array: {name, weight}
  // where weight is already a percent (e.g. 5.53). Store as a fraction.
  const holdings: { name: string; weight: number }[] = [];
  const holdingsStart = html.indexOf('\\"holdings\\":[');

  if (holdingsStart >= 0) {
    const window = html.slice(holdingsStart, holdingsStart + 6000);
    for (const match of window.matchAll(
      /\\"name\\":\\"([^"\\]+)\\"[\s\S]{0,300}?\\"weight\\":([0-9.]+)/g
    )) {
      const weight = parseFloat(match[2]);

      if (holdings.length < 10 && Number.isFinite(weight) && weight > 0) {
        holdings.push({
          name: match[1],
          weight: Math.round((weight / 100) * 10000) / 10000
        });
      }
    }
  }

  return {
    category: cellAfter('Kategori'),
    currency: /^[A-Z]{3}$/.test(currencyText ?? '') ? currencyText : undefined,
    feePct,
    holdings: holdings.length > 0 ? holdings : undefined,
    isin,
    latestNav,
    managementFeePct: numberAfter('managementFee'),
    orderbookId,
    owners: Number.isFinite(owners) ? owners : undefined,
    rating: ratingMatch ? parseInt(ratingMatch[1], 10) : undefined,
    returns,
    sharpeRatio: numberAfter('sharpeRatio'),
    standardDeviation: numberAfter('standardDeviation')
  };
}

/**
 * Extracts the Avanza orderbook id from a stored fund-guide scraper URL
 * (e.g. https://www.avanza.se/_api/fund-guide/guide/596635 -> '596635').
 */
export function parseOrderbookIdFromScraperUrl(
  url: string | undefined | null
): string | null {
  const match = url?.match(/_api\/fund-guide\/guide\/(\d+)/);

  return match?.[1] ?? null;
}

/**
 * The calendar day an Avanza chart timestamp refers to. Avanza stamps each
 * NAV at midnight EUROPE/STOCKHOLM of its official NAV date (e.g. the
 * 2026-07-08 NAV arrives as 2026-07-07T22:00Z in summer) — verified against
 * the fund-guide's own navDate. A naive UTC conversion would label every row
 * one day early.
 */
export function stockholmDayOf(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('en-CA', {
    timeZone: 'Europe/Stockholm'
  });
}

/**
 * Reconstructs an absolute daily NAV series from Avanza's percent-development
 * chart. Each point's y is the % development since the period start, so with
 * the fund's CURRENT NAV anchoring the last point:
 *
 *   nav_t = currentNav * (1 + y_t/100) / (1 + y_last/100)
 *
 * `maxDate` (the official NAV date, 'YYYY-MM-DD') caps the series — nothing
 * dated after the officially published NAV is ever written.
 */
export function reconstructNavSeries(
  dataSerie: { x: number; y: number }[],
  currentNav: number,
  maxDate?: string
): { date: Date; marketPrice: number }[] {
  if (!dataSerie?.length || !(currentNav > 0)) {
    return [];
  }

  const lastFactor = 1 + dataSerie[dataSerie.length - 1].y / 100;

  if (!(lastFactor > 0)) {
    return [];
  }

  const rows: { date: Date; marketPrice: number }[] = [];
  const seenDates = new Set<string>();

  for (const { x, y } of dataSerie) {
    const factor = 1 + y / 100;

    if (!isFinite(factor) || factor <= 0) {
      continue;
    }

    const day = stockholmDayOf(x);

    if (maxDate && day > maxDate) {
      continue;
    }

    // Keep the last point of any duplicated day.
    if (seenDates.has(day)) {
      rows.pop();
    }

    seenDates.add(day);
    rows.push({
      date: new Date(`${day}T00:00:00Z`),
      marketPrice:
        Math.round(((currentNav * factor) / lastFactor) * 10000) / 10000
    });
  }

  return rows;
}

/**
 * Return/vol/drawdown metrics from an ordered (oldest-first) daily close
 * series. Fields are null when there is not enough history for the window.
 */
export function computeSeriesMetrics(closes: number[]): {
  annualVolPct: number | null;
  maxDrawdownPct: number | null;
  return1mPct: number | null;
  return1wPct: number | null;
  return1yPct: number | null;
  return3mPct: number | null;
  return6mPct: number | null;
} {
  const windowReturn = (tradingDays: number) => {
    if (closes.length <= tradingDays) {
      return null;
    }

    const start = closes[closes.length - 1 - tradingDays];
    const end = closes[closes.length - 1];

    return start > 0 ? (end / start - 1) * 100 : null;
  };

  let annualVolPct: number | null = null;

  if (closes.length >= 20) {
    const returns: number[] = [];

    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) {
        returns.push(Math.log(closes[i] / closes[i - 1]));
      }
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance =
      returns.reduce((a, b) => a + (b - mean) ** 2, 0) /
      Math.max(1, returns.length - 1);
    annualVolPct =
      Math.round(Math.sqrt(variance) * Math.sqrt(252) * 100 * 100) / 100;
  }

  let maxDrawdownPct: number | null = null;

  if (closes.length >= 20) {
    let peak = closes[0];
    let maxDrawdown = 0;

    for (const close of closes) {
      peak = Math.max(peak, close);

      if (peak > 0) {
        maxDrawdown = Math.max(maxDrawdown, 1 - close / peak);
      }
    }

    maxDrawdownPct = Math.round(maxDrawdown * 100 * 100) / 100;
  }

  const round2 = (value: number | null) =>
    value === null ? null : Math.round(value * 100) / 100;

  return {
    annualVolPct,
    maxDrawdownPct,
    return1mPct: round2(windowReturn(21)),
    return1wPct: round2(windowReturn(5)),
    return1yPct: round2(windowReturn(252)),
    return3mPct: round2(windowReturn(63)),
    return6mPct: round2(windowReturn(126))
  };
}

/**
 * Keeps every MANUAL mutual fund's facts fresh from Nordnet's own public fund
 * page (`{nordnetUrl}?details`) — the SOLE source. That anonymous,
 * server-rendered page carries the official NAV + date, all period returns
 * (1d/1w/1m/3m/6m/YTD/1y/3y/5y/10y), fee, Morningstar rating, standard
 * deviation, Sharpe, owner count, ISIN, currency, category and top holdings —
 * always the exact fund (the URL is unambiguous, so no share-class / currency
 * confusion like the earlier Avanza name-search which mis-priced SEB funds).
 *
 * The latest official NAV is written daily so a real price series accumulates
 * forward; the metric returns/vol/Sharpe come from Nordnet's own published
 * numbers immediately (no reconstruction). Nordnet's own timeseries API is
 * login-gated, so the full historical curve is not public — but it is not
 * needed for any metric here.
 *
 * Self-healing: a daily 07:30 cron plus an on-boot catch-up (runs whenever the
 * last successful sync is >20h old, e.g. after machine-off days). Every write
 * is idempotent (skipDuplicates).
 */
@Injectable()
export class FundHistoryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FundHistoryService.name);
  private syncRunning = false;

  public constructor(
    private readonly prismaService: PrismaService,
    private readonly propertyService: PropertyService
  ) {}

  public onApplicationBootstrap() {
    // Delayed so app startup (queues, providers) settles first; never blocks boot.
    setTimeout(() => {
      this.catchUpIfStale().catch((error) => {
        this.logger.error(`Fund-history boot catch-up failed: ${error}`);
      });
    }, 45_000);
  }

  // Daily at 07:30 — Nordnet/Avanza publish the previous day's NAV in the
  // morning, so this catches yesterday's close for every fund.
  @Cron('30 7 * * *')
  public async scheduledDailySync() {
    try {
      await this.syncAll();
    } catch (error) {
      this.logger.error(`Scheduled fund-history sync failed: ${error}`);
    }
  }

  /** Runs a full sync when the last successful one is missing or >20h old. */
  public async catchUpIfStale(): Promise<FundSyncSummary | null> {
    const lastSync = await this.propertyService.getByKey<string>(
      PROPERTY_FUND_HISTORY_LAST_SYNC
    );

    if (
      lastSync &&
      Date.now() - new Date(lastSync).getTime() < SYNC_STALE_AFTER_MS
    ) {
      return null;
    }

    this.logger.log(
      `Fund history is stale (last sync: ${lastSync ?? 'never'}) — catching up`
    );

    return this.syncAll();
  }

  /**
   * One full pass over every MANUAL fund: resolve its Avanza id, fetch the
   * one-year chart + guide facts, insert missing NAV days, cache the facts.
   */
  public async syncAll(): Promise<FundSyncSummary> {
    if (this.syncRunning) {
      this.logger.warn('Fund-history sync already running — skipping');

      return { navRowsInserted: 0, skipped: [], synced: [] };
    }

    this.syncRunning = true;

    try {
      return await this.runSync();
    } finally {
      this.syncRunning = false;
    }
  }

  /** Cached per-fund facts (rating/fee/Sharpe/AUM/exposure) from the last sync. */
  public async getFacts(): Promise<Record<string, FundFacts>> {
    return (
      (await this.propertyService.getByKey<Record<string, FundFacts>>(
        PROPERTY_FUND_FACTS
      )) ?? {}
    );
  }

  private async runSync(): Promise<FundSyncSummary> {
    const funds = await this.prismaService.symbolProfile.findMany({
      select: {
        assetSubClass: true,
        currency: true,
        isin: true,
        name: true,
        symbol: true
      },
      where: { dataSource: DataSource.MANUAL }
    });

    const catalogBySymbol = new Map(
      FUND_CATALOG.map((fund) => [fund.symbol, fund])
    );
    const facts = await this.getFacts();

    const summary: FundSyncSummary = {
      navRowsInserted: 0,
      skipped: [],
      synced: []
    };

    for (const fund of funds) {
      try {
        // Nordnet's own fund page (?details) is the SOLE source: it is
        // server-rendered anonymously and carries the official NAV, all period
        // returns, fee, Morningstar rating, standard deviation, Sharpe, owner
        // count, ISIN, currency, category and top holdings — always the exact
        // fund (no name-search / share-class ambiguity). Resolution order:
        // catalog nordnetUrl → CSV name map (Swedish-name normalized).
        const nordnetUrl =
          catalogBySymbol.get(fund.symbol)?.nordnetUrl ??
          nordnetUrlForName(
            restoreSwedishFundName(fund.name ?? fund.symbol)
          ) ??
          nordnetUrlForName(fund.name ?? fund.symbol);

        if (!nordnetUrl) {
          summary.skipped.push(fund.symbol);
          this.logger.warn(
            `${fund.symbol}: no Nordnet URL (not in catalog or CSV) — skipped`
          );
          continue;
        }

        const html = await this.fetchText(
          `${NORDNET_BASE_URL}${nordnetUrl}?details`
        );

        const details = html ? parseNordnetFundDetails(html) : {};

        if (!details.latestNav && !details.returns) {
          summary.skipped.push(fund.symbol);
          this.logger.warn(`${fund.symbol}: Nordnet page returned no data`);
          continue;
        }

        // Nordnet is the AUTHORITY for the trading currency. A wrong stored
        // currency (SEB C USD was stored SEK) must be corrected, purging the
        // now-mislabelled history so the official NAV rebuilds cleanly.
        if (details.currency && details.currency !== fund.currency) {
          this.logger.warn(
            `${fund.symbol}: correcting currency ${fund.currency} → ${details.currency} (Nordnet) and purging mislabelled history`
          );

          await this.prismaService.symbolProfile.updateMany({
            data: { currency: details.currency },
            where: { dataSource: DataSource.MANUAL, symbol: fund.symbol }
          });
          await this.prismaService.marketData.deleteMany({
            where: { dataSource: DataSource.MANUAL, symbol: fund.symbol }
          });

          fund.currency = details.currency;
        }

        // Store the latest OFFICIAL NAV (idempotent) so a real daily series
        // accumulates forward. Purge residual poison (any row >3x / <1/3x the
        // official NAV, i.e. a wrong-currency/share-class leftover) and never
        // keep a row dated after the official NAV date.
        if (details.latestNav) {
          const official = details.latestNav.value;

          await this.prismaService.marketData.deleteMany({
            where: {
              dataSource: DataSource.MANUAL,
              symbol: fund.symbol,
              OR: [
                { marketPrice: { gt: official * 3 } },
                { marketPrice: { lt: official / 3 } },
                { date: { gt: new Date(`${details.latestNav.date}T00:00:00Z`) } }
              ]
            }
          });

          const { count } = await this.prismaService.marketData.createMany({
            data: [
              {
                dataSource: DataSource.MANUAL,
                date: new Date(`${details.latestNav.date}T00:00:00Z`),
                marketPrice: official,
                symbol: fund.symbol
              }
            ],
            skipDuplicates: true
          });

          summary.navRowsInserted += count;
        }

        facts[fund.symbol] = {
          ...facts[fund.symbol],
          ...this.nordnetFactsPatch(details),
          updatedAt: new Date().toISOString()
        };

        // The technical indicators (RSI/MACD/Bollinger/score) need a DAILY
        // curve. Nordnet's own price-time-series CDN serves it anonymously
        // (the fund page's chart reads from it), keyed by the orderBook UUID —
        // the authoritative Nordnet daily series for EVERY fund, including its
        // own index funds. Backfill it when a fund still lacks local history.
        if (details.orderbookId && details.latestNav) {
          await this.backfillDailyFromNordnetCdn({
            currency: fund.currency,
            officialNav: details.latestNav.value,
            officialNavDate: details.latestNav.date,
            orderbookId: details.orderbookId,
            summary,
            symbol: fund.symbol
          });
        }

        // Backfill assetSubClass for old profiles so UI filters can rely on it.
        if (!fund.assetSubClass) {
          await this.prismaService.symbolProfile.updateMany({
            data: { assetSubClass: AssetSubClass.MUTUALFUND },
            where: { dataSource: DataSource.MANUAL, symbol: fund.symbol }
          });
        }

        summary.synced.push(fund.symbol);
      } catch (error) {
        summary.skipped.push(fund.symbol);
        this.logger.warn(`Fund-history sync failed for ${fund.symbol}: ${error}`);
      }

      await new Promise((resolve) => setTimeout(resolve, PER_FUND_DELAY_MS));
    }

    await this.propertyService.put({
      key: PROPERTY_FUND_FACTS,
      value: JSON.stringify(facts)
    });
    await this.propertyService.put({
      key: PROPERTY_FUND_HISTORY_LAST_SYNC,
      value: JSON.stringify(new Date().toISOString())
    });

    this.logger.log(
      `Fund-history sync (Nordnet): ${summary.synced.length} synced, ${summary.skipped.length} skipped, ${summary.navRowsInserted} NAV rows inserted`
    );

    return summary;
  }

  /** Maps parsed Nordnet page details into cached FundFacts. */
  private nordnetFactsPatch(details: NordnetFundDetails): Partial<FundFacts> {
    const byPeriod = new Map(
      (details.returns ?? []).map(({ development, period }) => [
        period,
        development
      ])
    );

    const developments =
      byPeriod.size > 0
        ? {
            oneDay: byPeriod.get('DAY_1'),
            oneMonth: byPeriod.get('MONTH_1'),
            oneWeek: byPeriod.get('WEEK_1'),
            oneYear: byPeriod.get('YEAR_1'),
            sixMonths: byPeriod.get('MONTH_6'),
            threeMonths: byPeriod.get('MONTH_3'),
            threeYears: byPeriod.get('YEAR_3'),
            thisYear: byPeriod.get('YTD')
          }
        : undefined;

    return {
      ...(details.isin ? { isin: details.isin } : {}),
      ...(details.category ? { nordnetCategory: details.category } : {}),
      ...(details.feePct != null ? { feePct: details.feePct } : {}),
      ...(details.managementFeePct != null
        ? { productFeePct: details.managementFeePct }
        : {}),
      ...(details.owners != null ? { owners: details.owners } : {}),
      ...(details.rating != null ? { rating: details.rating } : {}),
      ...(details.sharpeRatio != null
        ? { sharpeRatio: details.sharpeRatio }
        : {}),
      ...(details.standardDeviation != null
        ? { standardDeviation: details.standardDeviation }
        : {}),
      ...(details.holdings ? { topHoldings: details.holdings } : {}),
      ...(details.latestNav ? { navDate: details.latestNav.date } : {}),
      ...(developments ? { developments } : {})
    };
  }

  /**
   * Backfills a one-year daily NAV series from Nordnet's own public
   * price-time-series CDN (the same source the fund page's chart reads from),
   * keyed by the fund's orderBook UUID. The CDN returns %-development points;
   * they are anchored to Nordnet's authoritative official NAV, using the
   * fund's currency as `fundType=FUND_<CCY>`. This is the authoritative daily
   * series for EVERY fund, including Nordnet's own index funds. Skips once the
   * fund already has enough local history; never throws.
   */
  private async backfillDailyFromNordnetCdn({
    currency,
    officialNav,
    officialNavDate,
    orderbookId,
    summary,
    symbol
  }: {
    currency: string;
    officialNav: number;
    officialNavDate?: string;
    orderbookId: string;
    summary: FundSyncSummary;
    symbol: string;
  }): Promise<void> {
    const existing = await this.prismaService.marketData.count({
      where: { dataSource: DataSource.MANUAL, symbol }
    });

    if (existing >= MIN_CLOSES_FOR_INDICATORS) {
      return;
    }

    const url =
      `${NORDNET_CDN_URL}/period/YEAR_1/identifier/${orderbookId}` +
      `?fundType=FUND_${currency}`;

    const payload = await this.fetchJson(url, {
      Referer: 'https://www.nordnet.se/',
      'x-locale': 'sv-SE'
    });

    const pricePoints: { timeStamp: number; value: number }[] =
      payload?.pricePoints ?? [];

    if (pricePoints.length === 0) {
      return;
    }

    // The CDN series is %-development; reuse the anchor-to-NAV reconstruction.
    const rows = reconstructNavSeries(
      pricePoints.map(({ timeStamp, value }) => ({ x: timeStamp, y: value })),
      officialNav,
      officialNavDate
    );

    if (rows.length === 0) {
      return;
    }

    const { count } = await this.prismaService.marketData.createMany({
      data: rows.map(({ date, marketPrice }) => ({
        dataSource: DataSource.MANUAL,
        date,
        marketPrice,
        symbol
      })),
      skipDuplicates: true
    });

    summary.navRowsInserted += count;
    this.logger.log(
      `${symbol}: backfilled ${count} Nordnet daily NAVs from the price-time-series CDN`
    );
  }

  private async fetchJson(
    url: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<any | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          ...extraHeaders
        },
        signal: controller.signal
      });

      return response.ok ? await response.json() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchText(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal
      });

      if (!response.ok) {
        return null;
      }

      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
