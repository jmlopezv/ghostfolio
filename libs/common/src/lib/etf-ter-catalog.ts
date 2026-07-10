/**
 * Curated TER (total expense ratio) table for Nordnet-tradeable ETFs that are
 * NOT in the MANUAL fund catalog (fund-catalog.ts) - i.e. real Yahoo-priced
 * tickers. Populated by hand from issuer/justETF factsheets. Stocks (non-ETF
 * equities) simply have no entry here; `terPctForSymbol` returns null,
 * meaning "not applicable", not "unknown".
 */

export interface EtfTerEntry {
  /** The Yahoo ticker used elsewhere as CatalogCompany.symbol / StrategyCandidate.symbol. */
  symbol: string;
  /** Annual expense ratio as a fraction, e.g. 0.0018 for 18bps. */
  terPct: number;
  name?: string;
}

export const ETF_TER_CATALOG: EtfTerEntry[] = [
  { symbol: 'IS3N.DE', name: 'iShares Core MSCI EM IMI UCITS ETF', terPct: 0.0018 },
  { symbol: 'EUNK.DE', name: 'iShares Core MSCI Europe UCITS ETF EUR (Acc)', terPct: 0.0012 },
  { symbol: 'IUSQ.DE', name: 'iShares MSCI ACWI UCITS ETF', terPct: 0.002 },
  { symbol: 'QDVE.DE', name: 'iShares S&P 500 Information Technology Sector UCITS ETF', terPct: 0.0015 },
  { symbol: 'LYMS.DE', name: 'Amundi Core Nasdaq-100 Swap UCITS ETF Acc', terPct: 0.0022 },
  { symbol: 'IQQH.DE', name: 'iShares Global Clean Energy Transition UCITS ETF', terPct: 0.0065 },
  { symbol: '2B76.DE', name: 'iShares Automation & Robotics UCITS ETF', terPct: 0.004 },
  { symbol: 'DFNS.MI', name: 'VanEck Defense UCITS ETF', terPct: 0.0055 },
  { symbol: 'IUSN.DE', name: 'iShares MSCI World Small Cap UCITS ETF', terPct: 0.0035 },
  { symbol: 'XESC.DE', name: 'Xtrackers Euro Stoxx 50 UCITS ETF 1C', terPct: 0.0009 },
  { symbol: 'XACTC25.CO', name: 'XACT OMXC25 ESG UCITS ETF', terPct: 0.002 },
  { symbol: 'SEC0.DE', name: 'iShares MSCI Global Semiconductors UCITS ETF', terPct: 0.0035 }
];

const TER_BY_SYMBOL = new Map(
  ETF_TER_CATALOG.map(({ symbol, terPct }) => [symbol, terPct])
);

export function terPctForSymbol(symbol: string): number | null {
  return TER_BY_SYMBOL.get(symbol) ?? null;
}
