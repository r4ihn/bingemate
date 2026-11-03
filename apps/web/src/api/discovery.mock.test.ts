import { beforeEach, describe, expect, it } from 'vitest';
import { MediaType, TitleStatus } from '@bingemate/shared';
import { db, resetDb } from '../mocks/db.js';
import { genresApi } from './genres.js';
import { trendingApi } from './trending.js';
import { titlesApi } from './titles.js';

beforeEach(resetDb);
describe('discovery mock parity', () => {
  it('counts approved genres by type, most titles first, with independent results', async () => {
    db.titles = [
      { ...db.titles[0]!, id: 'a', mediaType: MediaType.MOVIE, genres: ['Drama', 'Action'] },
      { ...db.titles[0]!, id: 'b', mediaType: MediaType.BOOK, genres: ['Drama'] },
      { ...db.titles[0]!, id: 'c', genres: ['Hidden'], status: TitleStatus.PENDING },
    ];
    const all = await genresApi.list();
    expect(all.map(({ name, titleCount }) => ({ name, titleCount }))).toEqual([
      { name: 'Drama', titleCount: 2 },
      { name: 'Action', titleCount: 1 },
    ]);
    expect((await genresApi.list(MediaType.BOOK)).map((g) => g.name)).toEqual(['Drama']);
    expect(await titlesApi.search({ genre: 'dRaMa' })).toMatchObject({ total: 2 });
    all[0]!.name = 'Changed';
    expect((await genresApi.list())[0]!.name).toBe('Drama');
  });
  it.each(['name', 'rating', 'year', 'reviews'] as const)(
    'sorts %s before paginating',
    async (sort) => {
      db.titles = [
        { ...db.titles[0]!, id: 'a', name: 'Alpha', avgRating: 3, year: 2020, reviewCount: 30 },
        { ...db.titles[0]!, id: 'b', name: 'Beta', avgRating: 5, year: 2010, reviewCount: 10 },
        { ...db.titles[0]!, id: 'c', name: 'Gamma', avgRating: 4, year: 2025, reviewCount: 20 },
      ];
      const expected = {
        name: ['a', 'b', 'c'],
        rating: ['b', 'c', 'a'],
        year: ['c', 'a', 'b'],
        reviews: ['a', 'c', 'b'],
      };
      const result = await titlesApi.search({ sort, pageSize: 2 });
      expect(result.items.map((t) => t.id)).toEqual(expected[sort].slice(0, 2));
      expect(result.total).toBe(3);
    },
  );
  it('derives trending from approved titles by rating and supports type and limit', async () => {
    const expected = db.titles
      .filter((t) => t.status === TitleStatus.APPROVED && t.mediaType === MediaType.MOVIE)
      .sort((a, b) => b.avgRating - a.avgRating || a.id.localeCompare(b.id))
      .slice(0, 3);
    const result = await trendingApi.list({ type: MediaType.MOVIE, limit: 3, sort: 'score' });
    expect(result.map((t) => t.id)).toEqual(expected.map((t) => t.id));
    result[0]!.name = 'Changed';
    expect(expected[0]!.name).not.toBe('Changed');
  });
});
