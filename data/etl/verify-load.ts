import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { ReviewBody } from '../../apps/api/src/mongo/models/reviewBody.model.js';
import { loadApiEnv } from './lib/env.js';
import { readProcessed, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';

/**
 * Checks the loaded databases against data/processed/ and against each other: row counts,
 * the rating CHECK, Postgres/Mongo review ids, stored vs recomputed aggregates, and that the
 * views return sensible rows. Exits non-zero on a failed check.
 */
export async function main(): Promise<void> {
  loadApiEnv();
  const log = new StepLog('verify-load');
  const prisma = new PrismaClient();
  let failures = 0;
  const check = (name: string, ok: boolean, detail = ''): void => {
    if (ok) log.info(`PASS ${name}`);
    else {
      failures++;
      log.warn(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
    }
  };

  try {
    const uri = process.env['MONGO_URI'];
    if (!uri) throw new Error('MONGO_URI is not set (apps/api/.env)');
    await mongoose.connect(uri);

    const expected = (file: string): number => readProcessed(file).length;
    const counts: [string, number, number][] = [
      ['users', await prisma.user.count(), expected('users.csv')],
      [
        'titles',
        await prisma.title.count(),
        expected('movies.csv') + expected('tv_shows.csv') + expected('books.csv'),
      ],
      ['genres', await prisma.genre.count(), expected('genres.csv')],
      ['title_genres', await prisma.titleGenre.count(), expected('title_genres.csv')],
      ['people', await prisma.person.count(), expected('people.csv')],
      ['title_people', await prisma.titlePerson.count(), expected('title_people.csv')],
      ['reviews', await prisma.review.count(), expected('reviews.csv')],
      ['list_entries', await prisma.listEntry.count(), expected('user_lists.csv')],
      ['mongo review bodies', await ReviewBody.countDocuments(), expected('reviews.csv')],
    ];
    for (const [name, actual, want] of counts) {
      check(`${name} count = ${want}`, actual === want, `got ${actual}`);
    }

    // The CHECK constraint must refuse an out-of-range rating.
    const anyReview = await prisma.review.findFirst({ select: { id: true } });
    let rejected = false;
    try {
      await prisma.$executeRaw`UPDATE "Review" SET "rating" = 6 WHERE "id" = ${anyReview?.id ?? ''}`;
    } catch {
      rejected = true;
    }
    check('CHECK constraint rejects rating 6', rejected);

    // Same review ids in both stores.
    const pgIds = new Set(
      (await prisma.review.findMany({ select: { id: true } })).map((r) => r.id),
    );
    const mongoIds = (await ReviewBody.find({}, { _id: 1 }).lean()).map((d) => String(d._id));
    check(
      'every Mongo body id is a Postgres review id',
      mongoIds.every((id) => pgIds.has(id)),
    );
    check('every Postgres review has a Mongo body', pgIds.size === mongoIds.length);

    // Stored aggregates must equal what the view recomputes.
    const drift = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM "Title" t JOIN "title_rating_stats" s ON s."title_id" = t."id"
      WHERE t."reviewCount" <> s."review_count" OR ABS(t."avgRating" - s."avg_rating") > 0.01`;
    check('stored avgRating/reviewCount match title_rating_stats', Number(drift[0]?.n) === 0);
    const bad = await prisma.title.count({
      where: { OR: [{ avgRating: { lt: 0 } }, { avgRating: { gt: 5 } }] },
    });
    check('avgRating is within 0..5', bad === 0);

    // Views.
    const genres = await prisma.$queryRaw<
      { mediaType: string; name: string; title_count: number }[]
    >`
      SELECT "mediaType", "name", "title_count" FROM "genre_filter_options" ORDER BY "title_count" DESC LIMIT 5`;
    check('genre_filter_options returns rows', genres.length > 0);
    log.info(
      `top genres: ${genres.map((g) => `${g.name} (${g.mediaType}) ${g.title_count}`).join('; ')}`,
    );
    const trending = await prisma.$queryRaw<
      { name: string; trending_score: number; review_count: number }[]
    >`
      SELECT "name", "trending_score", "review_count" FROM "trending_titles" ORDER BY "trending_score" DESC LIMIT 3`;
    check('trending_titles returns rows', trending.length > 0);
    log.info(
      `trending: ${trending.map((t) => `${t.name} ${t.trending_score.toFixed(2)} (${t.review_count})`).join('; ')}`,
    );

    log.count('checks failed', failures);
    log.finish();
    if (failures > 0) process.exitCode = 1;
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
