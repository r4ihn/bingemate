import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client.js';
import { repliesApi, reviewsApi } from './reviews.js';
import { titlesApi } from './titles.js';

// Real mode: the only thing faked is fetch. Mock mode is switched off for this file alone.
vi.mock('./mockMode.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useMock: false,
}));

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const summary = {
  id: 't1',
  name: 'Dune',
  mediaType: MediaType.MOVIE,
  status: TitleStatus.APPROVED,
  avgRating: 4,
  reviewCount: 2,
};
const author = { id: 'u1', name: 'Ann', role: Role.CONSUMER };

describe('titlesApi (real)', () => {
  it('get calls GET /titles/:id with cookies and maps the detail', async () => {
    fetchMock.mockReturnValue(
      json({ ...summary, description: null, releaseYear: 2021, genres: [], people: [] }),
    );
    const t = await titlesApi.get('t1');
    const { url, init } = lastCall();
    expect(url).toBe('/api/titles/t1');
    expect(init.credentials).toBe('include');
    expect(init.method).toBeUndefined();
    expect(t).toMatchObject({ id: 't1', synopsis: '', year: 2021 });
  });

  it('get encodes the id into the path', async () => {
    fetchMock.mockReturnValue(json({ ...summary, description: 'x', releaseYear: null }));
    await titlesApi.get('a/b c');
    expect(lastCall().url).toBe('/api/titles/a%2Fb%20c');
  });

  it('get surfaces a 404 as ApiError', async () => {
    fetchMock.mockReturnValue(json({ message: 'Title not found' }, 404));
    await expect(titlesApi.get('nope')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Title not found',
    });
  });

  it('search sends q, type, page and pageSize and returns items and total', async () => {
    fetchMock.mockReturnValue(json({ data: [summary], page: 2, pageSize: 10, total: 31 }));
    const res = await titlesApi.search({
      q: ' dune ',
      type: MediaType.MOVIE,
      page: 2,
      pageSize: 10,
    });
    const { url, init } = lastCall();
    expect(url).toBe('/api/titles?q=dune&type=MOVIE&page=2&pageSize=10');
    expect(init.credentials).toBe('include');
    expect(res.total).toBe(31);
    expect(res.items).toEqual([{ ...summary, synopsis: '' }]);
  });

  it('search skips empty q and missing type, using the defaults for paging', async () => {
    fetchMock.mockReturnValue(json({ data: [], page: 1, pageSize: 20, total: 0 }));
    expect(await titlesApi.search({ q: '  ' })).toEqual({ items: [], total: 0 });
    expect(lastCall().url).toBe('/api/titles?page=1&pageSize=20');
  });

  it('search surfaces a 400 as ApiError', async () => {
    fetchMock.mockReturnValue(json({ message: 'Invalid query' }, 400));
    await expect(titlesApi.search({ q: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(titlesApi.search({ q: 'x' })).rejects.toBeInstanceOf(ApiError);
  });

  it('a network failure rejects with the fetch error and is not an ApiError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await titlesApi.get('t1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(ApiError);
  });
});

describe('reviewsApi.listByTitle (real)', () => {
  it('sends page and the web page size, and maps reviews', async () => {
    fetchMock.mockReturnValue(
      json({
        data: [
          {
            id: 'r1',
            titleId: 't1',
            author,
            rating: 5,
            body: 'Great',
            fields: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        page: 3,
        pageSize: 5,
        total: 11,
      }),
    );
    const res = await reviewsApi.listByTitle('t1', 3);
    const { url, init } = lastCall();
    expect(url).toBe('/api/titles/t1/reviews?page=3&pageSize=5');
    expect(init.credentials).toBe('include');
    expect(res).toMatchObject({ page: 3, pageSize: 5, total: 11 });
    expect(res.data[0]).toMatchObject({ id: 'r1', fields: {}, author });
  });

  it('surfaces a 404 as ApiError', async () => {
    fetchMock.mockReturnValue(json({ message: 'Title not found' }, 404));
    await expect(reviewsApi.listByTitle('x', 1)).rejects.toMatchObject({ status: 404 });
  });

  it('surfaces a 400 as ApiError', async () => {
    fetchMock.mockReturnValue(json({ message: 'Bad page' }, 400));
    await expect(reviewsApi.listByTitle('t1', 0)).rejects.toBeInstanceOf(ApiError);
  });

  it('a network failure rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(reviewsApi.listByTitle('t1', 1)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('repliesApi.list (real)', () => {
  it('requests up to 200 replies and unwraps data, keeping API order', async () => {
    fetchMock.mockReturnValue(
      json({
        data: [
          { id: 'p1', reviewId: 'r1', author, body: 'first', createdAt: '2026-01-01T00:00:00Z' },
          {
            id: 'p2',
            reviewId: 'r1',
            author,
            body: 'second',
            createdAt: '2026-01-02T00:00:00Z',
            editedAt: '2026-01-03T00:00:00Z',
          },
        ],
        page: 1,
        pageSize: 200,
        total: 2,
      }),
    );
    const res = await repliesApi.list('r1');
    const { url, init } = lastCall();
    expect(url).toBe('/api/reviews/r1/replies?pageSize=200');
    expect(init.credentials).toBe('include');
    expect(Array.isArray(res)).toBe(true);
    expect(res.map((r) => r.id)).toEqual(['p1', 'p2']);
    // flat replies: no threading fields, and editedAt only on the one that was changed
    expect(res.every((r) => !('parentId' in r) && !('isOfficial' in r))).toBe(true);
    expect(res.map((r) => r.editedAt)).toEqual([undefined, '2026-01-03T00:00:00Z']);
  });

  it('surfaces a 404 as ApiError', async () => {
    fetchMock.mockReturnValue(json({ message: 'Review not found' }, 404));
    await expect(repliesApi.list('x')).rejects.toMatchObject({ status: 404 });
  });

  it('surfaces a 400 as ApiError', async () => {
    fetchMock.mockReturnValue(json({ message: 'Bad id' }, 400));
    await expect(repliesApi.list('x')).rejects.toMatchObject({ status: 400 });
  });

  it('a network failure rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(repliesApi.list('r1')).rejects.toBeInstanceOf(TypeError);
  });
});

describe('methods that stay mock-only', () => {
  it('still refuse to run against the real API', async () => {
    await expect(reviewsApi.mine('t1')).rejects.toThrow(/not wired/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
