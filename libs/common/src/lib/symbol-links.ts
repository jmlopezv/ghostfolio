/**
 * Research links for a symbol — Yahoo Finance, TradingView, Perplexity Finance.
 *
 * One place for all three so the ticker dialog, the Telegram leader alert and
 * anything added later cannot drift apart. Before this module the Yahoo and
 * Perplexity URLs were written inline in `benchmark-detail-dialog.html` and
 * duplicated again in `home-academy.html`.
 *
 * TradingView is re-exported rather than reimplemented: addressing an
 * instrument there needs an exchange prefix and per-venue share-class rules,
 * which `./tradingview` already solves against a verified exchange map.
 *
 * Every builder returns `null` for a symbol with no public listing, so a caller
 * renders nothing rather than a broken link. That is the MANUAL Nordnet/Avanza
 * funds, which exist only inside this fork.
 */
import { DataSource } from '@prisma/client';

import { toTradingViewUrl } from './tradingview';

export { toTradingViewSymbol, toTradingViewUrl } from './tradingview';

export interface SymbolLinkTarget {
  dataSource: DataSource | string;
  symbol: string;
}

/** True when the symbol is a real listing we can link out to. */
function isLinkable({ dataSource, symbol }: SymbolLinkTarget): boolean {
  return dataSource === DataSource.YAHOO && Boolean(symbol);
}

/**
 * Yahoo Finance quote page.
 *
 * Yahoo addresses instruments by exactly the ticker this fork already stores
 * (`UNP`, `ASSA-B.ST`), so this is a straight substitution — no venue mapping,
 * unlike TradingView.
 */
export function toYahooFinanceUrl(item: SymbolLinkTarget): string | null {
  return isLinkable(item)
    ? `https://finance.yahoo.com/quote/${encodeURIComponent(item.symbol)}/`
    : null;
}

/**
 * Yahoo Finance *profile* page — company description, sector, officers.
 *
 * Kept separate from the quote page rather than folded into a parameter: the
 * ticker dialog wants the company write-up, while an alert wants the price and
 * chart. Two names make the choice explicit at each call site.
 */
export function toYahooFinanceProfileUrl(
  item: SymbolLinkTarget
): string | null {
  const url = toYahooFinanceUrl(item);

  return url === null ? null : `${url}profile/`;
}

/** Perplexity Finance page — the same ticker convention as Yahoo. */
export function toPerplexityFinanceUrl(item: SymbolLinkTarget): string | null {
  return isLinkable(item)
    ? `https://www.perplexity.ai/finance/${encodeURIComponent(item.symbol)}`
    : null;
}

/**
 * All three links, in the order they are presented to the user: quote first,
 * chart second, research last. Entries with no page are omitted rather than
 * rendered dead, so a caller can join whatever survives.
 */
export function researchLinks(
  item: SymbolLinkTarget
): { label: string; url: string }[] {
  return [
    { label: 'Yahoo', url: toYahooFinanceUrl(item) },
    { label: 'TradingView', url: toTradingViewUrl(item) },
    { label: 'Perplexity', url: toPerplexityFinanceUrl(item) }
  ].filter((link): link is { label: string; url: string } => link.url !== null);
}
