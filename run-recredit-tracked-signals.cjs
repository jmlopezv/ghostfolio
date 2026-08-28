#!/usr/bin/env node
/**
 * Re-credits a tracked purchase to the engine signal that actually prompted it.
 *
 * Until 2026-08-27 the tracker only linked a real buy to a signal fired within
 * 5 days; beyond that it fabricated a standalone row. The window is now 14 days
 * (see SIGNAL_TRACKED_TRADE_MAX_MATCH_GAP_DAYS), but that only affects future
 * matches — purchases already recorded keep whatever attribution they were
 * given at the time. This corrects those, once.
 *
 * It MOVES the tracking state onto the genuine signal rather than deleting and
 * re-running the matcher. Re-running would reset the position to TRACKING and
 * erase a real exit that was alerted and acted on; the exit event is the part
 * worth keeping, and it is not reproducible.
 *
 * Only touches a fabricated row that has a genuine signal for the same symbol
 * within the current window, and refuses if the genuine row is already tracked.
 *
 * Usage:
 *   node run-recredit-tracked-signals.cjs          # report only
 *   node run-recredit-tracked-signals.cjs --apply  # write
 */

require('dotenv').config();

const { Prisma, PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const SYNTHETIC_REASON_PREFIX = 'No engine signal fired close enough';
const MAX_GAP_DAYS = 14;

const dayNumber = (date) => Math.floor(date.getTime() / 86400000);

async function main() {
  const apply = process.argv.includes('--apply');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });

  const fabricated = await prisma.signalLog.findMany({
    orderBy: { createdAt: 'asc' },
    where: {
      metrics: { not: Prisma.JsonNull },
      reason: { startsWith: SYNTHETIC_REASON_PREFIX }
    }
  });

  const moves = [];

  for (const row of fabricated) {
    const metrics = row.metrics;

    if (!metrics?.trackedOrderId) {
      continue;
    }

    const realBuy = new Date(metrics.realBuyDate);

    // The genuine signals for this symbol, before the purchase, inside the
    // window. Newest first — the closest fire is the one that prompted it.
    const genuine = await prisma.signalLog.findMany({
      orderBy: { createdAt: 'desc' },
      where: {
        category: 'BUY',
        createdAt: { lte: realBuy },
        score: { not: null },
        symbol: row.symbol,
        userId: row.userId
      }
    });

    const match = genuine.find(
      (candidate) =>
        dayNumber(realBuy) - dayNumber(candidate.createdAt) <= MAX_GAP_DAYS
    );

    if (!match) {
      console.log(
        `  ${row.symbol.padEnd(9)} no genuine signal within ${MAX_GAP_DAYS}d — stays MANUAL`
      );
      continue;
    }

    if (match.metrics?.trackedOrderId) {
      console.log(
        `  ${row.symbol.padEnd(9)} genuine signal is already tracked — skipping`
      );
      continue;
    }

    moves.push({ match, metrics, row });
  }

  console.log(`\n${moves.length} re-credit(s):\n`);

  for (const { match, metrics, row } of moves) {
    const gap =
      dayNumber(new Date(metrics.realBuyDate)) - dayNumber(match.createdAt);
    console.log(
      `  ${row.symbol}\n` +
        `    fabricated ${row.createdAt.toISOString().slice(0, 10)} @ ${row.livePrice} (${row.signalType})\n` +
        `    genuine    ${match.createdAt.toISOString().slice(0, 10)} @ ${match.livePrice} score ${match.score}, ${gap}d before the fill\n` +
        `    moving     status ${metrics.trackedStatus}, real buy ${metrics.realBuyPrice}\n`
    );
  }

  if (!apply) {
    console.log('Dry run — nothing written. Re-run with --apply.');
    await prisma.$disconnect();
    return;
  }

  for (const { match, metrics, row } of moves) {
    await prisma.signalLog.update({
      data: {
        metrics: {
          ...(typeof match.metrics === 'object' && match.metrics
            ? match.metrics
            : {}),
          ...metrics
        },
        reason:
          `${match.reason ?? ''} · Real purchase linked retroactively ` +
          `(acted on ${dayNumber(new Date(metrics.realBuyDate)) - dayNumber(match.createdAt)} days after the signal).`
      },
      where: { id: match.id }
    });

    await prisma.signalLog.delete({ where: { id: row.id } });

    console.log(`  moved ${row.symbol} onto ${match.id.slice(0, 8)}`);
  }

  console.log(`\nRe-credited ${moves.length}.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
