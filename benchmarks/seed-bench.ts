import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { ReviewBody } from '../apps/api/src/mongo/models/reviewBody.model.js';
import { Reply } from '../apps/api/src/mongo/models/reply.model.js';
import { assertBenchDatabase } from './lib/guard.js';

const BATCH = 5000;
// Mongoose supports timestamps here at runtime, but its InsertManyOptions type omits it.
const INSERT_OPTIONS = { ordered: false, timestamps: false };
const GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Biography',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Sport',
  'Thriller',
  'War',
  'Western',
];
const PG_TABLES = ['User', 'Genre', 'Title', 'TitleGenre', 'Review'] as const;

type Options = {
  titles: number;
  reviews: number;
  users: number;
  replies: number;
  reset: boolean;
  dryRun: boolean;
  verifyOnly: boolean;
};
type Header = {
  id: string;
  titleId: string;
  userId: string;
  createdAt: Date;
  mediaType: 'MOVIE' | 'BOOK' | 'TV_SHOW';
};

function options(args: string[]): Options {
  const result: Options = {
    titles: 950000,
    reviews: 1000000,
    users: 100000,
    replies: 300000,
    reset: false,
    dryRun: false,
    verifyOnly: false,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--reset') result.reset = true;
    else if (flag === '--dry-run') result.dryRun = true;
    else if (flag === '--verify-only') result.verifyOnly = true;
    else if (['--titles', '--reviews', '--users', '--replies'].includes(flag ?? '')) {
      const key = flag!.slice(2) as 'titles' | 'reviews' | 'users' | 'replies';
      const raw = args[++i];
      const value = Number(raw);
      const minimum = key === 'titles' || key === 'users' ? 1 : 0;
      if (
        !raw ||
        !/^\d+$/.test(raw) ||
        !Number.isSafeInteger(value) ||
        value < minimum ||
        value > 2147483647
      ) {
        throw new Error(`${flag} requires an integer between ${minimum} and 2147483647`);
      }
      result[key] = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (result.reset && result.verifyOnly)
    throw new Error('--verify-only cannot be combined with --reset');
  if (!result.verifyOnly && result.reviews === 0 && result.replies > 0) {
    throw new Error('--replies requires at least one review');
  }
  return result;
}

async function phase<T>(name: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  console.log(`${name}: starting`);
  const result = await work();
  console.log(`${name}: finished in ${((performance.now() - start) / 1000).toFixed(2)}s`);
  return result;
}

function loadBodies(): string[] {
  const file = new URL('../data/processed/review_bodies.jsonl', import.meta.url);
  let input: string;
  try {
    input = readFileSync(file, 'utf8');
  } catch {
    throw new Error(
      'Required real body text file is missing/unreadable: data/processed/review_bodies.jsonl',
    );
  }
  const bodies = input
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      const row = JSON.parse(line) as { text?: unknown };
      if (typeof row.text !== 'string' || !row.text.trim()) {
        throw new Error(`review_bodies.jsonl line ${index + 1} requires non-empty text`);
      }
      return row.text;
    });
  if (!bodies.length) throw new Error('data/processed/review_bodies.jsonl contains no body texts');
  return bodies;
}

async function loadPostgres(pg: PrismaClient, o: Options): Promise<void> {
  await phase(
    'PostgreSQL users',
    () => pg.$executeRaw`
    INSERT INTO "User" (id, email, username, "passwordHash", role, "createdAt", "updatedAt")
    SELECT 'bench-user-' || n, 'bench-' || n || '@example.test', 'Bench User ' || n,
           'synthetic-dummy-hash-not-for-login', 'MEMBER'::"Role", now(), now()
    FROM generate_series(1, ${o.users}::int) AS n`,
  );
  await phase(
    'PostgreSQL genres',
    () => pg.$executeRaw`
    INSERT INTO "Genre" (id, name)
    SELECT 'bench-genre-' || n, name
    FROM unnest(${GENRES}::text[]) WITH ORDINALITY AS g(name, n)`,
  );
  await phase(
    'PostgreSQL titles',
    () => pg.$executeRaw`
    INSERT INTO "Title" (id, name, "mediaType", status, "releaseYear", "avgRating", "reviewCount", "createdAt", "updatedAt")
    SELECT 'bench-title-' || n, 'Bench Title ' || n,
           (ARRAY['MOVIE','BOOK','TV_SHOW'])[(n - 1) % 3 + 1]::"MediaType",
           'APPROVED'::"TitleStatus", 1900 + floor(random() * 126)::int, 0, 0, now(), now()
    FROM generate_series(1, ${o.titles}::int) AS n`,
  );
  await phase(
    'PostgreSQL title-genre links',
    () => pg.$executeRaw`
    INSERT INTO "TitleGenre" ("titleId", "genreId")
    SELECT 'bench-title-' || n, 'bench-genre-' || ((n - 1 + offset_n) % ${GENRES.length}::int + 1)
    FROM generate_series(1, ${o.titles}::int) AS n CROSS JOIN generate_series(0, 1) AS offset_n`,
  );
  await phase('PostgreSQL reviews (synthetic attempts; duplicate pairs skipped)', async () => {
    let inserted = 0;
    for (let start = 1; start <= o.reviews; start += 100000) {
      const end = Math.min(start + 99999, o.reviews);
      inserted += await pg.$executeRaw`
        INSERT INTO "Review" (id, "userId", "titleId", rating, "createdAt", "updatedAt")
        SELECT 'bench-review-' || n,
               'bench-user-' || (1 + floor(random() * ${o.users}::int)::int),
               'bench-title-' || (1 + floor(${o.titles}::int * power(random(), 3))::int),
               CASE WHEN random() < 0.8 THEN 4 + floor(random() * 2)::int ELSE 1 + floor(random() * 3)::int END,
               stamp, stamp
        FROM (
          SELECT n, timestamp '2015-01-01' + random() * (timestamp '2026-01-01' - timestamp '2015-01-01') AS stamp
          FROM generate_series(${start}::int, ${end}::int) AS n
        ) AS generated
        ON CONFLICT ("userId", "titleId") DO NOTHING`;
      console.log(`Reviews: ${end}/${o.reviews} attempts, ${inserted} inserted`);
    }
    console.log(`Review conflict loss: ${o.reviews - inserted}`);
  });
  // Same numeric ROUND(AVG(...), 2) as title_rating_stats / recomputeTitleRating.
  await phase(
    'PostgreSQL title rating aggregates',
    () => pg.$executeRaw`
    UPDATE "Title" AS t SET "avgRating" = s.rating, "reviewCount" = s.count
    FROM (SELECT "titleId", ROUND(AVG(rating), 2)::float8 AS rating, COUNT(*)::int AS count
          FROM "Review" GROUP BY "titleId") AS s
    WHERE t.id = s."titleId"`,
  );
}

type BodiesModel = ReturnType<typeof makeModels>['bodies'];
type RepliesModel = ReturnType<typeof makeModels>['replies'];

function makeModels(connection: mongoose.Connection) {
  // Reuse the application's schemas and actual collection names on an isolated connection.
  // Disable automatic index creation; explicitly build the declared indexes after bulk loading.
  return {
    bodies: connection.model('ReviewBody', ReviewBody.schema.clone(), ReviewBody.collection.name),
    replies: connection.model('Reply', Reply.schema.clone(), Reply.collection.name),
  };
}

async function loadMongo(
  pg: PrismaClient,
  bodies: BodiesModel,
  replies: RepliesModel,
  texts: string[],
  o: Options,
): Promise<void> {
  let cursor = '';
  let copied = 0;
  let replyCount = 0;
  let lastBatch: Header[] = [];
  const replyDoc = (row: Header, index: number) => ({
    reviewId: row.id,
    userId: `bench-user-${1 + Math.floor(Math.random() * o.users)}`,
    body: texts[index % texts.length]!,
    editedAt: null,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  });
  while (true) {
    const rows = await pg.$queryRaw<Header[]>`
      SELECT r.id, r."titleId", r."userId", r."createdAt", t."mediaType"
      FROM "Review" r JOIN "Title" t ON t.id = r."titleId"
      WHERE r.id > ${cursor} ORDER BY r.id LIMIT ${BATCH}`;
    if (!rows.length) break;
    await bodies.insertMany(
      rows.map((row, index) => ({
        _id: row.id,
        titleId: row.titleId,
        userId: row.userId,
        mediaType: row.mediaType,
        body: texts[(copied + index) % texts.length]!,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      })),
      INSERT_OPTIONS,
    );
    const children = [];
    for (const row of rows) {
      if (replyCount < o.replies && Math.random() < o.replies / o.reviews) {
        children.push(replyDoc(row, replyCount++));
      }
    }
    if (children.length) await replies.insertMany(children, INSERT_OPTIONS);
    copied += rows.length;
    cursor = rows[rows.length - 1]!.id;
    lastBatch = rows;
    console.log(`MongoDB: ${copied} bodies, ${replyCount}/${o.replies} replies`);
  }
  if (o.replies > 0 && !lastBatch.length)
    throw new Error('Cannot create replies: PostgreSQL has no reviews');
  // Bernoulli sampling and PG pair conflicts can undershoot. Fill the remaining quota with
  // existing parents; multiple flat replies on the same review are allowed by the real schema.
  if (replyCount < o.replies)
    console.log(`Topping up ${o.replies - replyCount} replies after sampling`);
  while (replyCount < o.replies) {
    const count = Math.min(BATCH, o.replies - replyCount);
    const children = Array.from({ length: count }, () =>
      replyDoc(lastBatch[Math.floor(Math.random() * lastBatch.length)]!, replyCount++),
    );
    await replies.insertMany(children, INSERT_OPTIONS);
    console.log(`Replies: ${replyCount}/${o.replies}`);
  }
}

async function verify(
  pg: PrismaClient,
  connection: mongoose.Connection,
  bodies: BodiesModel,
  replies: RepliesModel,
): Promise<void> {
  const counts = [
    { store: 'PostgreSQL', object: 'User', count: await pg.user.count() },
    { store: 'PostgreSQL', object: 'Genre', count: await pg.genre.count() },
    { store: 'PostgreSQL', object: 'Title', count: await pg.title.count() },
    { store: 'PostgreSQL', object: 'TitleGenre', count: await pg.titleGenre.count() },
    { store: 'PostgreSQL', object: 'Review', count: await pg.review.count() },
    { store: 'MongoDB', object: bodies.collection.name, count: await bodies.countDocuments() },
    { store: 'MongoDB', object: replies.collection.name, count: await replies.countDocuments() },
  ];
  console.table(counts);
  const sizes = await pg.$queryRaw<{ table: string; bytes: bigint }[]>`
    SELECT name AS "table", pg_total_relation_size(format('%I', name)::regclass) AS bytes
    FROM unnest(${[...PG_TABLES]}::text[]) AS name`;
  console.table(
    sizes.map((row) => ({ store: 'PostgreSQL', object: row.table, bytes: String(row.bytes) })),
  );
  const stats = await connection.db!.stats();
  console.table([
    {
      store: 'MongoDB',
      dataSize: stats.dataSize,
      indexSize: stats.indexSize,
      totalBytes: stats.dataSize + stats.indexSize,
      storageSize: stats.storageSize,
      allocatedBytes: stats.storageSize + stats.indexSize,
    },
  ]);
  console.log('Mongo totalBytes = logical dataSize + indexSize; allocatedBytes uses storageSize.');
  const pgCount = counts[4]!.count;
  const mongoCount = counts[5]!.count;
  if (pgCount !== mongoCount)
    throw new Error(`Review count mismatch: PG ${pgCount}, Mongo ${mongoCount}`);
  const sample = await pg.$queryRaw<Header[]>`
    SELECT id, "titleId", "userId", "createdAt" FROM "Review" ORDER BY random() LIMIT 20`;
  const docs = await bodies
    .find({ _id: { $in: sample.map((row) => row.id) } })
    .lean<{ _id: string; titleId: string; userId: string; createdAt: Date }[]>();
  for (const row of sample) {
    const doc = docs.find((body) => body._id === row.id);
    if (
      !doc ||
      doc.titleId !== row.titleId ||
      doc.userId !== row.userId ||
      doc.createdAt.getTime() !== row.createdAt.getTime()
    ) {
      throw new Error(`Review field mismatch for ${row.id} (titleId/userId/createdAt)`);
    }
  }
  // Full id parity prevents equal counts with different ids from passing verification.
  let cursor = '';
  let checked = 0;
  while (true) {
    const batch = await bodies
      .find({ _id: { $gt: cursor } })
      .sort({ _id: 1 })
      .limit(BATCH)
      .select('_id')
      .lean<{ _id: string }[]>();
    if (!batch.length) break;
    const ids = batch.map((doc) => doc._id);
    if ((await pg.review.count({ where: { id: { in: ids } } })) !== ids.length) {
      throw new Error('Review id mismatch: MongoDB contains ids missing from PostgreSQL');
    }
    checked += ids.length;
    cursor = ids[ids.length - 1]!;
    if (checked % 100000 === 0) console.log(`Verified ${checked} shared review ids`);
  }
  const children = await replies.aggregate<{ reviewId: string }>([
    { $sample: { size: 1000 } },
    { $project: { reviewId: 1 } },
  ]);
  const parentIds = [...new Set(children.map((row) => row.reviewId))];
  if ((await pg.review.count({ where: { id: { in: parentIds } } })) !== parentIds.length) {
    throw new Error('Reply parent mismatch: sampled reviewId is missing from PostgreSQL');
  }
  console.log(
    `Verified ${checked} shared ids, ${sample.length} field comparisons, ${children.length} reply parents`,
  );
}

/** No app env loader: benchmark credentials must be explicitly supplied by the caller. */
export async function main(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const pgUrl = env['BENCH_DATABASE_URL'];
  const mongoUri = env['BENCH_MONGO_URI'];
  if (!pgUrl) throw new Error('BENCH_DATABASE_URL is required');
  if (!mongoUri) throw new Error('BENCH_MONGO_URI is required');
  assertBenchDatabase(pgUrl);
  assertBenchDatabase(mongoUri);
  if (new URL(pgUrl).protocol !== 'postgresql:')
    throw new Error('BENCH_DATABASE_URL must use postgresql://');
  if (!['mongodb:', 'mongodb+srv:'].includes(new URL(mongoUri).protocol)) {
    throw new Error('BENCH_MONGO_URI must use mongodb:// or mongodb+srv://');
  }
  const o = options(args);
  console.log('SYNTHETIC benchmark data (real text reused for realistic document sizes)');
  console.table({
    PostgreSQL: { database: decodeURIComponent(new URL(pgUrl).pathname.slice(1)) },
    MongoDB: { database: decodeURIComponent(new URL(mongoUri).pathname.slice(1)) },
  });
  console.log(
    `Plan: ${o.users} users, ${GENRES.length} genres, ${o.titles} titles, ${o.titles * 2} genre links, ${o.reviews} review attempts, ${o.replies} replies`,
  );
  console.log(
    `Mode: ${o.verifyOnly ? 'verify only' : o.reset ? 'reset and seed' : 'seed empty targets'}${o.dryRun ? ' (dry-run, no connections)' : ''}`,
  );
  if (o.dryRun) return;
  // Check the source before opening clients or resetting data; read exactly once.
  const texts = o.verifyOnly ? [] : loadBodies();
  const pg = new PrismaClient({ datasourceUrl: pgUrl });
  let connection: mongoose.Connection | undefined;
  try {
    connection = mongoose.createConnection(mongoUri, { autoIndex: false, autoCreate: false });
    await connection.asPromise();
    const { bodies, replies } = makeModels(connection);
    if (!o.verifyOnly) {
      await phase('Target preflight', async () => {
        if (!o.reset) {
          // Check every application table and every Mongo collection, including unfilled ones.
          const pgCounts = await Promise.all([
            pg.user.count(),
            pg.genre.count(),
            pg.title.count(),
            pg.titleGenre.count(),
            pg.review.count(),
            pg.person.count(),
            pg.titlePerson.count(),
            pg.listEntry.count(),
            pg.movieDetails.count(),
            pg.tvDetails.count(),
            pg.bookDetails.count(),
          ]);
          const collections = await connection!
            .db!.listCollections({}, { nameOnly: true })
            .toArray();
          const mongoCounts = await Promise.all(
            collections.map((c) =>
              connection!.db!.collection(c.name).countDocuments({}, { limit: 1 }),
            ),
          );
          if ([...pgCounts, ...mongoCounts].some((count) => count > 0)) {
            throw new Error(
              'Benchmark target is non-empty; re-run with --reset to truncate filled PG tables (CASCADE) and drop reviewbodies/replies',
            );
          }
        } else {
          await pg.$executeRaw`TRUNCATE "Review", "TitleGenre", "Title", "Genre", "User" CASCADE`;
          const existing = await connection!.db!.listCollections({}, { nameOnly: true }).toArray();
          for (const model of [bodies, replies]) {
            if (existing.some((c) => c.name === model.collection.name))
              await model.collection.drop();
          }
        }
      });
      await loadPostgres(pg, o);
      await phase('MongoDB bodies and flat replies', () =>
        loadMongo(pg, bodies, replies, texts, o),
      );
      await phase('MongoDB indexes', async () => {
        await bodies.createIndexes();
        await replies.createIndexes();
      });
      await phase('PostgreSQL ANALYZE', async () => {
        await pg.$executeRaw`ANALYZE "User", "Genre", "Title", "TitleGenre", "Review"`;
      });
      await phase('PostgreSQL rank view refresh', async () => {
        await pg.$executeRaw`REFRESH MATERIALIZED VIEW "title_rank_in_type"`;
      });
      if ((await replies.countDocuments()) !== o.replies)
        throw new Error('Reply count does not match requested count');
    }
    await phase('Cross-store verification and sizes', () =>
      verify(pg, connection!, bodies, replies),
    );
  } finally {
    // Both cleanup attempts run even when one fails.
    await Promise.all([pg.$disconnect(), connection?.close()]);
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(
      `Benchmark seed FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
