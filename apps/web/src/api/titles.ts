import { db } from '../mocks/db.js';
import type { TitleDetail } from '../types/title.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

export const titlesApi = {
  async get(id: string): Promise<TitleDetail> {
    if (!useMock) notWired('titles API (JW)');
    await delay();
    const title = db.titles.find((t) => t.id === id);
    if (!title) throw new ApiError(404, 'Title not found');
    return clone(title);
  },
};
