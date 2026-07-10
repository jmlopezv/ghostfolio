import { ScraperConfiguration } from '@ghostfolio/common/interfaces';

import { Injectable, Logger } from '@nestjs/common';

const AVANZA_SEARCH_URL =
  'https://www.avanza.se/_api/search/filtered-search';
const AVANZA_FUND_GUIDE = 'https://www.avanza.se/_api/fund-guide/guide';
const NORDNET_BASE_URL = 'https://www.nordnet.se';
// Matches the "NAV (6 juli) 841,65 SEK" label/value pair on Nordnet's public
// fund detail pages — validated 2026-07-07 against index, fund-of-funds, and
// feeder-fund page layouts, all currencies render with a comma decimal even
// for USD/EUR-denominated funds (site-wide sv-SE formatting).
const NORDNET_NAV_SELECTOR = 'span:contains("NAV") + span';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 8000;

/**
 * Resolves Nordic funds on Avanza's public JSON API and builds the Ghostfolio
 * MANUAL scraper configuration that pulls a fund's daily NAV. No account or
 * Nordnet API needed. Endpoints validated 2026-06-16:
 *   - POST /_api/search/filtered-search { query } -> hits[].orderBookId (FUND)
 *   - GET  /_api/fund-guide/guide/{orderBookId} -> application/json { nav }
 * Also builds a Nordnet-direct config (validated 2026-07-07) for funds with a
 * known `nordnetUrl` — covers Nordnet's own house funds, which Avanza (a
 * competitor) doesn't list, plus anything cheaper to resolve precisely by URL
 * than by fuzzy name search. Never throws.
 */
@Injectable()
export class FundDataService {
  private readonly logger = new Logger(FundDataService.name);

  /**
   * Finds a fund's Avanza orderbook id by ISIN, falling back to a name search.
   * Returns null when nothing matches (caller then skips/flags the fund).
   */
  public async resolveOrderbookId({
    isin,
    name
  }: {
    isin?: string;
    name?: string;
  }): Promise<string | null> {
    for (const query of [isin, name].filter(Boolean)) {
      const id = await this.searchFund(query);

      if (id) {
        return id;
      }
    }

    return null;
  }

  /** Scraper config that reads the live NAV from the fund-guide JSON endpoint. */
  public buildScraperConfiguration(orderbookId: string): ScraperConfiguration {
    return {
      // 'lazy': scraped during the data-gathering job and stored in MarketData,
      // so per-quote reads stay cheap (no live request on every signal run).
      mode: 'lazy',
      locale: 'sv-SE',
      selector: '$.nav',
      url: `${AVANZA_FUND_GUIDE}/${orderbookId}`
    } as ScraperConfiguration;
  }

  /**
   * Scraper config that reads the live NAV straight off a Nordnet fund detail
   * page (`nordnetUrl` is a `CatalogFund`'s relative path, e.g.
   * '/fonder/lista/nordnet-global-index-sek-0c65c468'). Preferred over Avanza
   * whenever known: precise (no fuzzy name search) and covers Nordnet's own
   * funds Avanza can't list.
   */
  public buildNordnetScraperConfiguration(
    nordnetUrl: string
  ): ScraperConfiguration {
    return {
      mode: 'lazy',
      locale: 'sv-SE',
      selector: NORDNET_NAV_SELECTOR,
      url: `${NORDNET_BASE_URL}${nordnetUrl}`
    } as ScraperConfiguration;
  }

  /**
   * Static-price config for funds with no public price feed and no known
   * Nordnet URL. `defaultMarketPrice` makes the gather fill MarketData with
   * the seed NAV; the user updates it periodically — last resort only.
   */
  public buildSeedScraperConfiguration(seedNav: number): ScraperConfiguration {
    return { defaultMarketPrice: seedNav, locale: 'sv-SE' } as ScraperConfiguration;
  }

  private async searchFund(query: string): Promise<string | null> {
    try {
      const response = await this.fetchJson(AVANZA_SEARCH_URL, {
        body: JSON.stringify({
          query,
          pagination: { from: 0, size: 5 }
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT
        },
        method: 'POST'
      });

      const hits: any[] = response?.hits ?? [];
      const fund = hits.find(
        (hit) => hit?.type === 'FUND' && hit?.orderBookId && hit?.buyable !== false
      );

      return fund?.orderBookId ? `${fund.orderBookId}` : null;
    } catch (error) {
      this.logger.warn(`Avanza search failed for "${query}": ${error}`);

      return null;
    }
  }

  private async fetchJson(
    url: string,
    init: RequestInit
  ): Promise<any | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
