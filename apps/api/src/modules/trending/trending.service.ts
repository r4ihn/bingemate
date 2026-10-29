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
    .limit(limit)
    .lean();
  return {
    data: cards.map((c) => ({
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
