'use strict';
/**
 * Nordnet → Ghostfolio import script.
 *
 * Usage:
 *   node scripts/import-nordnet.cjs
 *
 * The script will:
 *   1. Wait for the Ghostfolio API on http://localhost:3333
 *   2. Create a new user (POST /api/v1/user) — prints the accessToken for future logins
 *   3. Import Nordnet holdings (3 stocks + 1 fund)
 *   4. Add 129 watchlist symbols
 *
 * If you already have a user and JWT, set env var JWT=<token> to skip step 2.
 */

const BASE = 'http://localhost:3333';

const H = (jwt) => ({
  'Content-Type': 'application/json',
  ...(jwt ? { Authorization: `Bearer ${jwt}` } : {})
});

async function fetchJson(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

// ── 1. Wait for server ────────────────────────────────────────────────────────
async function waitForServer(maxSeconds = 180) {
  process.stdout.write('Waiting for Ghostfolio API to start');
  for (let i = 0; i < maxSeconds; i++) {
    try {
      const { ok } = await fetchJson('/api/v1/info');
      if (ok) {
        console.log(' ready!');
        return true;
      }
    } catch {
      /* not up yet */
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(' timeout!');
  return false;
}

// ── 2. Create / login user ────────────────────────────────────────────────────
async function getJwt() {
  if (process.env.JWT) {
    console.log('Using provided JWT from env.');
    return process.env.JWT;
  }
  console.log('Creating new Ghostfolio user...');
  const { ok, status, json } = await fetchJson('/api/v1/user', {
    method: 'POST',
    headers: H()
  });
  if (!ok) {
    throw new Error(`POST /user failed (${status}): ${JSON.stringify(json)}`);
  }
  const { accessToken, authToken } = json;
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log('  SAVE THIS ACCESS TOKEN — you need it to log back in:');
  console.log(`  ${accessToken}`);
  console.log('══════════════════════════════════════════════════════');
  console.log('');
  return authToken;
}

// ── 3. Import holdings ────────────────────────────────────────────────────────
async function importHoldings(jwt) {
  console.log('Importing Nordnet holdings...');
  const activities = [
    // Stocks (Yahoo Finance, USD)
    {
      currency: 'USD',
      dataSource: 'YAHOO',
      date: '2026-06-15T00:00:00.000Z',
      fee: 0,
      quantity: 1,
      symbol: 'GOOGL',
      type: 'BUY',
      unitPrice: 318.63
    },
    {
      currency: 'USD',
      dataSource: 'YAHOO',
      date: '2026-06-15T00:00:00.000Z',
      fee: 0,
      quantity: 2,
      symbol: 'AAPL',
      type: 'BUY',
      unitPrice: 276.515
    },
    {
      currency: 'USD',
      dataSource: 'YAHOO',
      date: '2026-06-15T00:00:00.000Z',
      fee: 0,
      quantity: 2,
      symbol: 'NVDA',
      type: 'BUY',
      unitPrice: 190.615
    },
    // Fund (MANUAL — Nordnet Global Index not on Yahoo Finance)
    // NAV price 215.7549 SEK, 23.1744 units, total cost 4999.99 SEK
    {
      currency: 'SEK',
      dataSource: 'MANUAL',
      date: '2026-06-15T00:00:00.000Z',
      fee: 0,
      quantity: 23.1744,
      symbol: 'NORDNET_GLOBAL_INDEX',
      type: 'BUY',
      unitPrice: 215.7549
    }
  ];

  const { ok, status, json, text } = await fetchJson('/api/v1/import', {
    method: 'POST',
    headers: H(jwt),
    body: JSON.stringify({ activities })
  });

  if (ok) {
    console.log(`  ✓ Holdings imported (${activities.length} activities)`);
  } else {
    console.error(`  ✗ Import failed (${status}): ${text.slice(0, 300)}`);
  }
}

// ── 4. Watchlist ──────────────────────────────────────────────────────────────
// Full "My watchlist" from Bevakningslistor_Nordnet.pdf (129 stocks)
// Mapped to Yahoo Finance symbols. Symbols that Yahoo doesn't resolve will
// log a FAIL but won't stop the run.
const WATCHLIST = [
  // A
  ['AIR', 'YAHOO'], // AAR Corp (Nordnet shows as "AAR")
  ['ABB.ST', 'YAHOO'], // ABB Ltd — Stockholm
  ['ACS.MC', 'YAHOO'], // ACS Actividades de Construccion
  ['ADS.DE', 'YAHOO'], // Adidas AG
  ['AF.PA', 'YAHOO'], // Air France-KLM
  ['AIR.PA', 'YAHOO'], // Airbus SE
  ['ALFA.ST', 'YAHOO'], // Alfa Laval AB
  ['BABA', 'YAHOO'], // Alibaba Group ADR
  ['AMR', 'YAHOO'], // Alpha Metallurgical Resources
  ['AMZN', 'YAHOO'], // Amazon.com
  ['AAL', 'YAHOO'], // American Airlines
  ['AXP', 'YAHOO'], // American Express
  ['ASMIY', 'YAHOO'], // ASM International N.V. (OTC ADR)
  ['ASML', 'YAHOO'], // ASML HOLDING
  ['ASSA-B.ST', 'YAHOO'], // ASSA ABLOY AB ser. B
  ['AZN', 'YAHOO'], // AstraZeneca PLC (NASDAQ ADR)
  ['AZA.ST', 'YAHOO'], // Avanza Bank Holding AB
  // B
  ['BIDU', 'YAHOO'], // Baidu ADR
  ['BBVA', 'YAHOO'], // Banco Bilbao Vizcaya Argentaria ADR
  ['SAN', 'YAHOO'], // Banco Santander SA ADR
  ['BO.CO', 'YAHOO'], // Bang & Olufsen A/S
  ['BAC', 'YAHOO'], // Bank Of America
  ['BFIT.AS', 'YAHOO'], // BASIC-FIT
  ['BAYN.DE', 'YAHOO'], // Bayer AG
  ['BMW.DE', 'YAHOO'], // Bayerische Motoren Werke AG
  ['BEI.DE', 'YAHOO'], // Beiersdorf AG
  ['BA', 'YAHOO'], // Boeing
  ['BOL.ST', 'YAHOO'], // Boliden AB
  ['AVGO', 'YAHOO'], // Broadcom
  ['BAM', 'YAHOO'], // Brookfield Asset Management
  // C
  ['CARL-B.CO', 'YAHOO'], // Carlsberg B A/S
  ['CA.PA', 'YAHOO'], // Carrefour SA
  ['CARR', 'YAHOO'], // Carrier Global
  ['CAT', 'YAHOO'], // Caterpillar
  ['CVX', 'YAHOO'], // Chevron
  ['C', 'YAHOO'], // Citigroup
  ['CLAS-B.ST', 'YAHOO'], // Clas Ohlson AB ser. B
  ['NET', 'YAHOO'], // Cloudflare
  ['CL', 'YAHOO'], // Colgate-Palmolive
  ['CAF.MC', 'YAHOO'], // Construcciones Y Auxiliar De Ferrocarriles
  ['COST', 'YAHOO'], // Costco Wholesale
  // D
  ['QBTS', 'YAHOO'], // D-Wave Quantum
  ['DTG.DE', 'YAHOO'], // Daimler Truck
  ['DANSKE.CO', 'YAHOO'], // Danske Bank A/S
  ['DDOG', 'YAHOO'], // Datadog A
  ['DE', 'YAHOO'], // Deere & Co.
  ['DHER.DE', 'YAHOO'], // Delivery Hero SE
  ['DELL', 'YAHOO'], // Dell Technologies C
  ['DAL', 'YAHOO'], // Delta Air Lines
  ['DHL.DE', 'YAHOO'], // Deutsche Post AG (DHL Group)
  ['DNB.OL', 'YAHOO'], // DNB BANK ASA
  // E
  ['EC', 'YAHOO'], // Ecopetrol ADR
  ['ERIC-A.ST', 'YAHOO'], // Ericsson, Telefonab. L M ser. A
  ['ERIC-B.ST', 'YAHOO'], // Ericsson, Telefonab. L M ser. B
  ['EL.PA', 'YAHOO'], // EssilorLuxottica SA
  // F
  ['FDX', 'YAHOO'], // FedEx
  ['FCC.MC', 'YAHOO'], // Fomento de Construcciones y Contratas SA
  ['F', 'YAHOO'], // Ford Motor
  ['FORTUM.HE', 'YAHOO'], // Fortum Corporation
  // G
  ['GM', 'YAHOO'], // General Motors
  ['GT', 'YAHOO'], // Goodyear Tire & Rubber
  ['GRNG.ST', 'YAHOO'], // Gränges AB
  ['AVAL', 'YAHOO'], // Grupo Aval Acciones y Valores ADR
  // H
  ['HLAG.DE', 'YAHOO'], // Hapag-Lloyd AG
  ['HEIA.AS', 'YAHOO'], // HEINEKEN
  ['HM-B.ST', 'YAHOO'], // Hennes & Mauritz AB, H & M ser. B
  ['HTHIY', 'YAHOO'], // Hitachi Ltd. (OTC ADR)
  ['HD', 'YAHOO'], // Home Depot
  ['HMC', 'YAHOO'], // Honda Motor ADR
  ['HSBC', 'YAHOO'], // HSBC (NYSE ADR)
  ['HSBA.L', 'YAHOO'], // HSBC Holdings PLC (London)
  ['BOSS.DE', 'YAHOO'], // Hugo Boss AG
  // I
  ['IBM', 'YAHOO'], // IBM
  ['ITX.MC', 'YAHOO'], // Industria De Diseno Textil SA (Inditex)
  ['INGA.AS', 'YAHOO'], // ING GROEP N.V.
  ['ING', 'YAHOO'], // ING Group ADR
  ['IR', 'YAHOO'], // Ingersoll Rand
  ['IAG.MC', 'YAHOO'], // International Consolidated Airlines Group SA
  ['IPCO.ST', 'YAHOO'], // International Petroleum Corporation
  ['INVE-A.ST', 'YAHOO'], // Investor AB ser. A
  ['INVE-B.ST', 'YAHOO'], // Investor AB ser. B
  ['IONQ', 'YAHOO'], // IonQ
  // J
  ['JNJ', 'YAHOO'], // Johnson & Johnson
  // K
  ['KMB', 'YAHOO'], // Kimberly-Clark
  ['KLAR', 'YAHOO'], // Klarna Group
  ['PHIA.AS', 'YAHOO'], // Koninklijke Philips
  // L
  ['OR.PA', 'YAHOO'], // L'Oreal
  ['LTM', 'YAHOO'], // LATAM Airlines Group
  ['LIME.ST', 'YAHOO'], // Lime Technologies AB
  ['LUG.TO', 'YAHOO'], // Lundin Gold Inc.
  ['LUN.TO', 'YAHOO'], // Lundin Mining Corporation
  // M
  ['MA', 'YAHOO'], // Mastercard
  ['MCD', 'YAHOO'], // McDonald's
  ['MELI', 'YAHOO'], // MercadoLibre
  ['MBG.DE', 'YAHOO'], // Mercedes Benz Group
  ['META', 'YAHOO'], // Meta Platforms A
  ['MSFT', 'YAHOO'], // Microsoft
  ['MOWI.OL', 'YAHOO'], // MOWI
  // N
  ['NDAQ', 'YAHOO'], // Nasdaq Inc.
  ['NCC-A.ST', 'YAHOO'], // NCC AB ser. A
  ['NESN.SW', 'YAHOO'], // Nestle SA
  ['NFLX', 'YAHOO'], // Netflix
  ['NKE', 'YAHOO'], // Nike
  ['NDA-SE.ST', 'YAHOO'], // Nordea Bank Abp (SEK, Stockholm)
  ['NDA-NO.OL', 'YAHOO'], // Nordea Bank Abp (NOK, Oslo)
  ['NAS.OL', 'YAHOO'], // NORWEGIAN AIR SHUTTLE
  ['NOVO-B.CO', 'YAHOO'], // Novo Nordisk B A/S
  ['NU', 'YAHOO'], // Nu Holdings
  ['NVDA', 'YAHOO'], // NVIDIA (also held — fine to watchlist)
  // O
  ['OEM-B.ST', 'YAHOO'], // OEM International AB ser. B
  ['ONON', 'YAHOO'], // On Holding
  ['ORCL', 'YAHOO'], // Oracle
  ['ORSTED.CO', 'YAHOO'], // Ørsted A/S
  // P
  ['PLTR', 'YAHOO'], // Palantir Technologies
  ['PANW', 'YAHOO'], // Palo Alto Networks
  ['PEAB-B.ST', 'YAHOO'], // Peab AB ser. B
  ['PNOR.OL', 'YAHOO'], // PETRONOR E&P ASA
  ['PLNT', 'YAHOO'], // Planet Fitness
  ['POSTI.HE', 'YAHOO'], // Posti Group Oyj
  ['PUM.DE', 'YAHOO'], // Puma SE
  // Q
  ['QUBT', 'YAHOO'], // Quantum Computing
  // R
  ['RVMD', 'YAHOO'], // Revolution Medicines
  ['ROG.SW', 'YAHOO'], // Roche Holding AG
  ['RYAAY', 'YAHOO'], // Ryanair Holdings Plc (NASDAQ ADR)
  // S
  ['SALM.OL', 'YAHOO'], // SALMAR
  ['SAND.ST', 'YAHOO'], // Sandvik AB
  ['SAP', 'YAHOO'], // Sap SE (NYSE ADR)
  ['SHEL', 'YAHOO'], // SHELL PLC
  ['SIE.DE', 'YAHOO'], // Siemens AG
  ['ENR.DE', 'YAHOO'], // Siemens Energy AG
  ['SMDG.V', 'YAHOO'], // Sierra Madre Gold and Silver Ltd (TSX-V)
  ['SLR.MC', 'YAHOO'], // Solaria Energia Y Medio Ambiente SA
  ['SPOT', 'YAHOO'], // Spotify
  ['SSAB-B.ST', 'YAHOO'], // SSAB AB ser. B
  ['SWED-A.ST', 'YAHOO'], // Swedbank AB ser A
  // T
  ['TSM', 'YAHOO'], // Taiwan Semiconductor Manufacturing ADR
  ['TEL.OL', 'YAHOO'], // TELENOR
  ['TSLA', 'YAHOO'], // Tesla
  ['TM', 'YAHOO'], // Toyota Motor ADR
  // U
  ['UBER', 'YAHOO'], // Uber Technologies
  ['ULVR.L', 'YAHOO'], // Unilever PLC (London)
  ['UQA.VI', 'YAHOO'], // UNIQA Insurance Group AG (Vienna)
  ['UAL', 'YAHOO'], // United Airlines
  // V
  ['VAR.OL', 'YAHOO'], // VÅR ENERGI ASA
  ['VZ', 'YAHOO'], // Verizon Communications
  ['VOLV-B.ST', 'YAHOO'], // Volvo, AB ser. B
  // W
  ['WMT', 'YAHOO'], // Walmart
  ['DIS', 'YAHOO'], // Walt Disney
  ['WBD', 'YAHOO'], // Warner Bros. Discovery A
  ['WISE.L', 'YAHOO'], // Wise (Payments) — London
  ['WISE.ST', 'YAHOO'], // Wise Group AB — Stockholm
  // X / Z
  ['1810.HK', 'YAHOO'], // Xiaomi Corporation (Hong Kong)
  ['ZURN.SW', 'YAHOO'] // Zurich Insurance Group AG
  // Skipped: SpaceX (not publicly listed), Toyota Caetano (no live price)
];

async function addWatchlist(jwt) {
  console.log(`\nAdding ${WATCHLIST.length} watchlist symbols...`);
  let ok_count = 0;
  let fail_count = 0;
  for (const [symbol, dataSource] of WATCHLIST) {
    const { ok, status } = await fetchJson('/api/v1/watchlist', {
      method: 'POST',
      headers: H(jwt),
      body: JSON.stringify({ dataSource, symbol })
    });
    if (ok) {
      ok_count++;
      process.stdout.write('.');
    } else {
      fail_count++;
      process.stdout.write(`\n  FAIL ${symbol} (${status})`);
    }
  }
  console.log(`\n  ✓ ${ok_count} symbols added, ${fail_count} failed`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const ready = await waitForServer();
  if (!ready) {
    console.error(
      'Server did not start in time. Is `npm run start:server` running?'
    );
    process.exit(1);
  }

  const jwt = await getJwt();
  await importHoldings(jwt);
  await addWatchlist(jwt);

  console.log('\nAll done! Open http://localhost:4200 to see your portfolio.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
