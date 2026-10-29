import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { emptyIdMap, lookup, newId, saveIdMap } from './id-mapping.js';
import { toInt } from './lib/clean.js';
import { reviewCreatedAt } from './lib/dates.js';
import { assertLocalDatabases, loadApiEnv } from './lib/env.js';
import { readProcessed, readProcessedTitles, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';

const DEV_PASSWORD = 'Password123!'; // same as prisma/seed.ts
const BATCH = 2000;
const TX_TIMEOUT_MS = 10 * 60 * 1000; // the full dataset loads in well under this

type Role = 'ADMIN' | 'CREATOR' | 'CONSUMER';
type PersonRole = 'AUTHOR' | 'DIRECTOR' | 'ACTOR' | 'SHOWRUNNER' | 'WRITER';
type MediaType = 'MOVIE' | 'TV_SHOW' | 'BOOK';
type ListStatus = 'COMPLETED' | 'IN_PROGRESS' | 'PLAN_TO';

async function insertAll<T>(
  log: StepLog,
  label: string,
  rows: T[],
  insert: (batch: T[]) => Promise<{ count: number }>,
): Promise<void> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    inserted += (await insert(rows.slice(i, i + BATCH))).count;
  }
  if (inserted !== rows.length) {
    throw new Error(`${label}: inserted ${inserted} of ${rows.length} rows`);
  }
  log.count(`${label} inserted`, inserted);
}

/**
 * Loads data/processed/ into PostgreSQL in foreign-key order and writes processed/id-map.json
 * (dataset id -> database id). Refuses to run on a non-empty database unless --reset is given,
 * which truncates every table first. Run `prisma migrate` first, and skip seed.ts (or run --reset).
 */
export async function main(): Promise<void> {
  loadApiEnv();
  const log = new StepLog('load-postgres');
  const prisma = new PrismaClient();
  const reset = process.argv.includes('--reset');

  try {
    assertLocalDatabases();
    const existing = (await prisma.user.count()) + (await prisma.title.count());
    if (existing > 0 && !reset) {
      throw new Error(
        `Database is not empty (${existing} users/titles). Re-run with --reset to wipe it.`,
      );
    }
    const ids = emptyIdMap();
    const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

    // One transaction: the reset, every insert and the aggregates commit together or not at all, so
    // a bad reference leaves the database as it was (and no half-written id map).
    await prisma.$transaction(
      async (tx) => {
        if (reset) {
          await tx.$executeRawUnsafe(
            'TRUNCATE "ListEntry", "Review", "TitlePerson", "TitleGenre", "Person", "Genre", "Title", "User" CASCADE',
          );
          log.info('truncated all tables (--reset)');
        }

        const users = readProcessed('users.csv').map((u) => {
          const id = newId();
          ids.users[u['user_id'] ?? ''] = id;
          return {
            id,
            email: u['email'] ?? '',
            username: u['username'] ?? null,
            role: (u['role'] ?? 'CONSUMER') as Role,
            passwordHash,
          };
        });
        await insertAll(log, 'users', users, (data) => tx.user.createMany({ data }));

        const titles = readProcessedTitles().map((t) => {
          const id = newId();
          ids.titles[t['title_id'] ?? ''] = id;
          return {
            id,
            name: t['name'] ?? '',
            mediaType: (t['media_type'] ?? '') as MediaType,
            status: 'APPROVED' as const,
            releaseYear: toInt(t['release_year']),
            description: t['description'] || null,
            createdById: null,
          };
        });
        await insertAll(log, 'titles', titles, (data) => tx.title.createMany({ data }));

        const genres = readProcessed('genres.csv').map((g) => {
          const id = newId();
          ids.genres[g['genre_id'] ?? ''] = id;
          return { id, name: g['name'] ?? '' };
        });
        await insertAll(log, 'genres', genres, (data) => tx.genre.createMany({ data }));

        const titleGenres = readProcessed('title_genres.csv').map((l) => ({
          titleId: lookup(ids.titles, l['title_id'], 'title'),
          genreId: lookup(ids.genres, l['genre_id'], 'genre'),
        }));
        await insertAll(log, 'title_genres', titleGenres, (data) =>
          tx.titleGenre.createMany({ data }),
        );

        const people = readProcessed('people.csv').map((p) => {
          const id = newId();
          ids.people[p['person_id'] ?? ''] = id;
          return { id, name: p['name'] ?? '' };
        });
        await insertAll(log, 'people', people, (data) => tx.person.createMany({ data }));

        const titlePeople = readProcessed('title_people.csv').map((l) => ({
          titleId: lookup(ids.titles, l['title_id'], 'title'),
          personId: lookup(ids.people, l['person_id'], 'person'),
          role: (l['role'] ?? '') as PersonRole,
        }));
        await insertAll(log, 'title_people', titlePeople, (data) =>
          tx.titlePerson.createMany({ data }),
        );

        const reviews = readProcessed('reviews.csv').map((r) => {
          const id = newId();
          ids.reviews[r['review_id'] ?? ''] = id;
          const row: Prisma.ReviewCreateManyInput = {
            id,
            userId: lookup(ids.users, r['user_id'], 'user'),
            titleId: lookup(ids.titles, r['title_id'], 'title'),
            rating: Number(r['rating']),
            // Undated reviews get one fixed old date, not the load time.
            createdAt: reviewCreatedAt(r['created_at']),
          };
          return row;
        });
        await insertAll(log, 'reviews', reviews, (data) => tx.review.createMany({ data }));

        const listEntries = readProcessed('user_lists.csv').map((l) => ({
          id: newId(),
          userId: lookup(ids.users, l['user_id'], 'user'),
          titleId: lookup(ids.titles, l['title_id'], 'title'),
          status: (l['status'] ?? '') as ListStatus,
        }));
        await insertAll(log, 'list_entries', listEntries, (data) =>
          tx.listEntry.createMany({ data }),
        );

        // Denormalised aggregates, computed by the title_rating_stats view in the same database.
        const updated = await tx.$executeRaw`
          UPDATE "Title" t
          SET "avgRating" = s."avg_rating", "reviewCount" = s."review_count"
          FROM "title_rating_stats" s
          WHERE s."title_id" = t."id"`;
        log.count('titles with refreshed avgRating/reviewCount', updated);
      },
      { timeout: TX_TIMEOUT_MS, maxWait: 10_000 },
    );

    saveIdMap(ids);
    log.info('wrote processed/id-map.json');
    log.finish();
  } catch (err) {
    log.warn(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    log.finish();
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runIfMain(import.meta.url, () => void main());
