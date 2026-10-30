import { RATING_MAX } from '@bingemate/shared/rating';
import { PrismaClient, type Prisma } from '@prisma/client';
import mongoose from 'mongoose';
import { ReviewBody } from '../../apps/api/src/mongo/models/reviewBody.model.js';
import { loadIdMap, lookup } from './id-mapping.js';
import type { Row } from './lib/csv.js';
import { undatedReviewDate } from './lib/dates.js';
import { loadApiEnv } from './lib/env.js';
import { readProcessed, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';
import { hasMoviePoster } from './lib/posters.js';

/** Thrown inside the probe transaction to force a rollback when the UPDATE was (wrongly) accepted. */
class RollbackProbe extends Error {}

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

    // The CHECK constraint must refuse an out-of-range rating. The probe runs in a transaction
    // that is always rolled back, so a missing constraint cannot leave a bad row behind.
    const anyReview = await prisma.review.findFirst({ select: { id: true } });
    if (!anyReview) {
      check('there is a review to probe the CHECK constraint with', false);
    } else {
      let rejected = false;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE "Review" SET "rating" = ${RATING_MAX + 1} WHERE "id" = ${anyReview.id}`;
          throw new RollbackProbe();
        });
      } catch (err) {
        rejected = !(err instanceof RollbackProbe);
      }
      check(`CHECK constraint rejects rating ${RATING_MAX + 1}`, rejected);
    }

    // Details: one row for each title with any detail value, of the title's own type only.
    const filled = (rows: Row[], columns: string[]): number =>
      rows.filter((r) => columns.some((c) => (r[c] ?? '') !== '')).length;
    const books = readProcessed('books.csv');
    check(
      'movie_details count matches',
      (await prisma.movieDetails.count()) ===
        filled(readProcessed('movies.csv'), [
          'runtime_min',
          'tagline',
          'letterboxd_rating',
          'rated',
        ]),
    );
    check(
      'tv_details count matches',
      (await prisma.tvDetails.count()) ===
        filled(readProcessed('tv_shows.csv'), [
          'num_seasons',
          'duration',
          'metascore',
          'userscore',
          'content_rating',
        ]),
    );
    check(
      'book_details count matches',
      (await prisma.bookDetails.count()) === filled(books, ['publisher', 'ratings_count']),
    );
    check(
      'a ratings count of 0 is kept, not blanked',
      (await prisma.bookDetails.count({ where: { ratingsCount: 0 } })) ===
        books.filter((b) => b['ratings_count'] === '0').length,
    );
    const hiddenMovies = await prisma.title.count({
      where: { mediaType: 'MOVIE', status: 'REJECTED' },
    });
    check(
      'hidden movies keep their details',
      hiddenMovies === 0 ||
        (await prisma.movieDetails.count({ where: { title: { status: 'REJECTED' } } })) > 0,
    );
    check(
      'no movie is hidden when there are no movie posters',
      hiddenMovies === 0 ||
        hasMoviePoster(
          readProcessed('movies.csv'),
          new Map(readProcessed('title_posters.csv').map((p) => [p['title_id'] ?? '', ''])),
        ),
    );
    const aBook = await prisma.title.findFirst({
      where: { mediaType: 'BOOK' },
      select: { id: true },
    });
    const refused = async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      try {
        await prisma.$transaction(async (tx) => {
          await run(tx);
          throw new RollbackProbe();
        });
        return false;
      } catch (err) {
        return !(err instanceof RollbackProbe);
      }
    };
    if (aBook === null) {
      check('there is a book to probe the details type with', false);
    } else {
      check(
        "a book's id is refused in MovieDetails",
        await refused(
          (tx) => tx.$executeRaw`INSERT INTO "MovieDetails" ("titleId") VALUES (${aBook.id})`,
        ),
      );
      check(
        'MovieDetails refuses mediaType BOOK',
        await refused(
          (tx) =>
            tx.$executeRaw`INSERT INTO "MovieDetails" ("titleId", "mediaType") VALUES (${aBook.id}, 'BOOK')`,
        ),
      );
    }

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

    // Undated reviews carry the same made-up 2022-2025 date in both stores, never the load time.
    const ids = loadIdMap();
    const undated = readProcessed('reviews.csv').filter((r) => !r['created_at']);
    const undatedDay = new Map(
      undated.map((r) => [
        lookup(ids.reviews, r['review_id'] ?? '', 'review'),
        undatedReviewDate(r['review_id'] ?? '').getTime(),
      ]),
    );
    const pgDates = await prisma.review.findMany({
      where: { id: { in: [...undatedDay.keys()] } },
      select: { id: true, createdAt: true },
    });
    const mongoDates = (await ReviewBody.find({ _id: { $in: [...undatedDay.keys()] } })
      .select('createdAt')
      .lean()) as unknown as { _id: string; createdAt: Date }[];
    check(
      `${undated.length} undated reviews have their made-up date in PostgreSQL`,
      pgDates.length === undated.length &&
        pgDates.every((d) => d.createdAt.getTime() === undatedDay.get(d.id)),
    );
    check(
      `${undated.length} undated reviews have the same date in MongoDB`,
      mongoDates.length === undated.length &&
        mongoDates.every((d) => d.createdAt.getTime() === undatedDay.get(d._id)),
    );

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
