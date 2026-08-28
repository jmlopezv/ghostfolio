#!/usr/bin/env node
/**
 * Checks that every index constituent resolves at Yahoo before importing.
 *
 * Worth doing separately rather than discovering it during the import: an index
 * source lists an exchange ticker, which is not always the ticker Yahoo uses
 * (share classes, recent renames, listings Yahoo carries under a different
 * venue). A name that fails here would otherwise land silently in the import's
 * `failed[]` array among hundreds of successes.
 *
 * Read-only: fetches quotes, writes nothing.
 *
 * Usage:
 *   node run-verify-index-symbols.cjs           # only symbols not yet tracked
 *   node run-verify-index-symbols.cjs --all     # every constituent
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Matches run-ohlc-backfill.cjs. Well inside Yahoo's unauthenticated tolerance
// for a few hundred sequential requests.
const THROTTLE_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolveSymbol(symbol) {
  try {
    const response = await fetch(
      `${CHART_URL}/${encodeURIComponent(symbol)}?range=5d&interval=1d`,
      {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15000)
      }
    );

    if (response.status === 429) {
      return { status: 'RATE_LIMITED' };
    }

    const body = await response.json();
    const result = body?.chart?.result?.[0];

    if (!result) {
      return {
        reason: body?.chart?.error?.description ?? `HTTP ${response.status}`,
        status: 'MISSING'
      };
    }

    return {
      currency: result.meta?.currency,
      name: result.meta?.longName ?? result.meta?.shortName ?? '',
      status: 'OK'
    };
  } catch (error) {
    return { reason: `${error?.message ?? error}`, status: 'ERROR' };
  }
}

async function main() {
  const checkAll = process.argv.includes('--all');

  // The TS module is read directly rather than compiled: this script is a
  // pre-flight check and should not depend on a build step.
  const source = require('fs').readFileSync(
    'libs/common/src/lib/index-constituents.ts',
    'utf8'
  );
  const symbols = [...source.matchAll(/^ {2}'([^']+)',?$/gm)].map((m) => m[1]);

  if (symbols.length === 0) {
    throw new Error('No symbols parsed from index-constituents.ts');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const tracked = new Set(
    (await prisma.symbolProfile.findMany({ select: { symbol: true } })).map(
      ({ symbol }) => symbol
    )
  );

  const targets = checkAll
    ? symbols
    : symbols.filter((symbol) => !tracked.has(symbol));

  console.log(
    `\n${symbols.length} constituents, ${symbols.length - targets.length} already tracked.` +
      `\nChecking ${targets.length} symbol(s) at ~${(THROTTLE_MS / 1000).toFixed(1)}s each ` +
      `(~${Math.ceil((targets.length * THROTTLE_MS) / 60000)} min)…\n`
  );

  const failures = [];
  let ok = 0;

  for (const [index, symbol] of targets.entries()) {
    const result = await resolveSymbol(symbol);

    if (result.status === 'OK') {
      ok++;
    } else {
      failures.push({ symbol, ...result });
      console.log(
        `  [${result.status}] ${symbol} — ${result.reason ?? 'no data'}`
      );
    }

    if ((index + 1) % 100 === 0) {
      console.log(`  … ${index + 1}/${targets.length}`);
    }

    await sleep(THROTTLE_MS);
  }

  console.log(`\nResolved: ${ok}/${targets.length}`);

  if (failures.length > 0) {
    console.log(
      `\nWill fail on import (${failures.length}):\n  ` +
        failures.map(({ symbol }) => symbol).join(' ')
    );
    console.log(
      "\nThese are recorded in the import's failed[] list and do not abort it."
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
