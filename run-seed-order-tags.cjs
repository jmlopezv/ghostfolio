#!/usr/bin/env node
/**
 * Seeds the provenance tags the Simulation tab's Tracked lines are built from.
 *
 * Every real position came from one of three places, and the chart can only
 * separate them if the database says which:
 *
 *   BET     — the user's own market call, no engine involvement
 *   DIP     — bought off a DIP signal the engine fired
 *   LEADER  — bought off a Trend Template / leader recommendation
 *
 * `Order.tags` is an existing many-to-many, so this needs no migration, and
 * Ghostfolio's own activity dialog can edit these afterwards — which is how new
 * positions should be classified from here on. This script only seeds what is
 * already known, and is idempotent: re-running re-asserts the same tags.
 *
 * Funds are deliberately left untagged. They are the 60% core, bought on a
 * schedule rather than a call, and they never reach the strategy chart.
 *
 * Usage:
 *   node run-seed-order-tags.cjs          # report only
 *   node run-seed-order-tags.cjs --apply  # write
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

/**
 * Tag by symbol. Both legs of a round trip get the same tag, so a sold
 * position stays in the bucket it was bought into — IS0E.DE and XDJP.DE are
 * closed, and dropping them would quietly delete the only two completed
 * trades the Tracked lines have.
 */
const TAG_BY_SYMBOL = {
  AAPL: 'BET',
  'ADS.DE': 'DIP',
  AMZN: 'DIP',
  'EXV1.DE': 'BET',
  GOOGL: 'BET',
  HPE: 'LEADER',
  'IS0E.DE': 'BET',
  NVDA: 'BET',
  ORCL: 'BET',
  'SAN.MC': 'BET',
  'SEC0.DE': 'DIP',
  WMT: 'BET',
  'XDJP.DE': 'DIP'
};

async function main() {
  const apply = process.argv.includes('--apply');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const [user] = await prisma.user.findMany({ select: { id: true }, take: 1 });

  const orders = await prisma.order.findMany({
    include: {
      SymbolProfile: { select: { assetSubClass: true, symbol: true } },
      tags: { select: { name: true } }
    },
    orderBy: { date: 'asc' },
    where: { type: { in: ['BUY', 'SELL'] }, userId: user.id }
  });

  const tagNames = [...new Set(Object.values(TAG_BY_SYMBOL))];
  const tagIdByName = new Map();

  for (const name of tagNames) {
    const existing = await prisma.tag.findFirst({
      select: { id: true },
      where: { name, userId: user.id }
    });

    if (existing) {
      tagIdByName.set(name, existing.id);
      continue;
    }

    if (!apply) {
      tagIdByName.set(name, `dry-${name}`);
      console.log(`  + tag ${name} (would create)`);
      continue;
    }

    const created = await prisma.tag.create({
      data: { name, userId: user.id },
      select: { id: true }
    });

    tagIdByName.set(name, created.id);
    console.log(`  + tag ${name}`);
  }

  const pending = [];
  const untagged = [];

  for (const order of orders) {
    const { assetSubClass, symbol } = order.SymbolProfile;
    const tag = TAG_BY_SYMBOL[symbol];

    if (!tag) {
      if (assetSubClass !== 'MUTUALFUND') {
        untagged.push(`${symbol} (${assetSubClass})`);
      }

      continue;
    }

    if (order.tags.some((existing) => existing.name === tag)) {
      continue;
    }

    pending.push({ order, tag });
  }

  console.log(`\n${pending.length} order(s) to tag:\n`);

  for (const { order, tag } of pending) {
    console.log(
      `  ${order.date.toISOString().slice(0, 10)}  ${order.type.padEnd(5)} ` +
        `${order.SymbolProfile.symbol.padEnd(9)} -> ${tag}`
    );
  }

  if (untagged.length > 0) {
    console.log(
      `\n! ${untagged.length} non-fund order(s) have no provenance mapping ` +
        `and will be missing from every Tracked sub-line:\n  ${[...new Set(untagged)].join(', ')}`
    );
  }

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --apply.');
    await prisma.$disconnect();
    return;
  }

  for (const { order, tag } of pending) {
    await prisma.order.update({
      data: { tags: { connect: { id: tagIdByName.get(tag) } } },
      where: { id: order.id }
    });
  }

  console.log(`\nTagged ${pending.length} order(s).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
