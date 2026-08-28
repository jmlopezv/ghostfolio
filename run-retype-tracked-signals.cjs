#!/usr/bin/env node
/**
 * Rewrites each tracked SignalLog row's `signalType` from its Order's tag.
 *
 * A tracked position's TYPE is where the decision to buy came from — a fact the
 * user records as a tag on the activity. `SignalTradeTrackingService` used to
 * choose that type for itself when it synthesised a row: first `DIP` for
 * everything, then `MANUAL` for everything. Both were wrong for the same
 * reason, and the result was that positions the user picked themselves sat
 * inside the curve measuring the dip strategy.
 *
 * Rows created from a GENUINE engine signal keep their signal type — that row
 * describes a signal, not a position, and its type is already correct. Only
 * rows the tracker fabricated are rewritten, and only when a tag exists.
 *
 * Idempotent.
 *
 * Usage:
 *   node run-retype-tracked-signals.cjs          # report only
 *   node run-retype-tracked-signals.cjs --apply  # write
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const SYNTHETIC_REASON_PREFIX = 'No engine signal fired close enough';
const PROVENANCE = ['BET', 'DIP', 'LEADER'];

async function main() {
  const apply = process.argv.includes('--apply');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const rows = await prisma.signalLog.findMany({
    orderBy: { createdAt: 'asc' },
    where: { category: 'BUY' }
  });

  const orders = await prisma.order.findMany({
    include: {
      SymbolProfile: { select: { symbol: true } },
      tags: { select: { name: true } }
    },
    where: { type: 'BUY' }
  });

  const tagBySymbol = new Map();

  for (const order of orders) {
    const tag = order.tags
      .map(({ name }) => name)
      .find((name) => PROVENANCE.includes(name));

    if (tag) {
      tagBySymbol.set(order.SymbolProfile.symbol, tag);
    }
  }

  const changes = [];
  const untagged = [];
  const kept = [];

  for (const row of rows) {
    if (!row.metrics?.trackedOrderId) {
      continue; // never linked to a real purchase — a pure signal, leave alone
    }

    const synthetic = (row.reason ?? '').startsWith(SYNTHETIC_REASON_PREFIX);
    const tag = tagBySymbol.get(row.symbol);

    if (!synthetic) {
      // A genuine signal that a real buy was matched to. Its type describes the
      // SIGNAL and stays as it is; the position's provenance lives on the order.
      kept.push(`${row.symbol} (${row.signalType}, genuine signal)`);
      continue;
    }

    if (!tag) {
      untagged.push(row.symbol);
      continue;
    }

    if (row.signalType !== tag) {
      changes.push({
        from: row.signalType,
        id: row.id,
        symbol: row.symbol,
        to: tag
      });
    }
  }

  console.log(`${changes.length} row(s) to retype:\n`);
  for (const change of changes) {
    console.log(
      `  ${change.symbol.padEnd(10)} ${String(change.from).padEnd(9)} -> ${change.to}`
    );
  }

  if (kept.length > 0) {
    console.log(`\nLeft alone (genuine signals): ${kept.join(', ')}`);
  }

  if (untagged.length > 0) {
    console.log(
      `\n! No provenance tag, so no type can be assigned: ${untagged.join(', ')}\n` +
        `  Tag them in Ghostfolio's activity dialog and re-run.`
    );
  }

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    await prisma.$disconnect();
    return;
  }

  for (const change of changes) {
    await prisma.signalLog.update({
      data: { signalType: change.to },
      where: { id: change.id }
    });
  }

  const after = await prisma.$queryRawUnsafe(
    `select coalesce("signalType", '(none)') as type, count(*)::int as n
       from "SignalLog" group by 1 order by n desc`
  );
  console.log(`\nRetyped ${changes.length}. Types now:`);
  for (const row of after) {
    console.log(`  ${String(row.type).padEnd(10)} ${row.n}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
