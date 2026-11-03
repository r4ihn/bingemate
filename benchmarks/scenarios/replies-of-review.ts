import { Prisma } from '@prisma/client';
import type { Document } from 'mongodb';
import type { Scenario } from '../lib/scenario.js';
import { BATCH, collection, tableExists } from '../lib/setup.js';

let reviewId = '';
export default {
  name: 'replies-of-review',
  description: 'Oldest 20 flat replies for the review with the most replies; same Mongo replies copied into an indexed SQL table. Replies are a flat collection, without nested threads.',
  async setup(ctx) {
    const rows = await collection(ctx, 'replies').aggregate<{ _id: string }>([
      { $group: { _id: '$reviewId', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 1 },
    ]).toArray();
    if (!rows[0]) throw new Error('replies-of-review requires seeded replies');
    reviewId = rows[0]._id;
    ctx.note(`Selected review: ${reviewId}.`);
    if (ctx.keepSetup && await tableExists(ctx, 'bench_reply')) {
      ctx.note('Reused existing bench_reply (not rebuilt).');
      return;
    }
    await ctx.pg.$executeRaw(Prisma.sql`DROP TABLE IF EXISTS bench_reply`);
    await ctx.pg.$executeRaw(Prisma.sql`CREATE TABLE bench_reply (id text PRIMARY KEY, "reviewId" text, "userId" text, body text, "createdAt" timestamp)`);
    const cursor = collection<Document>(ctx, 'replies').find().batchSize(BATCH);
    let batch: Document[] = [];
    const flush = async () => {
      await ctx.pg.$executeRaw(Prisma.sql`INSERT INTO bench_reply SELECT * FROM unnest(
        ${batch.map((d) => String(d._id))}::text[], ${batch.map((d) => d.reviewId)}::text[],
        ${batch.map((d) => d.userId)}::text[], ${batch.map((d) => d.body)}::text[],
        ${batch.map((d) => d.createdAt)}::timestamp[])`);
      batch = [];
    };
    try {
      for await (const doc of cursor) { batch.push(doc); if (batch.length === BATCH) await flush(); }
      if (batch.length) await flush();
    } finally { await cursor.close(); }
    await ctx.pg.$executeRaw(Prisma.sql`CREATE INDEX ON bench_reply ("reviewId", "createdAt")`);
    await ctx.pg.$executeRaw(Prisma.sql`ANALYZE bench_reply`);
  },
  async sql(ctx) {
    await ctx.pg.$queryRaw(Prisma.sql`SELECT id, "reviewId", "userId", body, "createdAt" FROM bench_reply WHERE "reviewId" = ${reviewId} ORDER BY "createdAt" ASC LIMIT 20`);
  },
  async mongo(ctx) {
    await collection(ctx, 'replies').find({ reviewId }).sort({ createdAt: 1 }).limit(20).toArray();
  },
  async teardown(ctx) { await ctx.pg.$executeRaw(Prisma.sql`DROP TABLE IF EXISTS bench_reply`); },
} satisfies Scenario;
