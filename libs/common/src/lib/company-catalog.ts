/**
 * Curated catalog of well-known, Nordnet-tradeable leading companies grouped by
 * category. Doubles as (1) the list of symbols to add to the watchlist and
 * (2) the source of truth for the category label the strategies engine reads
 * back (Ghostfolio's Tag model only attaches to activities, not watchlist
 * symbols, so we keep our own taxonomy here).
 *
 * Yahoo tickers + native currency. Unknown/unsupported tickers are skipped
 * gracefully at import time, so an occasional wrong symbol is non-fatal.
 */

export interface CatalogCompany {
  currency: string;
  dataSource: 'YAHOO';
  name: string;
  symbol: string;
}

export interface CatalogCategory {
  category: string;
  companies: CatalogCompany[];
}

const y = (symbol: string, name: string, currency: string): CatalogCompany => ({
  currency,
  dataSource: 'YAHOO',
  name,
  symbol
});

export const COMPANY_CATALOG: CatalogCategory[] = [
  {
    category: 'tech',
    companies: [
      y('AAPL', 'Apple', 'USD'),
      y('MSFT', 'Microsoft', 'USD'),
      y('GOOGL', 'Alphabet', 'USD'),
      y('NVDA', 'NVIDIA', 'USD'),
      y('AMZN', 'Amazon', 'USD'),
      y('META', 'Meta Platforms', 'USD'),
      y('AMD', 'Advanced Micro Devices', 'USD'),
      y('TSM', 'Taiwan Semiconductor', 'USD'),
      y('NOW', 'ServiceNow', 'USD'),
      y('CRM', 'Salesforce', 'USD'),
      y('ADBE', 'Adobe', 'USD'),
      y('UBER', 'Uber Technologies', 'USD'),
      // Cybersecurity + networking leaders (added 2026-07-09, heatmap gap analysis).
      y('CRWD', 'CrowdStrike', 'USD'),
      y('CSCO', 'Cisco Systems', 'USD'),
      y('ANET', 'Arista Networks', 'USD')
    ]
  },
  {
    category: 'quantum-computing',
    companies: [
      y('IONQ', 'IonQ', 'USD'),
      y('RGTI', 'Rigetti Computing', 'USD'),
      y('QBTS', 'D-Wave Quantum', 'USD'),
      y('QUBT', 'Quantum Computing Inc', 'USD'),
      y('IBM', 'IBM', 'USD')
    ]
  },
  {
    category: 'bank',
    companies: [
      y('JPM', 'JPMorgan Chase', 'USD'),
      y('GS', 'Goldman Sachs', 'USD'),
      y('BAC', 'Bank of America', 'USD'),
      y('NDA-SE.ST', 'Nordea Bank', 'SEK'),
      y('SEB-A.ST', 'SEB', 'SEK'),
      y('SWED-A.ST', 'Swedbank', 'SEK'),
      y('DANSKE.CO', 'Danske Bank', 'DKK'),
      y('DNB.OL', 'DNB Bank', 'NOK'),
      y('SHB-A.ST', 'Svenska Handelsbanken', 'SEK'),
      y('DBK.DE', 'Deutsche Bank', 'EUR')
    ]
  },
  {
    category: 'insurance',
    companies: [
      y('TRV', 'Travelers', 'USD'),
      y('ALV.DE', 'Allianz', 'EUR'),
      y('CS.PA', 'AXA', 'EUR'),
      y('ZURN.SW', 'Zurich Insurance', 'CHF'),
      y('SAMPO.HE', 'Sampo', 'EUR')
    ]
  },
  {
    category: 'cars',
    companies: [
      y('TSLA', 'Tesla', 'USD'),
      y('GM', 'General Motors', 'USD'),
      y('STLA', 'Stellantis', 'USD'),
      y('VOW3.DE', 'Volkswagen', 'EUR'),
      y('BMW.DE', 'BMW', 'EUR'),
      y('MBG.DE', 'Mercedes-Benz', 'EUR'),
      y('VOLCAR-B.ST', 'Volvo Car', 'SEK'),
      y('RACE', 'Ferrari', 'USD')
    ]
  },
  {
    category: 'aviation',
    companies: [
      y('BA', 'Boeing', 'USD'),
      y('DAL', 'Delta Air Lines', 'USD'),
      y('AIR.PA', 'Airbus', 'EUR'),
      y('LHA.DE', 'Lufthansa', 'EUR'),
      y('RYA.IR', 'Ryanair', 'EUR'),
      y('NAS.OL', 'Norwegian Air Shuttle', 'NOK')
    ]
  },
  {
    category: 'clothing-sport-fashion',
    companies: [
      y('NKE', 'Nike', 'USD'),
      y('LULU', 'Lululemon', 'USD'),
      y('ADS.DE', 'Adidas', 'EUR'),
      y('MC.PA', 'LVMH', 'EUR'),
      y('HM-B.ST', 'H&M', 'SEK'),
      y('ITX.MC', 'Inditex', 'EUR')
    ]
  },
  {
    category: 'construction',
    companies: [
      y('CAT', 'Caterpillar', 'USD'),
      y('DG.PA', 'Vinci', 'EUR'),
      y('SKA-B.ST', 'Skanska', 'SEK'),
      y('ASSA-B.ST', 'Assa Abloy', 'SEK')
    ]
  },
  {
    category: 'databases',
    companies: [
      y('ORCL', 'Oracle', 'USD'),
      y('MDB', 'MongoDB', 'USD'),
      y('SNOW', 'Snowflake', 'USD'),
      y('PLTR', 'Palantir', 'USD')
    ]
  },
  {
    category: 'energy-petrol',
    companies: [
      y('XOM', 'ExxonMobil', 'USD'),
      y('CVX', 'Chevron', 'USD'),
      y('SHEL', 'Shell', 'USD'),
      y('BP', 'BP', 'USD'),
      y('EQNR.OL', 'Equinor', 'NOK'),
      y('TTE.PA', 'TotalEnergies', 'EUR'),
      y('AKRBP.OL', 'Aker BP', 'NOK')
    ]
  },
  {
    category: 'entertainment',
    companies: [
      y('DIS', 'Walt Disney', 'USD'),
      y('NFLX', 'Netflix', 'USD'),
      y('SPOT', 'Spotify', 'USD'),
      y('WBD', 'Warner Bros. Discovery', 'USD'),
      y('EA', 'Electronic Arts', 'USD')
    ]
  },
  {
    category: 'funds',
    companies: [
      y('IWDA.AS', 'iShares Core MSCI World', 'EUR'),
      y('VWCE.DE', 'Vanguard FTSE All-World', 'EUR'),
      y('CSPX.AS', 'iShares Core S&P 500', 'USD')
    ]
  },
  {
    category: 'food',
    companies: [
      y('KO', 'Coca-Cola', 'USD'),
      y('PEP', 'PepsiCo', 'USD'),
      y('MCD', "McDonald's", 'USD'),
      y('MDLZ', 'Mondelez', 'USD'),
      y('NESN.SW', 'Nestle', 'CHF'),
      y('ORK.OL', 'Orkla', 'NOK'),
      y('OR.PA', "L'Oreal", 'EUR'),
      y('UNA.AS', 'Unilever', 'EUR'),
      y('CARL-B.CO', 'Carlsberg', 'DKK')
    ]
  },
  {
    category: 'health',
    companies: [
      y('JNJ', 'Johnson & Johnson', 'USD'),
      y('PFE', 'Pfizer', 'USD'),
      y('UNH', 'UnitedHealth', 'USD'),
      y('AZN', 'AstraZeneca', 'USD'),
      y('NOVO-B.CO', 'Novo Nordisk', 'DKK'),
      y('ESSITY-B.ST', 'Essity', 'SEK'),
      y('COLO-B.CO', 'Coloplast', 'DKK'),
      // Recently returned to consistent profitability - included but flagged.
      y('AMBU-B.CO', 'Ambu', 'DKK'),
      // Med-tech / life-science leaders (added 2026-07-09, heatmap gap analysis).
      y('ISRG', 'Intuitive Surgical', 'USD'),
      y('TMO', 'Thermo Fisher Scientific', 'USD')
    ]
  },
  {
    category: 'logistics',
    companies: [
      y('UPS', 'United Parcel Service', 'USD'),
      y('FDX', 'FedEx', 'USD'),
      y('MAERSK-B.CO', 'A.P. Moller-Maersk', 'DKK'),
      y('DSV.CO', 'DSV', 'DKK')
    ]
  },
  {
    category: 'manufacturing-cooling',
    companies: [
      y('CARR', 'Carrier Global', 'USD'),
      y('TT', 'Trane Technologies', 'USD'),
      y('JCI', 'Johnson Controls', 'USD'),
      y('SIE.DE', 'Siemens', 'EUR'),
      y('ATCO-A.ST', 'Atlas Copco', 'SEK'),
      y('ABB.ST', 'ABB', 'SEK')
    ]
  },
  {
    category: 'metals-mining',
    companies: [
      y('BHP', 'BHP Group', 'USD'),
      y('RIO', 'Rio Tinto', 'USD'),
      y('VALE', 'Vale', 'USD'),
      y('FCX', 'Freeport-McMoRan', 'USD'),
      y('BOL.ST', 'Boliden', 'SEK'),
      y('NHY.OL', 'Norsk Hydro', 'NOK')
    ]
  },
  {
    category: 'semiconductors',
    companies: [
      y('ASML', 'ASML Holding', 'USD'),
      y('AVGO', 'Broadcom', 'USD'),
      y('QCOM', 'Qualcomm', 'USD'),
      y('INTC', 'Intel', 'USD'),
      y('MU', 'Micron Technology', 'USD'),
      y('ARM', 'Arm Holdings', 'USD'),
      y('IFX.DE', 'Infineon Technologies', 'EUR'),
      y('ASM.AS', 'ASM International', 'EUR'),
      // Semicap equipment + analog (added 2026-07-09, heatmap gap analysis).
      y('AMAT', 'Applied Materials', 'USD'),
      y('LRCX', 'Lam Research', 'USD'),
      y('TXN', 'Texas Instruments', 'USD')
    ]
  },
  {
    category: 'payments',
    companies: [
      y('V', 'Visa', 'USD'),
      y('MA', 'Mastercard', 'USD'),
      y('PYPL', 'PayPal', 'USD'),
      y('ADYEN.AS', 'Adyen', 'EUR')
    ]
  },
  {
    category: 'pharma',
    companies: [
      y('LLY', 'Eli Lilly', 'USD'),
      y('MRK', 'Merck & Co', 'USD'),
      y('ABBV', 'AbbVie', 'USD'),
      y('GMAB.CO', 'Genmab', 'DKK'),
      y('NOVN.SW', 'Novartis', 'CHF'),
      y('RO.SW', 'Roche Holding', 'CHF'),
      y('SAN.PA', 'Sanofi', 'EUR')
    ]
  },
  {
    category: 'defense',
    companies: [
      y('LMT', 'Lockheed Martin', 'USD'),
      y('RTX', 'RTX Corporation', 'USD'),
      y('SAAB-B.ST', 'Saab', 'SEK'),
      y('RHM.DE', 'Rheinmetall', 'EUR'),
      y('KOG.OL', 'Kongsberg Gruppen', 'NOK')
    ]
  },
  {
    category: 'utilities',
    companies: [
      y('NEE', 'NextEra Energy', 'USD'),
      y('DUK', 'Duke Energy', 'USD'),
      y('AEP', 'American Electric Power', 'USD')
    ]
  },
  {
    category: 'telecom',
    companies: [
      y('VZ', 'Verizon Communications', 'USD'),
      y('T', 'AT&T', 'USD'),
      y('DTE.DE', 'Deutsche Telekom', 'EUR'),
      y('TELIA.ST', 'Telia Company', 'SEK'),
      y('TEL.OL', 'Telenor', 'NOK'),
      y('NOKIA.HE', 'Nokia', 'EUR'),
      y('ERIC-B.ST', 'Ericsson', 'SEK'),
      // US mobile leader (added 2026-07-09, heatmap gap analysis).
      y('TMUS', 'T-Mobile US', 'USD')
    ]
  },
  {
    category: 'reits',
    companies: [y('PLD', 'Prologis', 'USD'), y('AMT', 'American Tower', 'USD')]
  },
  {
    category: 'industrials',
    companies: [
      y('HON', 'Honeywell', 'USD'),
      y('GE', 'GE Aerospace', 'USD'),
      y('VOLV-B.ST', 'Volvo AB', 'SEK'),
      y('SAND.ST', 'Sandvik', 'SEK'),
      y('HEXA-B.ST', 'Hexagon', 'SEK'),
      y('EPI-A.ST', 'Epiroc', 'SEK'),
      y('KNEBV.HE', 'Kone', 'EUR'),
      y('SKF-B.ST', 'SKF', 'SEK'),
      y('ALFA.ST', 'Alfa Laval', 'SEK'),
      y('WRT1V.HE', 'Wartsila', 'EUR'),
      // US industrial backbone (added 2026-07-09, heatmap gap analysis).
      y('UNP', 'Union Pacific', 'USD'),
      y('ETN', 'Eaton', 'USD'),
      y('WM', 'Waste Management', 'USD')
    ]
  },
  {
    category: 'conglomerate',
    companies: [
      y('BRK-B', 'Berkshire Hathaway', 'USD'),
      y('INVE-B.ST', 'Investor AB', 'SEK'),
      y('EQT.ST', 'EQT', 'SEK')
    ]
  },
  {
    category: 'retail',
    companies: [
      y('COST', 'Costco Wholesale', 'USD'),
      y('WMT', 'Walmart', 'USD'),
      y('PG', 'Procter & Gamble', 'USD'),
      y('HD', 'Home Depot', 'USD'),
      y('SBUX', 'Starbucks', 'USD'),
      // Home-improvement #2 (added 2026-07-09, heatmap gap analysis).
      y('LOW', "Lowe's Companies", 'USD')
    ]
  },
  {
    category: 'gaming',
    companies: [y('EVO.ST', 'Evolution', 'SEK')]
  },
  {
    category: 'renewables',
    companies: [
      y('VWS.CO', 'Vestas Wind Systems', 'DKK'),
      y('IBE.MC', 'Iberdrola', 'EUR'),
      y('NESTE.HE', 'Neste', 'EUR'),
      // Profitability has swung negative in recent fiscal years - flagged.
      y('ORSTED.CO', 'Orsted', 'DKK')
    ]
  },
  {
    category: 'chemicals-fertilizer',
    companies: [
      y('YAR.OL', 'Yara International', 'NOK'),
      // Industrial gases leader (added 2026-07-09, heatmap gap analysis).
      y('LIN', 'Linde', 'USD')
    ]
  },
  {
    category: 'biotech',
    companies: [
      // Clinical-stage biotech, not consistently profitable - flagged.
      y('ZEAL.CO', 'Zealand Pharma', 'DKK'),
      // Large-cap profitable biotech (added 2026-07-09, heatmap gap analysis).
      y('AMGN', 'Amgen', 'USD')
    ]
  },
  {
    category: 'travel-leisure',
    companies: [y('BKNG', 'Booking Holdings', 'USD')]
  },
  {
    category: 'aquaculture-seafood',
    companies: [y('MOWI.OL', 'Mowi', 'NOK')]
  },

  // ---- Thematic / sector ETFs (UCITS, EUR/XETRA) — equity "winner" baskets;
  // they live in the STOCK (33%) risk sleeve and get expected-value signals.
  {
    category: 'etf-semiconductors',
    companies: [y('VVSM.DE', 'VanEck Semiconductor UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-ai',
    companies: [
      y('AIFS.DE', 'iShares AI Infrastructure UCITS ETF', 'EUR'),
      y('WTI2.DE', 'WisdomTree Artificial Intelligence UCITS ETF', 'EUR')
    ]
  },
  {
    category: 'etf-blockchain',
    companies: [y('BKCH.MI', 'Global X Blockchain UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-space',
    companies: [y('JEDI.DE', 'VanEck Space Innovators UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-lithium-battery',
    companies: [
      y('LI7U.DE', 'Global X Lithium & Battery Tech UCITS ETF', 'EUR'),
      y('W1TA.DE', 'WisdomTree Battery Solutions UCITS ETF', 'EUR')
    ]
  },
  {
    category: 'etf-ev',
    companies: [
      y('IEVD.DE', 'iShares Electric Vehicles & Driving Tech UCITS ETF', 'EUR'),
      y('DR7E.DE', 'Global X Autonomous & Electric Vehicles UCITS ETF', 'EUR')
    ]
  },
  {
    category: 'etf-copper',
    companies: [y('4COP.DE', 'Global X Copper Miners UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-silver',
    companies: [y('SLVR.DE', 'Global X Silver Miners UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-new-energy',
    companies: [
      y('NRJ.PA', 'Amundi MSCI New Energy ESG Screened UCITS ETF', 'EUR')
    ]
  },
  {
    category: 'etf-datacenter-reits',
    companies: [
      y('V9N.DE', 'Global X Data Center REITs & Digital Infra UCITS ETF', 'EUR')
    ]
  },
  {
    category: 'etf-korea',
    companies: [y('FLXK.DE', 'Franklin FTSE Korea UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-japan',
    companies: [y('XDJP.DE', 'Xtrackers Nikkei 225 UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-world-value',
    companies: [
      y('XDEV.DE', 'Xtrackers MSCI World Value UCITS ETF', 'EUR'),
      y('IS3S.DE', 'iShares Edge MSCI World Value Factor UCITS ETF', 'EUR')
    ]
  },
  {
    category: 'etf-emerging-markets',
    companies: [y('IS3N.DE', 'iShares Core MSCI EM IMI UCITS ETF', 'USD')]
  },
  {
    category: 'etf-europe',
    companies: [
      y('EUNK.DE', 'iShares Core MSCI Europe UCITS ETF EUR (Acc)', 'EUR')
    ]
  },
  {
    category: 'etf-acwi',
    companies: [y('IUSQ.DE', 'iShares MSCI ACWI UCITS ETF', 'USD')]
  },
  {
    category: 'etf-tech-sector',
    companies: [
      y(
        'QDVE.DE',
        'iShares S&P 500 Information Technology Sector UCITS ETF',
        'USD'
      )
    ]
  },
  {
    category: 'etf-nasdaq100',
    companies: [
      y('LYMS.DE', 'Amundi Core Nasdaq-100 Swap UCITS ETF Acc', 'EUR')
    ]
  },
  {
    category: 'etf-clean-energy',
    companies: [
      y('IQQH.DE', 'iShares Global Clean Energy Transition UCITS ETF', 'USD')
    ]
  },
  {
    category: 'etf-automation-robotics',
    companies: [y('2B76.DE', 'iShares Automation & Robotics UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-defense',
    companies: [y('DFNS.MI', 'VanEck Defense UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-small-cap',
    companies: [y('IUSN.DE', 'iShares MSCI World Small Cap UCITS ETF', 'EUR')]
  },
  {
    category: 'etf-eurozone',
    companies: [y('XESC.DE', 'Xtrackers Euro Stoxx 50 UCITS ETF 1C', 'EUR')]
  },
  {
    category: 'etf-nordic',
    companies: [y('XACTC25.CO', 'XACT OMXC25 ESG UCITS ETF', 'DKK')]
  },
  {
    // Optional second semiconductor-index flavor alongside etf-semiconductors'
    // VVSM.DE (VanEck) - this one tracks a different (iShares/MSCI) index.
    category: 'etf-semiconductors-alt',
    companies: [
      y('SEC0.DE', 'iShares MSCI Global Semiconductors UCITS ETF', 'USD')
    ]
  }
];

// Reverse lookup: symbol -> category (first match wins).
const CATEGORY_BY_SYMBOL = new Map<string, string>();

for (const { category, companies } of COMPANY_CATALOG) {
  for (const { symbol } of companies) {
    if (!CATEGORY_BY_SYMBOL.has(symbol)) {
      CATEGORY_BY_SYMBOL.set(symbol, category);
    }
  }
}

export function categoryForSymbol(symbol: string): string | null {
  return CATEGORY_BY_SYMBOL.get(symbol) ?? null;
}

/** Flat list of every catalog company (for bulk watchlist import). */
export function allCatalogCompanies(): CatalogCompany[] {
  return COMPANY_CATALOG.flatMap(({ companies }) => companies);
}
