import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { ReviewBody } from '../../apps/api/src/mongo/models/reviewBody.model.js';
import { loadIdMap, lookup, type IdMap } from './id-mapping.js';
import type { Row } from './lib/csv.js';
import { undatedReviewDate } from './lib/dates.js';
import { assertLocalDatabases, loadApiEnv } from './lib/env.js';
import { readProcessed, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';

const PLACEHOLDER = new Date('1900-01-01T00:00:00.000Z');
const BATCH = 500;

/** Dataset dates and ids only: planning does not read or write either database. */
export function planBackfill(rows: Row[], ids: IdMap): { pgId: string; date: Date }[] {
  return rows
    .filter((row) => !row['created_at'])
    .map((row) => ({
      pgId: lookup(ids.reviews, row['review_id'], 'review'),
      date: undatedReviewDate(row['review_id'] ?? ''),
    }));
}

/** One-off local repair, safe to repeat; only --apply enables database writes. */
export async function main(): Promise<void> {
  loadApiEnv();
  const log = new StepLog('backfill-undated-dates');
  const prisma = new PrismaClient();

  try {
    // assertLocalDatabases normally permits --allow-remote; this repair must stay local.
    const unknown = process.argv.slice(2).find((arg) => arg !== '--apply');
    if (unknown) throw new Error(`Unsupported argument: ${unknown}. Only --apply is allowed.`);
    assertLocalDatabases();
    const uri = process.env['MONGO_URI'];
    if (!uri) throw new Error('MONGO_URI is not set (apps/api/.env)');

    const plan = planBackfill(readProcessed('reviews.csv'), loadIdMap());
    const reviewIds = plan.map(({ pgId }) => pgId);
    log.count('undated reviews found', plan.length);
    const dates = plan.map(({ date }) => date.toISOString()).sort();
    log.info(`new dates: earliest ${dates[0] ?? 'none'}, latest ${dates.at(-1) ?? 'none'}`);

    await mongoose.connect(uri);
    const countPlaceholders = async (): Promise<[number, number]> =>
      Promise.all([
        prisma.review.count({ where: { id: { in: reviewIds }, createdAt: PLACEHOLDER } }),
        ReviewBody.countDocuments({ _id: { $in: reviewIds }, createdAt: PLACEHOLDER }),
      ]);
    const [pgBefore, mongoBefore] = await countPlaceholders();
    log.count('PostgreSQL still on placeholder', pgBefore);
    log.count('MongoDB still on placeholder', mongoBefore);

    if (!process.argv.includes('--apply')) {
      log.info('DRY RUN: no database writes. Re-run with --apply to backfill.');
      log.finish();
      return;
    }

    let pgUpdated = 0;
    let mongoUpdated = 0;
    for (let i = 0; i < plan.length; i += BATCH) {
      const chunk = plan.slice(i, i + BATCH);
      const results = await prisma.$transaction(
        chunk.map(({ pgId, date }) =>
          prisma.review.updateMany({
            where: { id: pgId, createdAt: PLACEHOLDER },
            data: { createdAt: date },
          }),
        ),
      );
      pgUpdated += results.reduce((sum, result) => sum + result.count, 0);
      const result = await ReviewBody.bulkWrite(
        chunk.map(({ pgId, date }) => ({
          updateOne: {
            filter: { _id: pgId, createdAt: PLACEHOLDER },
            update: { $set: { createdAt: date } },
            // createdAt is immutable in the timestamped schema; permit this guarded repair.
            overwriteImmutable: true,
          },
        })),
        { timestamps: false },
      );
      mongoUpdated += result.modifiedCount;
    }
    log.count('PostgreSQL updated', pgUpdated);
    log.count('MongoDB updated', mongoUpdated);

    const [pgRemaining, mongoRemaining] = await countPlaceholders();
    log.count('PostgreSQL placeholders remaining', pgRemaining);
    log.count('MongoDB placeholders remaining', mongoRemaining);

    const pgDates = await prisma.review.findMany({
      where: { id: { in: reviewIds } },
      select: { id: true, createdAt: true },
    });
    const mongoDates = (await ReviewBody.find({ _id: { $in: reviewIds } })
      .select('createdAt')
      .lean()) as unknown as { _id: string; createdAt?: Date }[];
    const pgById = new Map(pgDates.map((row) => [row.id, row.createdAt.getTime()]));
    const mongoById = new Map(mongoDates.map((row) => [row._id, row.createdAt?.getTime()]));
    const mismatches = reviewIds.filter(
      (id) => !pgById.has(id) || !mongoById.has(id) || pgById.get(id) !== mongoById.get(id),
    ).length;
    log.count('missing reviews or date disagreements', mismatches);
    if (pgRemaining > 0 || mongoRemaining > 0 || mismatches > 0) {
      throw new Error(
        'Backfill verification failed; inspect remaining placeholders/date disagreements.',
      );
    }
    log.finish();
  } catch (err) {
    log.warn(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    log.finish();
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    await mongoose.disconnect();
  }
}

runIfMain(import.meta.url, () => void main());
