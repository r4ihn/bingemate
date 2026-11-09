import { TitleStatus } from '@bingemate/shared';
import type { MediaType, Paginated, TitleDetailDTO, TitleSummary } from '@bingemate/shared';
import { db, ownerId } from '../mocks/db.js';
import { mockCredits, mockPeople } from '../mocks/people.js';
import type { TitleDetail } from '../types/title.js';
import { ApiError, apiFetch } from './client.js';
import { detailToTitle, summaryToTitle } from './mappers.js';
import { clone, delay, useMock } from './mockMode.js';

/** The longest search text the API accepts. */
const MAX_QUERY_LENGTH = 100;

export const TITLE_SORTS = ['name', 'rating', 'year', 'reviews'] as const;
export type TitleSort = (typeof TITLE_SORTS)[number];

export interface TitleQuery {
  q?: string;
  genre?: string;
  sort?: TitleSort;
  type?: MediaType;
  page?: number;
  pageSize?: number;
}

export interface TitlePage {
  items: TitleDetail[];
  total: number;
}

export const titlesApi = {
  async get(id: string): Promise<TitleDetail> {
    if (!useMock) {
      return detailToTitle(await apiFetch<TitleDetailDTO>(`/titles/${encodeURIComponent(id)}`));
    }
    await delay();
    const title = db.titles.find((t) => t.id === id);
    if (!title) throw new ApiError(404, 'Title not found');
    const people = mockCredits
      .filter((c) => c.titleId === id)
      .map((c) => ({
        id: c.personId,
        name: mockPeople.find((p) => p.id === c.personId)?.name ?? c.personId,
        role: c.role,
      }));
    return clone({ ...title, createdById: ownerId(title), people });
  },

  /** Public search: APPROVED titles only, name contains `q`, optional media type, one page. */
  async search({
    q = '',
    type,
    genre,
    sort,
    page = 1,
    pageSize = 20,
  }: TitleQuery): Promise<TitlePage> {
    if (!useMock) {
      const params = new URLSearchParams();
      // The API answers 400 to a query over 100 characters, which no retry could fix.
      const needle = q.trim().slice(0, MAX_QUERY_LENGTH);
      if (needle) params.set('q', needle);
      if (type) params.set('type', type);
      if (genre) params.set('genre', genre);
      if (sort) params.set('sort', sort);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const res = await apiFetch<Paginated<TitleSummary>>(`/titles?${params}`);
      return { items: res.data.map(summaryToTitle), total: res.total };
    }
    await delay();
    const needle = q.trim().toLowerCase();
    const matches = db.titles
      .filter((t) => t.status === TitleStatus.APPROVED)
      .filter((t) => !type || t.mediaType === type)
      .filter((t) => !needle || t.name.toLowerCase().includes(needle))
      .filter((t) => !genre || t.genres?.some((g) => g.toLowerCase() === genre.toLowerCase()))
      .sort((a, b) => {
        const tie = a.id.localeCompare(b.id);
        switch (sort) {
          case 'rating':
            return b.avgRating - a.avgRating || b.reviewCount - a.reviewCount || tie;
          case 'year':
            return (b.year ?? -Infinity) - (a.year ?? -Infinity) || tie;
          case 'reviews':
            return b.reviewCount - a.reviewCount || tie;
          default:
            return a.name.localeCompare(b.name) || tie;
        }
      });
    const start = (page - 1) * pageSize;
    return { items: clone(matches.slice(start, start + pageSize)), total: matches.length };
  },
};
