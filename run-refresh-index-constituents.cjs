#!/usr/bin/env node
/**
 * Regenerates libs/common/src/lib/index-constituents.ts from public sources.
 *
 * Index membership changes several times a year (additions, deletions, merger
 * removals), so the list is generated rather than hand-maintained. Re-run this
 * after a rebalance and commit the diff — the generated file is source, not a
 * build artefact, so the repo never depends on these URLs being reachable at
 * build or runtime.
 *
 * Sources:
 *   S&P 500       datasets/s-and-p-500-companies (CSV, one row per member)
 *   EURO STOXX 50 Wikipedia, which lists each member's Yahoo-style ticker
 *
 * Usage: node run-refresh-index-constituents.cjs [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const SP500_CSV =
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';
const ESTOXX_URL = 'https://en.wikipedia.org/wiki/EURO_STOXX_50';

const OUTPUT = path.join(
  __dirname,
  'libs',
  'common',
  'src',
  'lib',
  'index-constituents.ts'
);

/**
 * Yahoo writes a US share class with a dash where the index sources use a dot:
 * `BRK.B` -> `BRK-B`. Getting this wrong produces a symbol Yahoo cannot resolve,
 * which then shows up as an import failure rather than a bad price.
 */
function toYahooTicker(symbol) {
  return symbol.trim().replace(/\./g, '-');
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ghostfolio-fork)' }
  });

  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }

  return response.text();
}

async function fetchSp500() {
  const csv = (await fetchText(SP500_CSV))
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean);
  const members = [];

  for (const line of csv) {
    const symbol = line.split(',')[0];

    if (!symbol) {
      continue;
    }

    // The security name is the second field and may be quoted (it can contain
    // commas: "Alphabet Inc. (Class C)"), so it is matched rather than split.
    const name = (line.match(/^[^,]+,("[^"]*"|[^,]*)/) || [])[1] || '';

    members.push({
      name: name.replace(/^"|"$/g, '').trim(),
      symbol: toYahooTicker(symbol)
    });
  }

  return members;
}

async function fetchEuroStoxx50() {
  const html = await fetchText(ESTOXX_URL);

  // The page renders each member's ticker in Yahoo form (`ASML.AS`, `ABI.BR`).
  // Matching the suffix set is far more robust than parsing the table markup,
  // which changes shape whenever the article is edited.
  //
  // The dash segment must allow more than one character: Nordea is `NDA-FI.HE`,
  // and a single-letter pattern silently captures the fragment `FI.HE`, which
  // is a ticker Yahoo does not have. `(?<![A-Z0-9-])` anchors the match at a
  // real ticker start, since `-` would otherwise count as a word boundary and
  // let the match begin mid-symbol.
  const matches = html.match(
    /(?<![A-Z0-9-])[A-Z0-9]{1,6}(-[A-Z0-9]{1,4})?\.(AS|BR|DE|MC|MI|PA|HE|IR|VI|LS)\b/g
  );

  const symbols = [...new Set(matches || [])].sort();

  if (symbols.length !== 50) {
    throw new Error(
      `Expected 50 EURO STOXX members, extracted ${symbols.length}. ` +
        `The Wikipedia page shape probably changed — inspect before trusting this.`
    );
  }

  return symbols.map((symbol) => ({ name: '', symbol }));
}

/**
 * Lifts the curated mid-cap block out of the existing file so a regeneration
 * carries it through.
 *
 * This script rewrites the whole file, and `EUROPEAN_MIDCAP_SYMBOLS` is the one
 * list in it that is NOT generated — it is a hand-picked slice of the FTSE 100,
 * FTSE 250 and STOXX Europe 600 chosen by `run-curate-midcaps.cjs`, not any
 * index's membership. Without this it would be silently deleted on the next
 * refresh, taking 100 symbols (and all UK coverage) out of the ranking universe
 * while every test that could have caught it still passed against the old build.
 */
function readCuratedMidcaps() {
  if (!fs.existsSync(OUTPUT)) {
    return null;
  }

  const source = fs.readFileSync(OUTPUT, 'utf8');
  const start = source.indexOf('/**\n * Curated UK + Continental European');

  if (start < 0) {
    return null;
  }

  const end = source.indexOf('\n];', start);

  return end < 0 ? null : source.slice(start, end + 3);
}

function render(sp500, euroStoxx50, curatedMidcaps) {
  const list = (members) =>
    members.map(({ symbol }) => `  '${symbol}'`).join(',\n');

  return `/**
 * Index membership: the S&P 500, the EURO STOXX 50, and a curated set of
 * UK + Continental European mid-caps.
 *
 * PARTLY GENERATED. \`SP500_SYMBOLS\` and \`EURO_STOXX_50_SYMBOLS\` are generated —
 * do not edit them by hand, regenerate with:
 *   node run-refresh-index-constituents.cjs
 *
 * \`EUROPEAN_MIDCAP_SYMBOLS\` is NOT generated and must survive that command; see
 * the comment on the list itself.
 *
 * Kept separate from COMPANY_CATALOG on purpose. The catalog is a curated
 * *theme* taxonomy ('semiconductors', 'quantum-computing'); this is *index
 * membership*, which changes on a rebalance schedule nobody controls. Mixing
 * them would mean hand-maintaining 500 entries and re-curating after every
 * index change.
 *
 * These symbols exist to widen the cross-sectional ranking universe. Relative
 * strength is a percentile against every other tracked name, so a 1-99 rank
 * over ~750 names is a meaningfully finer instrument than one over ~334.
 *
 * Tickers are in YAHOO form: a US share class takes a dash (\`BRK-B\`), and a
 * non-US listing keeps its venue suffix (\`ASML.AS\`, \`ABI.BR\`).
 *
 * Last generated: ${new Date().toISOString().slice(0, 10)}
 */

/** S&P 500 constituents (${sp500.length}). */
export const SP500_SYMBOLS: string[] = [
${list(sp500)}
];

/** EURO STOXX 50 constituents (${euroStoxx50.length}). */
export const EURO_STOXX_50_SYMBOLS: string[] = [
${list(euroStoxx50)}
];

${curatedMidcaps}

/**
 * Every tracked constituent, de-duplicated.
 *
 * The three lists do not currently overlap, but the union is taken rather than
 * assumed so a future index rebalance cannot silently produce a duplicate
 * watchlist import — the same business in two slots distorts the 1-99 relative
 * strength percentile, which is the whole reason these lists exist.
 */
export function allIndexConstituents(): string[] {
  return [
    ...new Set([
      ...SP500_SYMBOLS,
      ...EURO_STOXX_50_SYMBOLS,
      ...EUROPEAN_MIDCAP_SYMBOLS
    ])
  ];
}
`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Fetching S&P 500 …');
  const sp500 = await fetchSp500();
  console.log(`  ${sp500.length} members`);

  console.log('Fetching EURO STOXX 50 …');
  const euroStoxx50 = await fetchEuroStoxx50();
  console.log(`  ${euroStoxx50.length} members`);

  // Refuse rather than silently drop the 100 curated names.
  const curatedMidcaps = readCuratedMidcaps();

  if (!curatedMidcaps) {
    throw new Error(
      'Could not find the curated EUROPEAN_MIDCAP_SYMBOLS block in ' +
        `${OUTPUT}. Regenerating now would delete it. Restore the block (or ` +
        'rerun run-curate-midcaps.cjs) before refreshing the indices.'
    );
  }

  console.log(
    `  carrying through ${(curatedMidcaps.match(/\n  '/g) ?? []).length} curated mid-caps`
  );

  const output = render(sp500, euroStoxx50, curatedMidcaps);

  if (dryRun) {
    console.log(`\n--dry-run: would write ${output.length} bytes to ${OUTPUT}`);

    return;
  }

  fs.writeFileSync(OUTPUT, output);
  console.log(`\nWrote ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
