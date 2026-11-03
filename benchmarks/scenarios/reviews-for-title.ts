import { Prisma } from '@prisma/client';
import type { Scenario, Ctx } from '../lib/scenario.js';
import { BATCH, collection, ensureReviewText, tableExists } from '../lib/setup.js';

let titles: string[] = [];
const calls = { sql: 0, mongo: 0, app: 0 };
const next = (store: keyof typeof calls) => titles[calls[store]++ % 2]!;
async function setup(ctx: Ctx): Promise<void> {
  calls.sql = calls.mongo = calls.app = 0;
  const hot = await ctx.pg.$queryRaw<{ titleId: string }[]>(Prisma.sql`
    SELECT "titleId" FROM "Review" GROUP BY "titleId" ORDER BY count(*) DESC, "titleId" LIMIT 1`);
  const quiet = await ctx.pg.$queryRaw<{ titleId: string }[]>(Prisma.sql`
    SELECT "titleId" FROM "Review" GROUP BY "titleId" HAVING count(*) = 1 ORDER BY "titleId" LIMIT 1`);
  if (!hot[0] || !quiet[0]) throw new Error('reviews-for-title requires a hot title and a title with exactly one review');
  titles = [hot[0].titleId, quiet[0].titleId];
  ctx.note(`Alternating hot ${titles[0]} and quiet ${titles[1]}; counters start at hot for each store, including warmup.`);
  if (ctx.keepSetup && await tableExists(ctx, 'bench_review_text')) {
    ctx.note('Reused existing bench_review_text (not rebuilt).');
    return;
  }
  await ctx.pg.$executeRaw(Prisma.sql`DROP TABLE IF EXISTS bench_review_text`);
  await ensureReviewText(ctx);
  const cursor = collection(ctx, 'reviewbodies').find({ _id: { $not: /^bench-ins-/ } }).batchSize(BATCH);
  let batch: { id: string; titleId: string; userId: string; body: string; createdAt: Date }[] = [];
  const flush = async () => {
    await ctx.pg.$executeRaw(Prisma.sql`INSERT INTO bench_review_text
      SELECT b.id, b.title, b.usr, r.rating, b.body, b.stamp
      FROM unnest(${batch.map((d) => d.id)}::text[], ${batch.map((d) => d.titleId)}::text[],
        ${batch.map((d) => d.userId)}::text[], ${batch.map((d) => d.body)}::text[],
        ${batch.map((d) => d.createdAt)}::timestamp[]) AS b(id, title, usr, body, stamp)
      JOIN "Review" r ON r.id = b.id`);
    batch = [];
  };
  try {
    for await (const doc of cursor) {
      batch.push({ id: doc._id, titleId: doc.titleId, userId: doc.userId, body: doc.body, createdAt: doc.createdAt });
      if (batch.length === BATCH) await flush();
    }
    if (batch.length) await flush();
  } finally { await cursor.close(); }
  await ctx.pg.$executeRaw(Prisma.sql`ANALYZE bench_review_text`);
}
export default {
  name: 'reviews-for-title',
  description: 'Alternating hot/quiet title, newest 20. SQL returns rating and body; Mongo returns bodies only (ratings live in PostgreSQL). app reads PG headers then Mongo bodies by shared ids. Warmup and measured calls alternate continuously; odd counts can weight one title more heavily.',
  setup,
  async sql(ctx) {
    await ctx.pg.$queryRaw(Prisma.sql`SELECT id, rating, body FROM bench_review_text WHERE "titleId" = ${next('sql')} ORDER BY "createdAt" DESC LIMIT 20`);
  },
  async mongo(ctx) {
    await collection(ctx, 'reviewbodies').find({ titleId: next('mongo') }).sort({ createdAt: -1 }).limit(20).toArray();
  },
  async app(ctx) {
    const rows = await ctx.pg.$queryRaw<{ id: string; rating: number }[]>(Prisma.sql`
      SELECT id, rating FROM "Review" WHERE "titleId" = ${next('app')} ORDER BY "createdAt" DESC LIMIT 20`);
    await collection(ctx, 'reviewbodies').find({ _id: { $in: rows.map((r) => r.id) } }).toArray();
  },
  async teardown(ctx) { await ctx.pg.$executeRaw(Prisma.sql`DROP TABLE IF EXISTS bench_review_text`); },
} satisfies Scenario;
