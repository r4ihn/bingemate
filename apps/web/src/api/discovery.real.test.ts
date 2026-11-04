import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaType, TitleStatus } from '@bingemate/shared';
import { genresApi } from './genres.js';
import { trendingApi } from './trending.js';
import { titlesApi } from './titles.js';

vi.mock('./mockMode.js', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useMock: false,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function respond(body: unknown) {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
describe('discovery real clients', () => {
  it('loads genre options with an optional type', async () => {
    const options = [{ id: 'g1', name: 'Drama', titleCount: 8 }];
    const fetchMock = respond(options);
    expect(await genresApi.list(MediaType.BOOK)).toEqual(options);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/genres?type=BOOK');
    await genresApi.list();
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/genres');
  });
  it('passes title genre and sort with pagination', async () => {
    const fetchMock = respond({ data: [], total: 0 });
    await titlesApi.search({ genre: 'Science Fiction', sort: 'year', page: 2 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://test');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      genre: 'Science Fiction',
      sort: 'year',
      page: '2',
      pageSize: '20',
    });
  });
  it('maps trending cards in order, resolves posters and sends all supported parameters', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.test/api');
    const fetchMock = respond({
      data: [
        {
          titleId: 't1',
          name: 'Trending',
          mediaType: MediaType.MOVIE,
          avgRating: 4.2,
          reviewCount: 12,
          recentReviews: 3,
          score: 9,
          posterUrl: '/api/titles/t1/poster',
        },
      ],
    });
    const result = await trendingApi.list({ type: MediaType.MOVIE, limit: 7, sort: 'recent' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/trending?type=MOVIE&limit=7&sort=recent');
    expect(result[0]).toMatchObject({
      id: 't1',
      name: 'Trending',
      avgRating: 4.2,
      reviewCount: 12,
      status: TitleStatus.APPROVED,
      posterUrl: 'https://api.test/api/titles/t1/poster',
    });
    await trendingApi.list();
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/trending');
  });
});
