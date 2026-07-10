/**
 * Curated catalog of low-fee, Nordnet-tradeable funds, diversified across
 * markets and a couple of industry tilts. Funds are priced as MANUAL assets.
 *
 * Two sourcing generations coexist:
 * - The original 13 entries (held funds + early watchlist additions) are
 *   priced via an Avanza public-JSON scraper (Yahoo doesn't cover Nordic
 *   funds) — ISINs are best-effort there, since the importer resolves each
 *   fund on Avanza by ISIN and falls back to a name search.
 * - The "Screened additions" block is sourced directly from Nordnet's own
 *   public fund pages (`nordnetUrl`) instead — no ISIN shown there, and no
 *   Avanza resolution involved. This covers Nordnet's own house funds too,
 *   which Avanza (a competitor) structurally can't list.
 *
 * `held` carries the units + average price for the 4 funds the user already
 * owns, so the importer can record them as positions. Most funds are ≤0.40%
 * fee; any above that MUST carry a `feeJustification` (or, for the screened
 * additions, be covered by the fee<0.5%+return>15% screen itself).
 */

export interface CatalogFund {
  // Exposure bucket used for diversification + the weekly recommendation.
  category: string;
  currency: string;
  // Required when feePct > 0.40 — why the higher fee is worth it.
  feeJustification?: string;
  feePct: number;
  // Present for funds the user already holds → recorded as a position.
  held?: { avgPrice: number; quantity: number };
  // Best-effort; not shown on Nordnet's fund pages for most funds, so absent
  // for the Nordnet-sourced entries below.
  isin?: string;
  name: string;
  // Nordnet fund detail page path (source for NAV/fee/holdings refreshes).
  nordnetUrl?: string;
  // Seed NAV for funds with no automated price feed. Tracked as a static
  // MANUAL price the user (or a future scraper) updates periodically.
  seedNav?: number;
  // Stable MANUAL symbol (slug).
  symbol: string;
}

export const FUND_CATALOG: CatalogFund[] = [
  // ---- Held funds (recorded as positions) ----
  // Nordnet's own funds have no public price feed on Avanza (a competitor
  // doesn't list them), so these 3 are auto-scraped daily straight off their
  // own Nordnet page instead (see scraperConfiguration on the SymbolProfile
  // row — url/selector, not a static defaultMarketPrice; fixed 2026-07-07,
  // was previously a frozen manual seed).
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.2,
    held: { avgPrice: 227.52, quantity: 43.9526 },
    isin: 'SE0009696319',
    name: 'Nordnet Global Index',
    nordnetUrl: '/fonder/lista/nordnet-global-index-sek-0c65c468',
    seedNav: 240.64,
    symbol: 'NORDNET_GLOBAL_INDEX'
  },
  {
    category: 'norway',
    currency: 'NOK',
    feePct: 0.0,
    held: { avgPrice: 329.38, quantity: 4.6043 },
    isin: 'SE0005993110',
    name: 'Nordnet Norge Indeks',
    nordnetUrl: '/fonder/lista/nordnet-norge-indeks-nok-52540035',
    seedNav: 329.38,
    symbol: 'NORDNET_NORGE_INDEKS'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.0,
    held: { avgPrice: 819.45, quantity: 1.8304 },
    isin: 'SE0002756973',
    name: 'Nordnet Sverige Index',
    nordnetUrl: '/fonder/lista/nordnet-sverige-index-sek-aa7a9014',
    seedNav: 819.45,
    symbol: 'NORDNET_SVERIGE_INDEX'
  },
  {
    category: 'asia',
    currency: 'SEK',
    feePct: 0.2,
    held: { avgPrice: 527.44, quantity: 15.1676 },
    isin: 'SE0007074117',
    name: 'Swedbank Robur Access Asien A',
    symbol: 'SWEDBANK_ROBUR_ACCESS_ASIEN'
  },

  // ---- Watchlist: diversified, Avanza-priceable, low fee ----
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.2,
    isin: 'SE0005188836',
    name: 'Länsförsäkringar Global Indexnära',
    symbol: 'LF_GLOBAL_INDEXNARA'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.2,
    isin: 'SE0017084829',
    name: 'Swedbank Robur Access Global A',
    symbol: 'SWEDBANK_ROBUR_ACCESS_GLOBAL'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.4,
    feeJustification:
      'Broad ESG-screened global exposure from a major bank; reliable tracking and large AUM justify the slightly higher fee as a diversifier.',
    isin: 'SE0011309707',
    name: 'Handelsbanken Global Index Criteria',
    symbol: 'HANDELSBANKEN_GLOBAL_INDEX_CRITERIA'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.4,
    feeJustification:
      'All-Countries global ESG fund (developed + emerging) from a reliable provider; broadens the global sleeve beyond developed markets.',
    isin: 'SE0011670081',
    name: 'Storebrand Global All Countries',
    symbol: 'STOREBRAND_GLOBAL_ALL_COUNTRIES'
  },
  {
    category: 'usa',
    currency: 'SEK',
    feePct: 0.2,
    isin: 'SE0017832249',
    name: 'Swedbank Robur Access USA',
    symbol: 'SWEDBANK_ROBUR_ACCESS_USA'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.1,
    isin: 'SE0011670099',
    name: 'Avanza Europa',
    symbol: 'AVANZA_EUROPA'
  },
  {
    category: 'em',
    currency: 'SEK',
    feePct: 0.29,
    isin: 'SE0011670073',
    name: 'Avanza Emerging Markets',
    symbol: 'AVANZA_EMERGING_MARKETS'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.0,
    isin: 'SE0011527613',
    name: 'Avanza Zero',
    symbol: 'AVANZA_ZERO'
  },
  {
    category: 'nordic',
    currency: 'SEK',
    feePct: 0.1,
    isin: 'SE0009778354',
    name: 'SEB Nordenfond',
    symbol: 'SEB_NORDEN_INDEX'
  },

  // ---- Screened additions (2026-07-07): fee < 0.5% AND 1-year return > 15%,
  // crawled from Nordnet's own public fund pages (nordnet.se/fonder/lista),
  // sourced directly rather than via Avanza. Entries above 0.40% fee are
  // covered by the screen itself (fee<0.5% + return>15%) rather than an
  // individual feeJustification — the screening criteria is the justification.
  // seedNav/holdings reflect Nordnet's NAV/exposure as of 2026-07-06/07;
  // `holdings` (top-10 exposure, real weights) lives on the SymbolProfile row
  // in the DB, not duplicated here.
  {
    category: 'finland',
    currency: 'EUR',
    feePct: 0,
    name: "Nordnet Suomi Indeksi",
    nordnetUrl: '/fonder/lista/nordnet-suomi-indeksi-eur-a401761d',
    seedNav: 346.76,
    symbol: 'NORDNET_SUOMI_INDEKSI'
  },
  {
    category: 'nordic',
    currency: 'SEK',
    feePct: 0.19,
    name: "Alfred Berg Nordic Index R",
    nordnetUrl: '/fonder/lista/alfred-berg-nordic-index-sek-d0b3bb87',
    seedNav: 143.17,
    symbol: 'ALFRED_BERG_NORDIC_INDEX'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.19,
    name: "Nordea European Index Select A",
    nordnetUrl: '/fonder/lista/nordea-european-index-select-sek-713b7324',
    seedNav: 126.54,
    symbol: 'NORDEA_EUROPEAN_INDEX_SELECT'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.19,
    name: "Nordea Global Index Select A",
    nordnetUrl: '/fonder/lista/nordea-global-index-select-sek-13deaf85',
    seedNav: 678.24,
    symbol: 'NORDEA_GLOBAL_INDEX_SELECT'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.19,
    name: "Nordea Sverige Passiv icke-utd",
    nordnetUrl: '/fonder/lista/nordea-sverige-passiv-icke-utd-sek-2fa97f2c',
    seedNav: 571.07,
    symbol: 'NORDEA_SVERIGE_PASSIV'
  },
  {
    category: 'usa',
    currency: 'SEK',
    feePct: 0.19,
    name: "Nordea USA Passiv A",
    nordnetUrl: '/fonder/lista/nordea-usa-index-select-sek-83066c22',
    seedNav: 115.75,
    symbol: 'NORDEA_USA_PASSIV'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.2,
    name: "DNB Europa Indeks S",
    nordnetUrl: '/fonder/lista/dnb-europa-indeks-s-sek-fbfb906c',
    seedNav: 163.18,
    symbol: 'DNB_EUROPA_INDEKS'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.2,
    name: "DNB Global Indeks S",
    nordnetUrl: '/fonder/lista/dnb-global-indeks-s-sek-36608f1b',
    seedNav: 178.71,
    symbol: 'DNB_GLOBAL_INDEKS'
  },
  {
    category: 'global-climate',
    currency: 'SEK',
    feePct: 0.2,
    name: "DNB Klima Indeks S",
    nordnetUrl: '/fonder/lista/dnb-klima-indeks-s-sek-202444cf',
    seedNav: 189.59,
    symbol: 'DNB_KLIMA_INDEKS'
  },
  {
    category: 'nordic',
    currency: 'SEK',
    feePct: 0.2,
    name: "DNB Norden Indeks S",
    nordnetUrl: '/fonder/lista/dnb-norden-indeks-s-sek-a9c7ca61',
    seedNav: 143.15,
    symbol: 'DNB_NORDEN_INDEKS'
  },
  {
    category: 'usa',
    currency: 'SEK',
    feePct: 0.2,
    name: "DNB USA Indeks S",
    nordnetUrl: '/fonder/lista/dnb-usa-indeks-s-sek-91dfd576',
    seedNav: 186.43,
    symbol: 'DNB_USA_INDEKS'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.2,
    name: "Handelsbanken Develop M. Index A1",
    nordnetUrl: '/fonder/lista/handelsbanken-develop-m0-index-sek-92333aa2',
    seedNav: 151.76,
    symbol: 'HANDELSBANKEN_DEVELOP_M_INDEX'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.2,
    name: "Handelsbanken Europa Index A1",
    nordnetUrl: '/fonder/lista/handelsbanken-europa-index-a1-sek-63c35178',
    seedNav: 263.85,
    symbol: 'HANDELSBANKEN_EUROPA_INDEX'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.2,
    name: "Handelsbanken Sverige 100 Index A1",
    nordnetUrl: '/fonder/lista/handelsbanken-sverige-100-index-sek-7b9e4ce0',
    seedNav: 542.19,
    symbol: 'HANDELSBANKEN_SVERIGE_100_INDEX'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.2,
    name: "Handelsbanken Sverige LM Index A1",
    nordnetUrl: '/fonder/lista/handelsbanken-sverige-lm-index-sek-6bf0b300',
    seedNav: 122.39,
    symbol: 'HANDELSBANKEN_SVERIGE_LM_INDEX'
  },
  {
    category: 'usa',
    currency: 'SEK',
    feePct: 0.2,
    name: "Handelsbanken USA Index A1",
    nordnetUrl: '/fonder/lista/handelsbanken-usa-index-a1-sek-a369261e',
    seedNav: 1162.17,
    symbol: 'HANDELSBANKEN_USA_INDEX'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.2,
    name: "Lansforsakringar Europa Index",
    nordnetUrl: '/fonder/lista/lansforsakringar-europa-index-sek-34858975',
    seedNav: 418.03,
    symbol: 'LF_EUROPA_INDEX'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.2,
    name: "Lansforsakringar Global Index",
    nordnetUrl: '/fonder/lista/lansforsakringar-global-index-sek-7ef0089f',
    seedNav: 593.95,
    symbol: 'LF_GLOBAL_INDEX'
  },
  {
    category: 'japan',
    currency: 'SEK',
    feePct: 0.2,
    name: "Lansforsakringar Japan Index",
    nordnetUrl: '/fonder/lista/lansforsakringar-japan-index-sek-ffadd09e',
    seedNav: 237.56,
    symbol: 'LF_JAPAN_INDEX'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.2,
    name: "Lansforsakringar Sverige Index",
    nordnetUrl: '/fonder/lista/lansforsakringar-sverige-index-sek-47c039af',
    seedNav: 705.76,
    symbol: 'LF_SVERIGE_INDEX'
  },
  {
    category: 'usa',
    currency: 'SEK',
    feePct: 0.2,
    name: "Lansforsakringar USA Index",
    nordnetUrl: '/fonder/lista/lansforsakringar-usa-index-sek-b2ddd4ca',
    seedNav: 1180.96,
    symbol: 'LF_USA_INDEX'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.2,
    name: "Nordnet Europa Index",
    nordnetUrl: '/fonder/lista/nordnet-europa-index-sek-462687cf',
    seedNav: 195.77,
    symbol: 'NORDNET_EUROPA_INDEX'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.3,
    name: "Storebrand Sverige Plus A",
    nordnetUrl: '/fonder/lista/storebrand-sverige-plus-a-sek-73e777c0',
    seedNav: 275.74,
    symbol: 'STOREBRAND_SVERIGE_PLUS'
  },
  {
    category: 'sweden-dividend',
    currency: 'SEK',
    feePct: 0.31,
    name: "Aktiespararna Direktavkastning A",
    nordnetUrl: '/fonder/lista/aktiespararna-direktavkastning-a-sek-b668b770',
    seedNav: 277.32,
    symbol: 'AKTIESPARARNA_DIREKTAVKASTNING'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.31,
    name: "Aktiespararna Topp Sverige A",
    nordnetUrl: '/fonder/lista/aktiespararna-topp-sverige-a-sek-f0e868f7',
    seedNav: 41.53,
    symbol: 'AKTIESPARARNA_TOPP_SVERIGE'
  },
  {
    category: 'em',
    currency: 'SEK',
    feePct: 0.32,
    name: "Swedbank Robur Access Edge Em Mkt A",
    nordnetUrl: '/fonder/lista/swedbank-robur-access-edge-sek-bcf4b97b',
    seedNav: 188.98,
    symbol: 'SWEDBANK_ROBUR_ACCESS_EDGE_EM'
  },
  {
    category: 'balanced',
    currency: 'SEK',
    feePct: 0.34,
    name: "Nordnet One Balanserad",
    nordnetUrl: '/fonder/lista/nordnet-one-balanserad-sek-d41d4ef9',
    seedNav: 155.49,
    symbol: 'NORDNET_ONE_BALANSERAD'
  },
  {
    category: 'balanced-aggressive',
    currency: 'SEK',
    feePct: 0.35,
    name: "Nordnet One Offensiv",
    nordnetUrl: '/fonder/lista/nordnet-one-offensiv-sek-7924e467',
    seedNav: 183.37,
    symbol: 'NORDNET_ONE_OFFENSIV'
  },
  {
    category: 'global-dividend',
    currency: 'SEK',
    feePct: 0.36,
    name: "Aktiespararna Global Direktavkastning A",
    nordnetUrl: '/fonder/lista/aktiespararna-global-direktavkastning-a-sek-fe02f2be',
    seedNav: 144.28,
    symbol: 'AKTIESPARARNA_GLOBAL_DIREKTAVKASTNING'
  },
  {
    category: 'nuclear-energy',
    currency: 'SEK',
    feePct: 0.39,
    name: "DNB Nuclear Energy S",
    nordnetUrl: '/fonder/lista/dnb-nuclear-energy-s-sek-ffc67164',
    seedNav: 147.63,
    symbol: 'DNB_NUCLEAR_ENERGY'
  },
  {
    category: 'asia-pacific',
    currency: 'SEK',
    feePct: 0.4,
    name: "AMF Aktiefond Asien Stilla havet",
    nordnetUrl: '/fonder/lista/amf-aktiefond-asien-stilla-sek-b51980dc',
    seedNav: 464.17,
    symbol: 'AMF_AKTIEFOND_ASIEN_STILLA_HAVET'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.4,
    name: "AMF Aktiefond Europa",
    nordnetUrl: '/fonder/lista/amf-aktiefond-europa-sek-fca71967',
    seedNav: 443.19,
    symbol: 'AMF_AKTIEFOND_EUROPA'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.4,
    name: "AMF Aktiefond Global",
    nordnetUrl: '/fonder/lista/amf-aktiefond-global-sek-93f32ea2',
    seedNav: 474.84,
    symbol: 'AMF_AKTIEFOND_GLOBAL'
  },
  {
    category: 'usa',
    currency: 'SEK',
    feePct: 0.4,
    name: "AMF Aktiefond Nordamerika",
    nordnetUrl: '/fonder/lista/amf-aktiefond-nordamerika-sek-f0030fab',
    seedNav: 835.47,
    symbol: 'AMF_AKTIEFOND_NORDAMERIKA'
  },
  {
    category: 'em',
    currency: 'SEK',
    feePct: 0.4,
    name: "AMF Aktiefond Tillvaxtmarknader",
    nordnetUrl: '/fonder/lista/amf-aktiefond-tillvaxtmarknader-sek-72a66b11',
    seedNav: 191.59,
    symbol: 'AMF_AKTIEFOND_TILLVAXTMARKNADER'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.4,
    name: "AMF Aktiefond Varlden",
    nordnetUrl: '/fonder/lista/amf-aktiefond-varlden-sek-98ce6be1',
    seedNav: 872.04,
    symbol: 'AMF_AKTIEFOND_VARLDEN'
  },
  {
    category: 'em',
    currency: 'SEK',
    feePct: 0.4,
    name: "Lansforsakringar Tillvaxtmarknad Index A",
    nordnetUrl: '/fonder/lista/lansforsakringar-tillvaxtmarknad-index-a-sek-1448f886',
    seedNav: 257.55,
    symbol: 'LF_TILLVAXTMARKNAD_INDEX'
  },
  {
    category: 'global-leveraged',
    currency: 'SEK',
    feePct: 0.4,
    name: "Nordnet Global Index 125",
    nordnetUrl: '/fonder/lista/nordnet-global-index-125-sek-d8da4522',
    seedNav: 167.14,
    symbol: 'NORDNET_GLOBAL_INDEX_125'
  },
  {
    category: 'technology',
    currency: 'SEK',
    feePct: 0.4,
    name: "Nordnet Teknologi Index",
    nordnetUrl: '/fonder/lista/nordnet-teknologi-index-sek-f03a3fa8',
    seedNav: 300.11,
    symbol: 'NORDNET_TEKNOLOGI_INDEX'
  },
  {
    category: 'em',
    currency: 'SEK',
    feePct: 0.4,
    name: "Nordnet Tillvaxtmarknad Index",
    nordnetUrl: '/fonder/lista/nordnet-tillvaxtmarknad-index-sek-c46a0245',
    seedNav: 186.91,
    symbol: 'NORDNET_TILLVAXTMARKNAD_INDEX'
  },
  {
    category: 'usa',
    currency: 'SEK',
    feePct: 0.4,
    name: "Storebrand USA Plus A",
    nordnetUrl: '/fonder/lista/storebrand-usa-plus-a-sek-17faff47',
    seedNav: 173.15,
    symbol: 'STOREBRAND_USA_PLUS'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.41,
    name: "Handelsbanken Global Index A1",
    nordnetUrl: '/fonder/lista/handelsbanken-global-index-a1-sek-81b0781d',
    seedNav: 704.58,
    symbol: 'HANDELSBANKEN_GLOBAL_INDEX_A1'
  },
  {
    category: 'generation-fund',
    currency: 'SEK',
    feePct: 0.41,
    name: "SPP Generation 60-tal",
    nordnetUrl: '/fonder/lista/spp-generation-60-tal-sek-895f655d',
    seedNav: 1027.83,
    symbol: 'SPP_GENERATION_60'
  },
  {
    category: 'generation-fund',
    currency: 'SEK',
    feePct: 0.41,
    name: "SPP Generation 70-tal",
    nordnetUrl: '/fonder/lista/spp-generation-70-tal-sek-f7846894',
    seedNav: 551.52,
    symbol: 'SPP_GENERATION_70'
  },
  {
    category: 'generation-fund',
    currency: 'SEK',
    feePct: 0.41,
    name: "SPP Generation 80-tal",
    nordnetUrl: '/fonder/lista/spp-generation-80-tal-sek-5120b8a5',
    seedNav: 294.3,
    symbol: 'SPP_GENERATION_80'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.41,
    name: "Storebrand Global Plus A",
    nordnetUrl: '/fonder/lista/storebrand-global-plus-a-sek-cf5f8a7f',
    seedNav: 387.15,
    symbol: 'STOREBRAND_GLOBAL_PLUS'
  },
  {
    category: 'usa',
    currency: 'USD',
    feePct: 0.42,
    name: "AXA IM US Enhanced Index Eq QI A",
    nordnetUrl: '/fonder/lista/axa-im-us-enhanced-usd-6939d8c1',
    seedNav: 94.8,
    symbol: 'AXA_IM_US_ENHANCED_INDEX'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.42,
    name: "Lannebo Marknad Global A",
    nordnetUrl: '/fonder/lista/lannebo-marknad-global-a-sek-f01ba40c',
    seedNav: 328.56,
    symbol: 'LANNEBO_MARKNAD_GLOBAL'
  },
  {
    category: 'em',
    currency: 'SEK',
    feePct: 0.42,
    name: "Storebrand Emerging Markets A",
    nordnetUrl: '/fonder/lista/storebrand-emerging-markets-a-sek-45e871e1',
    seedNav: 294.99,
    symbol: 'STOREBRAND_EMERGING_MARKETS'
  },
  {
    category: 'europe',
    currency: 'SEK',
    feePct: 0.42,
    name: "Storebrand Europa Plus A",
    nordnetUrl: '/fonder/lista/storebrand-europa-plus-a-sek-737107fa',
    seedNav: 230.64,
    symbol: 'STOREBRAND_EUROPA_PLUS'
  },
  {
    category: 'em',
    currency: 'EUR',
    feePct: 0.43,
    name: "SEB Emerging Markets Indexnara C",
    nordnetUrl: '/fonder/lista/seb-emerging-markets-exposure-eur-1358f00c',
    seedNav: 176.55,
    symbol: 'SEB_EMERGING_MARKETS_INDEXNARA'
  },
  {
    category: 'global',
    currency: 'USD',
    feePct: 0.45,
    name: "SEB Global All Countries Exposure C",
    nordnetUrl: '/fonder/lista/seb-global-all-countries-usd-daa6763e',
    seedNav: 3.73,
    symbol: 'SEB_GLOBAL_ALL_COUNTRIES_EXPOSURE'
  },
  {
    category: 'sweden-charity',
    currency: 'SEK',
    feePct: 0.45,
    name: "Skandia Cancerfonden",
    nordnetUrl: '/fonder/lista/skandia-cancerfonden-sek-daf1b404',
    seedNav: 295.29,
    symbol: 'SKANDIA_CANCERFONDEN'
  },
  {
    category: 'sweden-charity',
    currency: 'SEK',
    feePct: 0.45,
    name: "Skandia Varldsnaturfonden",
    nordnetUrl: '/fonder/lista/skandia-varldsnaturfonden-sek-bd75d81d',
    seedNav: 299.26,
    symbol: 'SKANDIA_VARLDSNATURFONDEN'
  },
  {
    category: 'finland',
    currency: 'EUR',
    feePct: 0.46,
    name: "SEB Finland Optimized Exposure D",
    nordnetUrl: '/fonder/lista/seb-finland-optimized-exposure-eur-fbb6b1ed',
    seedNav: 498.66,
    symbol: 'SEB_FINLAND_OPTIMIZED_EXPOSURE'
  },
  {
    category: 'global',
    currency: 'SEK',
    feePct: 0.47,
    name: "Danske Invest Global Index SA",
    nordnetUrl: '/fonder/lista/danske-invest-global-index-sek-78d8d063',
    seedNav: 4523.48,
    symbol: 'DANSKE_INVEST_GLOBAL_INDEX'
  },
  {
    category: 'global-esg',
    currency: 'SEK',
    feePct: 0.47,
    name: "SEB Globala Hallbara Bolag A",
    nordnetUrl: '/fonder/lista/seb-global-sustainable-companies-sek-09a8c3f2',
    seedNav: 122.52,
    symbol: 'SEB_GLOBALA_HALLBARA_BOLAG'
  },
  {
    category: 'sweden',
    currency: 'SEK',
    feePct: 0.49,
    name: "Lannebo Marknad Sverige Bred A",
    nordnetUrl: '/fonder/lista/lannebo-marknad-sverige-bred-sek-1c6ee90d',
    seedNav: 545.37,
    symbol: 'LANNEBO_MARKNAD_SVERIGE_BRED'
  },
];

const FUND_SYMBOLS = new Set(FUND_CATALOG.map(({ symbol }) => symbol));
const CATEGORY_BY_SYMBOL = new Map(
  FUND_CATALOG.map(({ category, symbol }) => [symbol, category])
);

export function isFundSymbol(symbol: string): boolean {
  return FUND_SYMBOLS.has(symbol);
}

export function fundCategoryForSymbol(symbol: string): string | null {
  return CATEGORY_BY_SYMBOL.get(symbol) ?? null;
}

const FEE_BY_SYMBOL = new Map(
  FUND_CATALOG.map(({ feePct, symbol }) => [symbol, feePct])
);

export function fundFeeForSymbol(symbol: string): number | null {
  return FEE_BY_SYMBOL.get(symbol) ?? null;
}
