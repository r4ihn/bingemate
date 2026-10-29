import { TitleStatus } from '@bingemate/shared';
import type { MediaType } from '@bingemate/shared';
import { db, ownerId } from '../mocks/db.js';
import type { TitleDetail } from '../types/title.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

export interface TitleQuery {
  q?: string;
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
    if (!useMock) notWired('titles API (JW)');
    await delay();
    const title = db.titles.find((t) => t.id === id);
    if (!title) throw new ApiError(404, 'Title not found');
    return clone({ ...title, createdById: ownerId(title) });
  },

  /** Public search: APPROVED titles only, name contains `q`, optional media type, one page. */
  async search({ q = '', type, page = 1, pageSize = 20 }: TitleQuery): Promise<TitlePage> {
    if (!useMock) notWired('titles search (JW)');
    await delay();
    const needle = q.trim().toLowerCase();
    const matches = db.titles
      .filter((t) => t.status === TitleStatus.APPROVED)
      .filter((t) => !type || t.mediaType === type)
      .filter((t) => !needle || t.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
    const start = (page - 1) * pageSize;
    return { items: clone(matches.slice(start, start + pageSize)), total: matches.length };
  },
};
