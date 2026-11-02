import { prisma } from '../../db/prisma.js';
import type { TrendingCardDTO } from '@bingemate/shared';
import { TrendingCard } from '../../mongo/models/trendingCard.model.js';
import type { TrendingQuery } from './trending.schema.js';

/**
 * Reads the cards jobs/refreshTrending.ts keeps in MongoDB. Best score first; the title id breaks
 * ties so the order never wobbles between calls.
 */
export async function listTrending({
  type,
  limit,
}: TrendingQuery): Promise<{ data: TrendingCardDTO[] }> {
  const cards = await TrendingCard.find(type ? { mediaType: type } : {})
    .sort({ score: -1, titleId: 1 })
    .limit(150)
    .lean();
  const titles = cards.length ? await prisma.title.findMany({
    where: { id: { in: cards.map((c) => c.titleId) }, status: 'APPROVED' },
    select: { id: true },
  }) : [];
  const approved = new Set(titles.map((t) => t.id));
  return {
    data: cards.filter((c) => approved.has(c.titleId)).slice(0, limit).map((c) => ({
      titleId: c.titleId,
      name: c.name,
      mediaType: c.mediaType as TrendingCardDTO['mediaType'],
      ...(c.posterUrl ? { posterUrl: c.posterUrl } : {}),
      avgRating: c.avgRating,
      reviewCount: c.reviewCount,
      score: c.score,
    })),
  };
}
