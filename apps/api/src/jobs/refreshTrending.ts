import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { TrendingCard } from '../mongo/models/trendingCard.model.js';

/** How many cards are kept per media type. */
export const TRENDING_PER_TYPE = 50;

interface TrendingRow {
  id: string;
  name: string;
  mediaType: string;
  review_count: number | bigint;
  avg_rating: number | string;
  trending_score: number | string;
}

export interface RefreshResult {
  /** Cards written (created or refreshed). */
  upserted: number;
  /** Cards deleted because their title left the top set. */
  removed: number;
}

/**
 * Rebuilds the denormalised trending cards in MongoDB from the `trending_titles` view:
 * the top 50 per media type are upserted by title id, and any card whose title is not in that
 * set any more is deleted. Running it twice in a row leaves the same cards behind.
 * The view has no poster, so the posters are looked up from Title in one extra query.
 */
export async function refreshTrending(): Promise<RefreshResult> {
  const rows = await prisma.$queryRaw<TrendingRow[]>(
    Prisma.sql`SELECT "id", "name", "mediaType", "review_count", "avg_rating", "trending_score"
      FROM (
        SELECT v.*, ROW_NUMBER() OVER (
          PARTITION BY v."mediaType" ORDER BY v."trending_score" DESC, v."id" ASC
        ) AS "rank"
        FROM "trending_titles" v
      ) ranked
      WHERE "rank" <= ${TRENDING_PER_TYPE}`,
  );
  const ids = rows.map((r) => r.id);

  const posters = new Map<string, string | null>();
  if (ids.length > 0) {
    const titles = await prisma.title.findMany({
      where: { id: { in: ids } },
      select: { id: true, posterUrl: true },
    });
    for (const t of titles) posters.set(t.id, t.posterUrl);
  }

  if (rows.length > 0) {
    await TrendingCard.bulkWrite(
      rows.map((r) => {
        const posterUrl = posters.get(r.id);
        return {
          updateOne: {
            filter: { titleId: r.id },
            update: {
              $set: {
                name: r.name,
                mediaType: r.mediaType,
                avgRating: Number(r.avg_rating),
                reviewCount: Number(r.review_count),
                score: Number(r.trending_score),
                ...(posterUrl ? { posterUrl } : {}),
              },
              ...(posterUrl ? {} : { $unset: { posterUrl: '' } }),
            },
            upsert: true,
          },
        };
      }),
    );
  }

  const stale = await TrendingCard.deleteMany({ titleId: { $nin: ids } });
  return { upserted: rows.length, removed: stale.deletedCount };
}

/** `tsx src/jobs/refreshTrending.ts` runs the job once; importing this file does not. */
async function runAsScript(): Promise<void> {
  const { connectMongo, disconnectMongo } = await import('../db/mongo.js');
  try {
    await connectMongo();
    const result = await refreshTrending();
    console.log(`Trending refreshed: ${result.upserted} upserted, ${result.removed} removed`);
  } finally {
    await disconnectMongo();
    await prisma.$disconnect();
  }
}

/** True only when this file is the script being run. Any trouble resolving the paths means it is not. */
function isRunDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  runAsScript().catch((err) => {
    console.error('refreshTrending failed:', err);
    process.exit(1);
  });
}
