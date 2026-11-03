import { Prisma } from '@prisma/client';
import type { Scenario, Ctx } from '../lib/scenario.js';
import { collection, collectionExists } from '../lib/setup.js';

type TrendingRow = { id: string; name: string; mediaType: string; review_count: bigint; avg_rating: string; trending_score: string; posterUrl: string | null };
// Copied from refreshTrending.ts; do not import the job's application singleton clients.
const top = (ctx: Ctx) => ctx.pg.$queryRaw<TrendingRow[]>(Prisma.sql`
  SELECT "id", "name", "mediaType", "review_count", "avg_rating", "trending_score", "posterUrl"
  FROM (
    SELECT v.*, t."posterUrl", ROW_NUMBER() OVER (
      PARTITION BY v."mediaType" ORDER BY v."trending_score" DESC, v."id" ASC
    ) AS "rank"
    FROM "trending_titles" v JOIN "Title" t ON t."id" = v."id"
  ) ranked WHERE "rank" <= ${50}`);
export default {
  name: 'top-n-trending', defaultRuns: 20, defaultWarmup: 3,
  description: 'Top 50 per media type: SQL compute-on-read over every review versus a precomputed Mongo read sorted by TrendingCard.score. The measured refresh cost is the price of the precomputed read (card refresh only, excluding the separate title-rank materialized view).',
  async setup(ctx) {
    if (ctx.keepSetup && await collectionExists(ctx, 'bench_trendingcards')) {
      ctx.note('Reused bench_trendingcards; refresh cost was not measured this run.');
      return;
    }
    const start = performance.now();
    await collection(ctx, 'bench_trendingcards').drop().catch((err: { code?: number }) => { if (err.code !== 26) throw err; });
    const rows = await top(ctx);
    const since = new Date(Date.now() - 1460 * 86400000);
    const recent = await collection(ctx, 'reviewbodies').aggregate<{ _id: string; reviews: number }>([
      { $match: { createdAt: { $gte: since } } }, { $group: { _id: '$titleId', reviews: { $sum: 1 } } },
    ]).toArray();
    const counts = new Map(recent.map((r) => [r._id, r.reviews]));
    if (rows.length) await collection(ctx, 'bench_trendingcards').insertMany(rows.map((r) => ({
      _id: r.id, titleId: r.id, name: r.name, mediaType: r.mediaType,
      avgRating: Number(r.avg_rating), reviewCount: Number(r.review_count),
      recentReviews: counts.get(r.id) ?? 0, score: Number(r.trending_score),
      ...(r.posterUrl ? { posterUrl: r.posterUrl } : {}), createdAt: new Date(), updatedAt: new Date(),
    })));
    // Same indexes/sort field as TrendingCard, with a compound index for per-type reads.
    await collection(ctx, 'bench_trendingcards').createIndex({ titleId: 1 }, { unique: true });
    await collection(ctx, 'bench_trendingcards').createIndex({ score: 1 });
    await collection(ctx, 'bench_trendingcards').createIndex({ recentReviews: -1 });
    await collection(ctx, 'bench_trendingcards').createIndex({ mediaType: 1, score: -1 });
    ctx.note(`Card refresh cost including copy and index builds: ${(performance.now() - start).toFixed(3)} ms; ${rows.length} cards.`);
  },
  async sql(ctx) { await top(ctx); },
  async mongo(ctx) {
    for (const mediaType of ['MOVIE', 'BOOK', 'TV_SHOW']) {
      await collection(ctx, 'bench_trendingcards').find({ mediaType }).sort({ score: -1 }).limit(50).toArray();
    }
  },
  async teardown(ctx) {
    if (await collectionExists(ctx, 'bench_trendingcards')) await collection(ctx, 'bench_trendingcards').drop();
  },
} satisfies Scenario;
