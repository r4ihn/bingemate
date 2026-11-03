import { type MediaType, type TrendingCardDTO } from '@bingemate/shared';
import { TitleStatus } from '@bingemate/shared';
import { db } from '../mocks/db.js';
import type { TitleDetail } from '../types/title.js';
import { apiFetch } from './client.js';
import { trendingToTitle } from './mappers.js';
import { clone, delay, useMock } from './mockMode.js';

export interface TrendingQuery {
  type?: MediaType;
  limit?: number;
  sort?: 'score' | 'recent';
}

export const trendingApi = {
  async list({ type, limit, sort }: TrendingQuery = {}): Promise<TitleDetail[]> {
    if (!useMock) {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (limit !== undefined) params.set('limit', String(limit));
      if (sort) params.set('sort', sort);
      const res = await apiFetch<{ data: TrendingCardDTO[] }>(
        `/trending${params.size ? `?${params}` : ''}`,
      );
      return res.data.map(trendingToTitle);
    }
    await delay();
    // Mock titles have no precomputed score or recent-review window; rating stands in for score.
    return clone(
      db.titles
        .filter((t) => t.status === TitleStatus.APPROVED && (!type || t.mediaType === type))
        .sort((a, b) => b.avgRating - a.avgRating || a.id.localeCompare(b.id))
        .slice(0, limit ?? 20),
    );
  },
};
