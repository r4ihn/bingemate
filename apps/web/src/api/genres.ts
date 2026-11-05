import { TitleStatus, type GenreOptionDTO, type MediaType } from '@bingemate/shared';
import { db } from '../mocks/db.js';
import { apiFetch } from './client.js';
import { clone, delay, useMock } from './mockMode.js';

export const genresApi = {
  async list(type?: MediaType): Promise<GenreOptionDTO[]> {
    if (!useMock) {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      return apiFetch<GenreOptionDTO[]>(`/genres${params.size ? `?${params}` : ''}`);
    }
    await delay();
    const options = new Map<string, GenreOptionDTO>();
    for (const title of db.titles) {
      if (title.status !== TitleStatus.APPROVED || (type && title.mediaType !== type)) continue;
      for (const name of new Set(title.genres ?? [])) {
        const id = name.toLowerCase();
        const option = options.get(id);
        if (option) option.titleCount += 1;
        else options.set(id, { id, name, titleCount: 1 });
      }
    }
    return clone(
      [...options.values()].sort(
        (a, b) => b.titleCount - a.titleCount || a.name.localeCompare(b.name),
      ),
    );
  },
};
