import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { Scenario } from '../lib/scenario.js';
import { collection, ensureReviewText, removeInserted } from '../lib/setup.js';
import { lockTitle, recomputeTitleRating } from '../../apps/api/src/modules/reviews/rating.js';

let counter = 0;
let users: string[] = [];
let titles: { id: string; mediaType: string }[] = [];
const inserted: string[] = [];
const touched = new Set<string>();
const id = () => `bench-ins-${counter++}-${randomUUID()}`;
const choose = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]!;
const pair = () => ({ userId: choose(users), title: choose(titles) });
const body = 'Synthetic benchmark review body.';
export default {
  name: 'insert-review',
  description: 'Single SQL text-row insert versus Mongo body insert; app performs a locked PG Review transaction, recomputes title ratings, then inserts the Mongo body. Random existing users and cold-tail titles; unique-pair conflicts are retried and included in timing. All bench-ins- rows are removed and touched title aggregates restored by cleanup.',
  async setup(ctx) {
    inserted.length = 0;
    touched.clear();
    await ensureReviewText(ctx);
    users = (await ctx.pg.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM "User" ORDER BY id DESC LIMIT 10000`)).map((u) => u.id);
    titles = await ctx.pg.$queryRaw<{ id: string; mediaType: string }[]>(Prisma.sql`
      SELECT id, "mediaType" FROM "Title" WHERE status = 'APPROVED' AND "createdById" IS NULL
      ORDER BY "reviewCount" ASC, id DESC LIMIT 10000`);
    if (!users.length || !titles.length) throw new Error('insert-review requires existing users and cold titles');
    ctx.note(`Cold pool: ${titles.length} least-reviewed titles (id descending tie-break); ${users.length} tail user ids.`);
  },
  async sql(ctx) {
    const { userId, title } = pair();
    await ctx.pg.$executeRaw(Prisma.sql`INSERT INTO bench_review_text (id, "titleId", "userId", rating, body, "createdAt")
      VALUES (${id()}, ${title.id}, ${userId}, ${4}, ${body}, ${new Date()})`);
  },
  async mongo(ctx) {
    const { userId, title } = pair();
    await collection(ctx, 'reviewbodies').insertOne({ _id: id(), titleId: title.id, userId, mediaType: title.mediaType,
      body, createdAt: new Date(), updatedAt: new Date() });
  },
  async app(ctx) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { userId, title } = pair();
      const reviewId = id();
      try {
        await ctx.pg.$transaction(async (tx) => {
          await lockTitle(tx, title.id);
          await tx.$executeRaw(Prisma.sql`INSERT INTO "Review" (id, "userId", "titleId", rating, "createdAt", "updatedAt")
            VALUES (${reviewId}, ${userId}, ${title.id}, ${4}, now(), now())`);
          await recomputeTitleRating(tx, title.id);
        });
      } catch (err) {
        // Raw SQL uniqueness errors use P2010 + PostgreSQL SQLSTATE 23505.
        if (err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === 'P2002' || (err.code === 'P2010' && err.meta?.code === '23505'))) continue;
        throw err;
      }
      inserted.push(reviewId);
      touched.add(title.id);
      try {
        await collection(ctx, 'reviewbodies').insertOne({ _id: reviewId, titleId: title.id, userId,
          mediaType: title.mediaType, body, createdAt: new Date(), updatedAt: new Date() });
      } catch (err) {
        // Match the application's compensation even when --keep-setup was requested.
        await ctx.pg.$transaction(async (tx) => {
          await lockTitle(tx, title.id);
          await tx.$executeRaw(Prisma.sql`DELETE FROM "Review" WHERE id = ${reviewId}`);
          await recomputeTitleRating(tx, title.id);
        });
        throw err;
      }
      return;
    }
    throw new Error('Could not find a free user/title pair after 100 attempts');
  },
  async teardown(ctx) {
    await removeInserted(ctx, inserted, touched);
    await ctx.pg.$executeRaw(Prisma.sql`DROP TABLE IF EXISTS bench_review_text`);
  },
} satisfies Scenario;
