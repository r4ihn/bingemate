import { Prisma } from '@prisma/client';
import type { Scenario } from '../lib/scenario.js';
import { BATCH, collection, collectionExists } from '../lib/setup.js';

type Title = {
  id: string;
  name: string;
  mediaType: string;
  status: string;
  genres: string[];
  avgRating: number;
  reviewCount: number;
  releaseYear: number | null;
};
const filter = { status: 'APPROVED', mediaType: 'MOVIE', genres: 'Drama' };
const where = Prisma.sql`t.status = 'APPROVED' AND t."mediaType" = 'MOVIE' AND EXISTS (
  SELECT 1 FROM "TitleGenre" tg JOIN "Genre" g ON g.id = tg."genreId"
  WHERE tg."titleId" = t.id AND lower(g.name) = lower(${'Drama'}))`;
export default {
  name: 'filtered-browse',
  description:
    'First 20 APPROVED MOVIE titles in Drama plus a separate total count. Matches listTitles rating sort: avgRating DESC, reviewCount DESC, id ASC (the app includes reviewCount as a tie-break). SQL uses case-insensitive genre matching; seeded canonical Drama is embedded in Mongo. Mongo has the requested mediaType/genres/avgRating/_id index; reviewCount tie-breaking may require an additional sort.',
  async setup(ctx) {
    if (ctx.keepSetup && (await collectionExists(ctx, 'bench_titles'))) {
      ctx.note('Reused bench_titles (not rebuilt).');
      return;
    }
    if (await collectionExists(ctx, 'bench_titles')) await collection(ctx, 'bench_titles').drop();
    let cursor = '';
    while (true) {
      const rows = await ctx.pg.$queryRaw<Title[]>(Prisma.sql`
        SELECT t.id, t.name, t."mediaType", t.status, t."avgRating", t."reviewCount", t."releaseYear",
          COALESCE(array_agg(g.name ORDER BY g.name) FILTER (WHERE g.name IS NOT NULL), ARRAY[]::text[]) AS genres
        FROM (SELECT * FROM "Title" WHERE id > ${cursor} ORDER BY id LIMIT ${BATCH}) t
        LEFT JOIN "TitleGenre" tg ON tg."titleId" = t.id LEFT JOIN "Genre" g ON g.id = tg."genreId"
        GROUP BY t.id, t.name, t."mediaType", t.status, t."avgRating", t."reviewCount", t."releaseYear" ORDER BY t.id`);
      if (!rows.length) break;
      await collection(ctx, 'bench_titles').insertMany(
        rows.map(({ id, ...row }) => ({ _id: id, ...row })),
      );
      cursor = rows[rows.length - 1]!.id;
    }
    await collection(ctx, 'bench_titles').createIndex({
      mediaType: 1,
      genres: 1,
      avgRating: -1,
      _id: 1,
    });
  },
  async sql(ctx) {
    await ctx.pg
      .$queryRaw(Prisma.sql`SELECT t.id, t.name, t."mediaType", t.status, t."avgRating", t."reviewCount", t."releaseYear"
      FROM "Title" t WHERE ${where} ORDER BY t."avgRating" DESC, t."reviewCount" DESC, t.id ASC LIMIT 20`);
    await ctx.pg.$queryRaw(Prisma.sql`SELECT count(*) FROM "Title" t WHERE ${where}`);
  },
  async mongo(ctx) {
    await collection(ctx, 'bench_titles')
      .find(filter, { projection: { genres: 0 } })
      .sort({ avgRating: -1, reviewCount: -1, _id: 1 })
      .limit(20)
      .toArray();
    await collection(ctx, 'bench_titles').countDocuments(filter);
  },
  async teardown(ctx) {
    if (await collectionExists(ctx, 'bench_titles')) await collection(ctx, 'bench_titles').drop();
  },
} satisfies Scenario;
