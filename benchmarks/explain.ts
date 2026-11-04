import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import mongoose from 'mongoose';
import { assertBenchDatabase } from './lib/guard.js';

type Json = Record<string, unknown>;
const object = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
const number = (value: unknown): number => (typeof value === 'number' ? value : 0);

/** Depth-first traversal of a plan, never rejected/alternative plans. */
function firstNode(
  root: Json,
  children: (node: Json) => unknown[],
  matches: (node: Json) => boolean,
): Json | undefined {
  if (matches(root)) return root;
  for (const child of children(root)) {
    const found = firstNode(object(child), children, matches);
    if (found) return found;
  }
  return undefined;
}

/** Accept the JSON document returned by PostgreSQL EXPLAIN FORMAT JSON. */
export function describePlan(planJson: unknown) {
  const doc = object(Array.isArray(planJson) ? planJson[0] : planJson);
  const plan = object(doc['Plan']);
  const children = (node: Json): unknown[] => (Array.isArray(node['Plans']) ? node['Plans'] : []);
  const scan = firstNode(plan, children, (node) =>
    /^(Seq Scan|Index Scan|Index Only Scan|Bitmap)/.test(String(node['Node Type'])),
  );
  const indexed =
    scan && firstNode(scan, children, (node) => typeof node['Index Name'] === 'string');
  return {
    node: String(plan['Node Type'] ?? 'unknown'),
    scan: scan?.['Node Type'] ?? null,
    index: indexed?.['Index Name'] ?? null,
    rows: number(plan['Actual Rows']),
    executionMs: number(doc['Execution Time']),
    planningMs: number(doc['Planning Time']),
    // Root counters include children; summing the tree would double-count buffers.
    sharedHit: number(plan['Shared Hit Blocks']),
    sharedRead: number(plan['Shared Read Blocks']),
  };
}

/** MongoDB 7 supports both $cursor stages and optimized top-level/SBE plans. */
export function describeMongoExplain(json: unknown) {
  const doc = object(json);
  const stages = Array.isArray(doc['stages']) ? doc['stages'].map(object) : [];
  const cursor = stages.find((stage) => stage['$cursor']);
  const source = cursor ? object(cursor['$cursor']) : doc;
  const planner = object(source['queryPlanner']);
  const stats = object(source['executionStats']);
  const winning = object(planner['winningPlan']);
  const children = (node: Json): unknown[] =>
    [
      node['queryPlan'],
      node['inputStage'],
      node['outerStage'],
      node['innerStage'],
      ...(Array.isArray(node['inputStages']) ? node['inputStages'] : []),
    ].filter(Boolean);
  const scan = firstNode(
    winning,
    children,
    (node) => node['stage'] === 'IXSCAN' || node['stage'] === 'COLLSCAN',
  );
  // Cursor nReturned is its input to aggregation; the last stage reports final result rows.
  const final = [...stages].reverse().find((stage) => typeof stage['nReturned'] === 'number');
  return {
    scan: scan?.['stage'] ?? 'unknown',
    index: scan?.['indexName'] ?? null,
    keysExamined: number(stats['totalKeysExamined']),
    docsExamined: number(stats['totalDocsExamined']),
    nReturned: number(final?.['nReturned'] ?? stats['nReturned']),
    executionTimeMillis: number(stats['executionTimeMillis']),
  };
}

type Inputs = { hotId: string; quietId: string; mediaType: string; name: string; genre: string };
type Query = { name: string; note: string; sql: string; params: unknown[] };
const SUMMARY =
  '"id", "name", "mediaType", "status", "avgRating", "reviewCount", "posterUrl", "createdById"';
const ORDER = {
  rating: '"avgRating" DESC, "reviewCount" DESC, "id" ASC',
  name: '"name" ASC, "id" ASC',
  year: '"releaseYear" DESC NULLS LAST, "id" ASC',
  reviews: '"reviewCount" DESC, "id" ASC',
};

/** Named, parameterised equivalents of the application's read queries. No I/O. */
export function postgresQueries(input: Inputs): Query[] {
  const browse = (sort: keyof typeof ORDER, genre = false): Query => ({
    name: `browse-${sort}${genre ? '-genre' : ''}`,
    note: `GET /titles: APPROVED, type, sort=${sort}${genre ? ', case-insensitive genre' : ''}, page=1, pageSize=20`,
    sql: `SELECT ${SUMMARY} FROM "Title" WHERE "status" = $1::"TitleStatus" AND "mediaType" = $2::"MediaType"
      ${genre ? 'AND EXISTS (SELECT 1 FROM "TitleGenre" tg JOIN "Genre" g ON g.id = tg."genreId" WHERE tg."titleId" = "Title".id AND g.name ILIKE $5)' : ''}
      ORDER BY ${ORDER[sort]} LIMIT $3 OFFSET $4`,
    params: ['APPROVED', input.mediaType, 20, 0, ...(genre ? [escapeLike(input.genre)] : [])],
  });
  const review = (hot: boolean): Query => ({
    name: `reviews-${hot ? 'hot' : 'one-review'}`,
    note: 'GET /titles/:id/reviews: first page, newest first; author fetched separately by Prisma include',
    sql: 'SELECT "id", "userId", "titleId", "rating", "createdAt", "updatedAt" FROM "Review" WHERE "titleId" = $1 ORDER BY "createdAt" DESC, "id" DESC LIMIT $2 OFFSET $3',
    params: [hot ? input.hotId : input.quietId, 20, 0],
  });
  return [
    browse('rating'),
    browse('rating', true),
    browse('name'),
    browse('year'),
    browse('reviews'),
    {
      name: 'search-name',
      note: 'GET /titles?q=existing-name: APPROVED, default name sort, first page',
      sql: `SELECT ${SUMMARY} FROM "Title" WHERE "status" = $1::"TitleStatus" AND "name" ILIKE $2 ORDER BY ${ORDER.name} LIMIT $3 OFFSET $4`,
      params: ['APPROVED', `%${escapeLike(input.name)}%`, 20, 0],
    },
    {
      name: 'genre-filter-options',
      note: 'GET /genres?type: genre_filter_options view',
      sql: 'SELECT "genre_id", "name", "title_count" FROM "genre_filter_options" WHERE "mediaType" = $1::"MediaType"',
      params: [input.mediaType],
    },
    {
      name: 'trending-top-50',
      note: 'refreshTrending job: top 50 per media type including posters',
      sql: `SELECT "id", "name", "mediaType", "review_count", "avg_rating", "trending_score", "posterUrl"
        FROM (SELECT v.*, t."posterUrl", ROW_NUMBER() OVER (
          PARTITION BY v."mediaType" ORDER BY v."trending_score" DESC, v."id" ASC) AS "rank"
          FROM "trending_titles" v JOIN "Title" t ON t."id" = v."id") ranked WHERE "rank" <= $1`,
      params: [50],
    },
    {
      name: 'rating-stats-hot',
      note: 'title_rating_stats row used by recomputeTitleRating for hottest title',
      sql: 'SELECT review_count, avg_rating FROM "title_rating_stats" WHERE title_id = $1',
      params: [input.hotId],
    },
    review(true),
    review(false),
    {
      name: 'rank-hot',
      note: 'GET /titles/:id: getTitleRank materialized-view lookup',
      sql: 'SELECT rank_in_type AS "rankInType", GREATEST(1, CEIL(pct_rank * 100)) AS "topPercent" FROM "title_rank_in_type" WHERE title_id = $1',
      params: [input.hotId],
    },
  ];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
const MONGO_QUERIES = [
  ['review-activity', 'GET /titles/:id/review-activity: hottest title, 120 months'],
  ['top-reviewers', 'GET /reviewers/top: no hidden ids, limit 10'],
  ['top-reviewers-type', 'GET /reviewers/top?type: no hidden ids, limit 10'],
  ['recent-review-counts', 'refreshTrending: rolling 1460-day review counts'],
] as const;

function options(args: string[]) {
  let label: string | undefined;
  let runs = 3;
  let list = false;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--list') list = true;
    else if (flag === '--label') {
      label = args[++i];
      if (!label || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(label))
        throw new Error(
          '--label requires 1–80 letters, digits, underscores or hyphens, starting with a letter or digit',
        );
    } else if (flag === '--runs') {
      const raw = args[++i];
      runs = Number(raw);
      if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(runs) || runs < 1)
        throw new Error('--runs requires a positive integer');
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (!list && !label) throw new Error('--label is required');
  return { label, runs, list };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
function table(headers: string[], rows: unknown[][]): string {
  const line = (cells: unknown[]) =>
    `| ${cells
      .map((cell) =>
        String(cell ?? '—')
          .replace(/\|/g, '\\|')
          .replace(/[\r\n]/g, ' '),
      )
      .join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

/** Importing the service normally constructs the app singleton. Supply the guarded bench
 * client through its existing injection hook, then restore the prior global value.
 * Only exported pipeline builders are used; no app database functions are called. */
async function loadPipelines(pg: PrismaClient) {
  const shared = globalThis as unknown as { prisma?: PrismaClient };
  const previous = shared.prisma;
  shared.prisma = pg;
  try {
    return await import('../apps/api/src/modules/reviewStats/reviewStats.service.js');
  } finally {
    if (previous === undefined) delete shared.prisma;
    else shared.prisma = previous;
  }
}

export async function main(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const o = options(args);
  if (o.list) {
    const queries = postgresQueries({
      hotId: '<hot>',
      quietId: '<one-review>',
      mediaType: 'MOVIE',
      name: '<existing>',
      genre: '<genre>',
    });
    console.log(
      table(
        ['Store', 'Query', 'Mirrors'],
        [
          ...queries.map((q) => ['PostgreSQL', q.name, q.note]),
          ...MONGO_QUERIES.map(([name, note]) => ['MongoDB', name, note]),
        ],
      ),
    );
    return;
  }
  const pgUrl = env['BENCH_DATABASE_URL'];
  const mongoUri = env['BENCH_MONGO_URI'];
  if (!pgUrl) throw new Error('BENCH_DATABASE_URL is required');
  if (!mongoUri) throw new Error('BENCH_MONGO_URI is required');
  assertBenchDatabase(pgUrl);
  assertBenchDatabase(mongoUri);
  if (new URL(pgUrl).protocol !== 'postgresql:')
    throw new Error('BENCH_DATABASE_URL must use postgresql://');
  if (!['mongodb:', 'mongodb+srv:'].includes(new URL(mongoUri).protocol))
    throw new Error('BENCH_MONGO_URI must use mongodb:// or mongodb+srv://');

  const pg = new PrismaClient({ datasourceUrl: pgUrl });
  let connection: mongoose.Connection | undefined;
  try {
    const pipelines = await loadPipelines(pg);
    connection = mongoose.createConnection(mongoUri, { autoIndex: false, autoCreate: false });
    await connection.asPromise();
    const { ReviewBody } = await import('../apps/api/src/mongo/models/reviewBody.model.js');
    const bodies = connection.model(
      'ReviewBody',
      ReviewBody.schema.clone(),
      ReviewBody.collection.name,
    );
    type Title = { id: string; name: string; mediaType: 'MOVIE' | 'BOOK' | 'TV_SHOW' };
    const hot = (
      await pg.$queryRawUnsafe<
        Title[]
      >(`SELECT t.id, t.name, t."mediaType" FROM "Title" t JOIN "Review" r ON r."titleId" = t.id
      WHERE t.status = 'APPROVED' GROUP BY t.id ORDER BY COUNT(*) DESC, t.id ASC LIMIT 1`)
    )[0];
    const quiet = (
      await pg.$queryRawUnsafe<
        Title[]
      >(`SELECT t.id, t.name, t."mediaType" FROM "Title" t JOIN "Review" r ON r."titleId" = t.id
      WHERE t.status = 'APPROVED' GROUP BY t.id HAVING COUNT(*) = 1 ORDER BY t.id ASC LIMIT 1`)
    )[0];
    if (!hot || !quiet)
      throw new Error(
        'Bench data requires a reviewed APPROVED title and an APPROVED title with exactly one review',
      );
    const genre = (
      await pg.$queryRawUnsafe<{ name: string }[]>(
        `SELECT g.name FROM "Genre" g JOIN "TitleGenre" tg ON tg."genreId" = g.id
      JOIN "Title" t ON t.id = tg."titleId" WHERE t.status = 'APPROVED' AND t."mediaType" = $1::"MediaType" ORDER BY g.name LIMIT 1`,
        hot.mediaType,
      )
    )[0];
    if (!genre)
      throw new Error(
        'Bench data requires a genre on an APPROVED title in the hottest title media type',
      );

    const counts: unknown[][] = [];
    for (const name of ['User', 'Genre', 'Title', 'TitleGenre', 'Review'] as const) {
      const rows = await pg.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM "${name}"`,
      );
      counts.push(['PostgreSQL', name, String(rows[0]!.count)]);
    }
    for (const name of [ReviewBody.collection.name, 'replies']) {
      counts.push(['MongoDB', name, await connection.db!.collection(name).countDocuments()]);
    }
    const queries = postgresQueries({
      hotId: hot.id,
      quietId: quiet.id,
      mediaType: hot.mediaType,
      name: hot.name,
      genre: genre.name,
    });
    const pgRows: unknown[][] = [];
    for (const query of queries) {
      const samples = [];
      for (let i = 0; i < o.runs; i++) {
        const rows = await pg.$queryRawUnsafe<{ 'QUERY PLAN': unknown }[]>(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
          ...query.params,
        );
        samples.push(describePlan(rows[0]!['QUERY PLAN']));
      }
      const executionMs = median(samples.map((s) => s.executionMs));
      const sample = [...samples].sort(
        (a, b) => Math.abs(a.executionMs - executionMs) - Math.abs(b.executionMs - executionMs),
      )[0]!;
      pgRows.push([
        query.name,
        sample.node,
        sample.scan,
        sample.index,
        sample.rows,
        executionMs,
        median(samples.map((s) => s.planningMs)),
        sample.sharedHit,
        sample.sharedRead,
      ]);
    }
    const mongoPipelines = [
      pipelines.reviewActivityPipeline(hot.id, 120),
      pipelines.topReviewersPipeline([], { limit: 10 }),
      pipelines.topReviewersPipeline([], { type: hot.mediaType, limit: 10 }),
      pipelines.recentReviewCountsPipeline(new Date(Date.now() - 1460 * 24 * 60 * 60 * 1000)),
    ];
    const mongoRows: unknown[][] = [];
    for (const [i, pipeline] of mongoPipelines.entries()) {
      const result = describeMongoExplain(
        await bodies.aggregate(pipeline).explain('executionStats'),
      );
      mongoRows.push([
        MONGO_QUERIES[i]![0],
        result.scan,
        result.index,
        result.keysExamined,
        result.docsExamined,
        result.nReturned,
        result.executionTimeMillis,
      ]);
    }
    let sha = 'unavailable';
    try {
      sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: new URL('../', import.meta.url),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      /* Reports are also usable outside a Git checkout. */
    }
    const report = [
      `# Benchmark explain: ${o.label}`,
      `Date: ${new Date().toISOString()}  \nLabel: ${o.label}  \nGit: ${sha}  \nPostgreSQL runs per query: ${o.runs}`,
      `Inputs: mediaType=${hot.mediaType}; hot=${hot.id}; one-review=${quiet.id}; search=${hot.name}; genre=${genre.name}`,
      '## Live row counts',
      table(['Store', 'Object', 'Rows'], counts),
      '## Query catalogue',
      table(['Query', 'Mirrors'], [...queries.map((q) => [q.name, q.note]), ...MONGO_QUERIES]),
      '## PostgreSQL',
      'Execution and planning times are medians (ms). Plan, rows and root buffer counters come from the run nearest median execution time.',
      table(
        [
          'Query',
          'Top node',
          'First scan',
          'Index',
          'Rows',
          'Median execution ms',
          'Median planning ms',
          'Shared hit',
          'Shared read',
        ],
        pgRows,
      ),
      '## MongoDB',
      'One executionStats explain per pipeline; examined counters describe the source cursor, nReturned describes the final aggregation stage when present.',
      table(
        [
          'Query',
          'First scan',
          'Index',
          'Keys examined',
          'Docs examined',
          'nReturned',
          'Execution ms',
        ],
        mongoRows,
      ),
      '',
    ].join('\n\n');
    console.log(report);
    const directory = new URL('./results/', import.meta.url);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL(`explain-${o.label}.md`, directory), report, 'utf8');
  } finally {
    await Promise.all([pg.$disconnect(), connection?.close()]);
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    console.error(
      `Benchmark explain FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
