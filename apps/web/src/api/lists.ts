import type { ListStatus, Paginated } from '@bingemate/shared';
import { db } from '../mocks/db.js';
import type { ListItem, ListQuery } from '../types/list.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

const PAGE_SIZE = 12;

export const listsApi = {
  async list(q: ListQuery): Promise<Paginated<ListItem>> {
    if (!useMock) notWired('/me/lists (JW)');
    await delay();
    const all = db.lists.filter(
      (e) =>
        (!q.status || e.status === q.status) && (!q.mediaType || e.title.mediaType === q.mediaType),
    );
    const start = (q.page - 1) * PAGE_SIZE;
    return clone({
      data: all.slice(start, start + PAGE_SIZE),
      page: q.page,
      pageSize: PAGE_SIZE,
      total: all.length,
    });
  },

  async setStatus(entryId: string, status: ListStatus): Promise<ListItem> {
    if (!useMock) notWired('/me/lists (JW)');
    await delay();
    const entry = db.lists.find((e) => e.id === entryId);
    if (!entry) throw new ApiError(404, 'List entry not found');
    entry.status = status;
    return clone(entry);
  },

  async remove(entryId: string): Promise<void> {
    if (!useMock) notWired('/me/lists (JW)');
    await delay();
    db.lists = db.lists.filter((e) => e.id !== entryId);
  },
};
