#!/usr/bin/env node
/**
 * Relabels fabricated `SignalLog` rows from DIP to MANUAL.
 *
 * `SignalTradeTrackingService` writes a row for every real purchase it tracks,
 * including ones that followed no engine signal, so the stop/target machinery
 * has something to watch. Until 2026-08-27 those rows were hard-coded
 * `signalType: 'DIP'`, which put the user's own market calls — and one Leader
 * purchase — inside the curve that measures the dip strategy. Nine of eleven
 * tracked positions were such rows.
 *
 * Matched on the row's own `reason` text rather than on a symbol list, so the
 * script stays correct if more were created before the code fix landed. A
 * fabricated row is additionally recognisable by having no `score`: a genuine
 * engine signal always carries its indicator snapshot.
 *
 * Idempotent — once relabelled, a second run finds nothing.
 *
 * Usage:
 *   node run-relabel-synthetic-signals.cjs          # report only
 *   node run-relabel-synthetic-signals.cjs --apply  # write
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const SYNTHETIC_REASON_PREFIX = 'No engine signal fired close enough';

async function main() {
  const apply = process.argv.includes('--apply');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const before = await prisma.$queryRawUnsafe(
    `select coalesce("signalType", '(none)') as type, count(*)::int as n
       from "SignalLog" group by 1 order by n desc`
  );
  console.log('Before:');
  for (const row of before) {
    console.log(`  ${String(row.type).padEnd(10)} ${row.n}`);
  }

  const candidates = await prisma.signalLog.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      createdAt: true,
      id: true,
      livePrice: true,
      score: true,
      signalType: true,
      symbol: true
    },
    where: {
      reason: { startsWith: SYNTHETIC_REASON_PREFIX },
      signalType: { not: 'MANUAL' }
    }
  });

  console.log(`\n${candidates.length} fabricated row(s) to relabel:\n`);

  const scored = [];

  for (const row of candidates) {
    console.log(
      `  ${row.createdAt.toISOString().slice(0, 10)}  ${row.symbol.padEnd(9)} ` +
        `${String(row.signalType).padEnd(7)} -> MANUAL   px ${row.livePrice}` +
        (row.score == null ? '' : `   !! has score ${row.score}`)
    );

    // A fabricated row should never carry an indicator snapshot. One that does
    // would mean the reason text is being reused somewhere it should not be,
    // and relabelling it would destroy a real signal — so refuse instead.
    if (row.score != null) {
      scored.push(row.symbol);
    }
  }

  if (scored.length > 0) {
    console.error(
      `\nRefusing: ${scored.length} row(s) carry a score, so they are not ` +
        `fabricated: ${scored.join(', ')}. Investigate before relabelling.`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    await prisma.$disconnect();
    return;
  }

  const { count } = await prisma.signalLog.updateMany({
    data: { signalType: 'MANUAL' },
    where: { id: { in: candidates.map(({ id }) => id) } }
  });

  const after = await prisma.$queryRawUnsafe(
    `select coalesce("signalType", '(none)') as type, count(*)::int as n
       from "SignalLog" group by 1 order by n desc`
  );
  console.log(`\nRelabelled ${count}. After:`);
  for (const row of after) {
    console.log(`  ${String(row.type).padEnd(10)} ${row.n}`);
  }

  const impure = await prisma.$queryRawUnsafe(
    `select count(*)::int as n from "SignalLog"
      where "signalType" = 'DIP' and score is null`
  );
  console.log(
    `\nDIP rows with no score (should be 0): ${impure[0].n}` +
      (impure[0].n === 0 ? '  ✓' : '  !! still contaminated')
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
