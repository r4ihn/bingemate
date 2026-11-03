import { Prisma } from '@prisma/client';
import type { Document } from 'mongodb';
import type { Ctx } from './scenario.js';
import { lockTitle, recomputeTitleRating } from '../../apps/api/src/modules/reviews/rating.js';

export const BATCH = 5000;
export const collection = <T extends Document = Document & { _id: string }>(
  ctx: Ctx,
  name: string,
) => ctx.mongo.db!.collection<T>(name);
export async function tableExists(ctx: Ctx, name: string): Promise<boolean> {
  const rows = await ctx.pg.$queryRaw<{ present: boolean }[]>(
    Prisma.sql`SELECT to_regclass(${name}) IS NOT NULL AS present`,
  );
  return rows[0]!.present;
}
export async function collectionExists(ctx: Ctx, name: string): Promise<boolean> {
  return (await ctx.mongo.db!.listCollections({ name }).toArray()).length > 0;
}
export async function ensureReviewText(ctx: Ctx): Promise<void> {
  await ctx.pg.$executeRaw(Prisma.sql`CREATE TABLE IF NOT EXISTS bench_review_text (
    id text PRIMARY KEY, "titleId" text, "userId" text, rating int, body text, "createdAt" timestamp)`);
  await ctx.pg.$executeRaw(
    Prisma.sql`CREATE INDEX IF NOT EXISTS bench_review_text_title_date ON bench_review_text ("titleId", "createdAt" DESC)`,
  );
}
export async function removeInserted(
  ctx: Ctx,
  trackedIds: string[] = [],
  touched = new Set<string>(),
): Promise<void> {
  // Prefix discovery also recovers rows left by an interrupted earlier run.
  const rows = await ctx.pg.$queryRaw<{ id: string; titleId: string }[]>(Prisma.sql`
    SELECT id, "titleId" FROM "Review" WHERE left(id, 10) = 'bench-ins-' OR id = ANY(${trackedIds}::text[])`);
  for (const row of rows) touched.add(row.titleId);
  for (const titleId of touched) {
    await ctx.pg.$transaction(async (tx) => {
      await lockTitle(tx, titleId);
      await tx.$executeRaw(Prisma.sql`DELETE FROM "Review" WHERE "titleId" = ${titleId}
        AND (left(id, 10) = 'bench-ins-' OR id = ANY(${trackedIds}::text[]))`);
      await recomputeTitleRating(tx, titleId);
    });
  }
  await collection(ctx, 'reviewbodies').deleteMany({ _id: /^bench-ins-/ });
  if (await tableExists(ctx, 'bench_review_text')) {
    await ctx.pg.$executeRaw(
      Prisma.sql`DELETE FROM bench_review_text WHERE left(id, 10) = 'bench-ins-'`,
    );
  }
}
export async function dropAll(ctx: Ctx): Promise<void> {
  await removeInserted(ctx);
  const tables = await ctx.pg.$queryRaw<{ tablename: string }[]>(Prisma.sql`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND left(tablename, 6) = 'bench_'`);
  for (const { tablename } of tables) {
    // Identifiers are catalog-derived and quoted, never supplied by CLI input.
    await ctx.pg.$executeRaw(
      Prisma.sql`DROP TABLE ${Prisma.raw('"' + tablename.replaceAll('"', '""') + '"')}`,
    );
  }
  for (const { name } of await ctx.mongo.db!.listCollections().toArray()) {
    if (name.startsWith('bench_')) await ctx.mongo.db!.dropCollection(name);
  }
}
