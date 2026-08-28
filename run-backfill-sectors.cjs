#!/usr/bin/env node
/**
 * Fills `SymbolProfile.sectors` for listed symbols that have none.
 *
 * Sector is the peer group the sector-tailwind signal compares a name against
 * (see `peerGroupFor` in libs/common/src/lib/sectors.ts), so a symbol without
 * one silently drops out of that calculation. The chart endpoint used by the
 * import does not carry sector, so this is a separate pass over `quoteSummary`.
 *
 * Only `sectors` is written. `countries` is deliberately left alone: this fork
 * stores an ISO code (`[{"code":"US","weight":1}]`) while Yahoo returns a
 * display name ("United States"), and inventing a name-to-code mapping would
 * put guessed data in the database to save one lookup.
 *
 * Idempotent: symbols that already have a sector are skipped unless --force.
 *
 * Usage:
 *   node run-backfill-sectors.cjs --dry-run
 *   node run-backfill-sectors.cjs
 *   node run-backfill-sectors.cjs --force     # re-fetch even if already set
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const mod = require('yahoo-finance2');
const YahooFinance = mod.default ?? mod.YahooFinance ?? mod;

const THROTTLE_MS = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });
  const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

  const candidates = await prisma.symbolProfile.findMany({
    orderBy: { symbol: 'asc' },
    select: { id: true, sectors: true, symbol: true },
    where: {
      assetSubClass: { in: ['STOCK', 'ETF'] },
      dataSource: 'YAHOO'
    }
  });

  const targets = force
    ? candidates
    : candidates.filter(({ sectors }) => {
        return !Array.isArray(sectors) || sectors.length === 0;
      });

  console.log(
    `\n${candidates.length} listed symbols, ${targets.length} without a sector.\n`
  );

  if (dryRun) {
    console.log('--dry-run: no changes. First 25:');
    console.log(
      '  ' +
        targets
          .slice(0, 25)
          .map((t) => t.symbol)
          .join(' ')
    );
    await prisma.$disconnect();

    return;
  }

  let updated = 0;
  const failed = [];

  for (const [index, { id, symbol }] of targets.entries()) {
    try {
      const summary = await yahooFinance.quoteSummary(symbol, {
        modules: ['assetProfile']
      });

      const sector = summary?.assetProfile?.sector;

      if (sector) {
        await prisma.symbolProfile.update({
          data: { sectors: [{ name: sector, weight: 1 }] },
          where: { id }
        });
        updated++;
      } else {
        // An ETF has no single sector, and some listings simply carry no
        // profile. Recorded rather than retried — there is nothing to fetch.
        failed.push({ reason: 'no sector published', symbol });
      }
    } catch (error) {
      failed.push({
        reason: `${error?.message ?? error}`.slice(0, 80),
        symbol
      });
    }

    if ((index + 1) % 50 === 0) {
      console.log(`  ${index + 1}/${targets.length} — ${updated} updated`);
    }

    await sleep(THROTTLE_MS);
  }

  console.log(`\nUpdated ${updated} of ${targets.length}.`);

  if (failed.length > 0) {
    console.log(`\nNo sector for ${failed.length}:`);
    for (const { reason, symbol } of failed.slice(0, 30)) {
      console.log(`  ${symbol.padEnd(12)} ${reason}`);
    }
    if (failed.length > 30) {
      console.log(`  … and ${failed.length - 30} more`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
