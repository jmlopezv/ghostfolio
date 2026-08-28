import { DataSource } from '@prisma/client';

/**
 * Builds TradingView symbol-page URLs from the Yahoo tickers used everywhere
 * else in this fork.
 *
 * TradingView addresses an instrument as `EXCHANGE-TICKER`, and it is strict
 * about it: `NASDAQ-AAL` resolves while `NYSE-AAL` is a 404. Dropping the
 * exchange is not a safe shortcut either — a bare ticker resolves to whichever
 * listing TradingView considers primary, so bare `AIR` lands on Airbus in Paris
 * rather than the US-listed AAR Corp we actually track. The exchange therefore
 * has to be derived, and it comes from two places:
 *
 *  - non-US tickers carry a Yahoo suffix (`.ST`, `.DE`, …) that maps 1:1 onto a
 *    TradingView exchange, so they are pure string work;
 *  - US tickers carry no suffix at all, so their venue is baked into
 *    `TRADINGVIEW_US_EXCHANGE` below, generated from Yahoo's own
 *    `price.exchange` field rather than typed by hand.
 *
 * The two families also disagree about how a share class is written: Yahoo's
 * `BRK-B` is TradingView's `BRK.B`, but Yahoo's `ASSA-B.ST` is TradingView's
 * `ASSA_B`. Hence `separatorFor`, rather than one global replace.
 */

/** Yahoo ticker suffix → TradingView exchange prefix. */
export const TRADINGVIEW_EXCHANGE_BY_SUFFIX: Record<string, string> = {
  AS: 'EURONEXT', // Amsterdam
  BR: 'EURONEXT', // Brussels
  CO: 'OMXCOP', // Copenhagen
  DE: 'XETR', // Xetra
  HE: 'OMXHEX', // Helsinki
  HK: 'HKEX',
  IR: 'EURONEXT', // Dublin
  L: 'LSE', // London
  LS: 'EURONEXT', // Lisbon
  MC: 'BME', // Madrid
  MI: 'MIL', // Milan
  OL: 'OSL', // Oslo
  PA: 'EURONEXT', // Paris
  ST: 'OMXSTO', // Stockholm
  SW: 'SIX', // Swiss
  TO: 'TSX', // Toronto
  VI: 'VIE', // Vienna
  WA: 'GPW' // Warsaw
};

/** US venues, where the ticker alone cannot tell us the exchange. */
const US_EXCHANGES = new Set(['AMEX', 'NASDAQ', 'NYSE', 'OTC']);

/**
 * Symbols Yahoo still quotes but TradingView no longer has a page for —
 * typically a company taken private or acquired, where TradingView retires the
 * listing before the quote feed does. Linking them produces a 404, and falling
 * back to the bare ticker is worse than no link at all: bare `EA` resolves to
 * an unrelated Thai company (SET:EA), which looks like a working chart.
 *
 * Verified live, not assumed. Remove an entry once TradingView has a page
 * again; the whole-watchlist validation script is what surfaces these.
 */
const TRADINGVIEW_UNAVAILABLE = new Set(['EA']);

/**
 * Venue for every suffix-less (US-listed) symbol on the watchlist, generated
 * from Yahoo `quoteSummary(symbol, { modules: ['price'] }).price.exchange`:
 * `NYQ → NYSE`, `NMS`/`NGM`/`NCM → NASDAQ`, `ASE`/`PCX`/`BTS → AMEX`,
 * `OQX`/`PNK → OTC` (the ADRs). Regenerate rather than edit by hand when new
 * US tickers are added; until then they fall back to the bare-ticker URL.
 */
export const TRADINGVIEW_US_EXCHANGE: Record<string, string> = {
  AAL: 'NASDAQ',
  AAPL: 'NASDAQ',
  ABBV: 'NYSE',
  ADBE: 'NASDAQ',
  AEP: 'NASDAQ',
  AIR: 'NYSE',
  ALAB: 'NASDAQ',
  AMAT: 'NASDAQ',
  AMD: 'NASDAQ',
  AMGN: 'NASDAQ',
  AMR: 'NYSE',
  AMT: 'NYSE',
  AMZN: 'NASDAQ',
  ANET: 'NYSE',
  APH: 'NYSE',
  ARM: 'NASDAQ',
  ASMIY: 'OTC',
  ASML: 'NASDAQ',
  AVAL: 'NYSE',
  AVGO: 'NASDAQ',
  AXP: 'NYSE',
  AZN: 'NYSE',
  BA: 'NYSE',
  BABA: 'NYSE',
  BAC: 'NYSE',
  BAM: 'NYSE',
  BBVA: 'NYSE',
  BHP: 'NYSE',
  BIDU: 'NASDAQ',
  BKNG: 'NASDAQ',
  BP: 'NYSE',
  'BRK-B': 'NYSE',
  C: 'NYSE',
  CARR: 'NYSE',
  CAT: 'NYSE',
  CL: 'NYSE',
  COST: 'NASDAQ',
  CRM: 'NYSE',
  CRWD: 'NASDAQ',
  CSCO: 'NASDAQ',
  CVX: 'NYSE',
  DAL: 'NYSE',
  DDOG: 'NASDAQ',
  DE: 'NYSE',
  DELL: 'NYSE',
  DIS: 'NYSE',
  DUK: 'NYSE',
  EA: 'NASDAQ',
  EC: 'NYSE',
  ETN: 'NYSE',
  F: 'NYSE',
  FCX: 'NYSE',
  FDX: 'NYSE',
  GE: 'NYSE',
  GM: 'NYSE',
  GOOGL: 'NASDAQ',
  GS: 'NYSE',
  GT: 'NASDAQ',
  HD: 'NYSE',
  HMC: 'NYSE',
  HON: 'NASDAQ',
  HSBC: 'NYSE',
  HTHIY: 'OTC',
  IBM: 'NYSE',
  ING: 'NYSE',
  INTC: 'NASDAQ',
  IONQ: 'NYSE',
  IR: 'NYSE',
  ISRG: 'NASDAQ',
  JCI: 'NYSE',
  JNJ: 'NYSE',
  JPM: 'NYSE',
  KLAR: 'NYSE',
  KMB: 'NASDAQ',
  KO: 'NYSE',
  LIN: 'NASDAQ',
  LLY: 'NYSE',
  LMT: 'NYSE',
  LOW: 'NYSE',
  LRCX: 'NASDAQ',
  LTM: 'NYSE',
  LULU: 'NASDAQ',
  MA: 'NYSE',
  MCD: 'NYSE',
  MDB: 'NASDAQ',
  MDLZ: 'NASDAQ',
  MELI: 'NASDAQ',
  META: 'NASDAQ',
  MRK: 'NYSE',
  MSFT: 'NASDAQ',
  MU: 'NASDAQ',
  NDAQ: 'NASDAQ',
  NEE: 'NYSE',
  NET: 'NYSE',
  NFLX: 'NASDAQ',
  NKE: 'NYSE',
  NOC: 'NYSE',
  NOW: 'NYSE',
  NU: 'NYSE',
  NVDA: 'NASDAQ',
  ONON: 'NYSE',
  ORCL: 'NYSE',
  PANW: 'NASDAQ',
  PEP: 'NASDAQ',
  PFE: 'NYSE',
  PG: 'NYSE',
  PLD: 'NYSE',
  PLNT: 'NYSE',
  PLTR: 'NASDAQ',
  PYPL: 'NASDAQ',
  QBTS: 'NASDAQ',
  QCOM: 'NASDAQ',
  QUBT: 'NASDAQ',
  RACE: 'NYSE',
  RGTI: 'NASDAQ',
  RHHBY: 'OTC',
  RIO: 'NYSE',
  RTX: 'NYSE',
  RVMD: 'NASDAQ',
  RYAAY: 'NASDAQ',
  SAN: 'NYSE',
  SAP: 'NYSE',
  SBUX: 'NASDAQ',
  SHEL: 'NYSE',
  SNDK: 'NASDAQ',
  SNOW: 'NYSE',
  SPOT: 'NYSE',
  STLA: 'NYSE',
  T: 'NYSE',
  TCTZF: 'OTC',
  TEL: 'NYSE',
  TM: 'NYSE',
  TMO: 'NYSE',
  TMUS: 'NASDAQ',
  TRV: 'NYSE',
  TSLA: 'NASDAQ',
  TSM: 'NYSE',
  TT: 'NYSE',
  TXN: 'NASDAQ',
  UAL: 'NASDAQ',
  UBER: 'NYSE',
  UNH: 'NYSE',
  UNP: 'NYSE',
  UPS: 'NYSE',
  USAR: 'NASDAQ',
  V: 'NYSE',
  VALE: 'NYSE',
  VZ: 'NYSE',
  WBD: 'NASDAQ',
  WM: 'NYSE',
  WMT: 'NASDAQ',
  XOM: 'NYSE'
};

/**
 * Yahoo writes a share class with a dash; TradingView writes it with a dot on
 * US venues (`BRK-B` → `BRK.B`) and an underscore everywhere else
 * (`ASSA-B.ST` → `ASSA_B`). Both verified live — the wrong one 404s.
 */
function separatorFor(exchange: string | null): string {
  return exchange !== null && US_EXCHANGES.has(exchange) ? '.' : '_';
}

/**
 * TradingView's `EXCHANGE-TICKER` identifier for a symbol, or null when there
 * is no page to link to.
 *
 * Null covers three real cases: non-YAHOO symbols (the MANUAL Nordnet/Avanza
 * funds have no market listing anywhere — the same reason the dialog already
 * withholds its Yahoo and Perplexity links from them), suffixes we have no
 * mapping for, where guessing would produce a broken link rather than no link,
 * and listings TradingView has retired (see TRADINGVIEW_UNAVAILABLE).
 */
export function toTradingViewSymbol({
  dataSource,
  symbol
}: {
  dataSource: DataSource | string;
  symbol: string;
}): string | null {
  if (
    dataSource !== DataSource.YAHOO ||
    !symbol ||
    TRADINGVIEW_UNAVAILABLE.has(symbol)
  ) {
    return null;
  }

  const separatorIndex = symbol.lastIndexOf('.');

  if (separatorIndex === -1) {
    // US listing: the generated map knows the venue; a ticker added since the
    // map was generated still gets a usable (if occasionally ambiguous) link.
    const exchange = TRADINGVIEW_US_EXCHANGE[symbol] ?? null;
    const ticker = symbol.split('-').join(separatorFor(exchange));

    return exchange === null ? ticker : `${exchange}-${ticker}`;
  }

  const suffix = symbol.slice(separatorIndex + 1);
  const exchange = TRADINGVIEW_EXCHANGE_BY_SUFFIX[suffix];

  if (!exchange) {
    return null;
  }

  const ticker = symbol
    .slice(0, separatorIndex)
    .split('-')
    .join(separatorFor(exchange));

  return `${exchange}-${ticker}`;
}

/** Full TradingView symbol-page URL, or null when the symbol has no page. */
export function toTradingViewUrl(item: {
  dataSource: DataSource | string;
  symbol: string;
}): string | null {
  const tradingViewSymbol = toTradingViewSymbol(item);

  return tradingViewSymbol === null
    ? null
    : `https://www.tradingview.com/symbols/${tradingViewSymbol}/`;
}
