import {
  type CreatorTitleStatsDTO,
  ListStatus,
  MediaType,
  Role,
  TitleStatus,
} from '@bingemate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from './admin.js';
import { ApiError, setUnauthorizedHandler } from './client.js';
import { creatorApi } from './creator.js';
import { listsApi } from './lists.js';
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
  vi.unstubAllEnvs();
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

describe('creatorApi.stats (real)', () => {
  it('maps rows and keeps only approved titles', async () => {
    const approved: CreatorTitleStatsDTO = {
      titleId: 't1',
      name: 'Dune',
      status: TitleStatus.APPROVED,
      avgRating: 4.5,
      reviewCount: 8,
      listAdds: 13,
    };
    fetchMock.mockReturnValue(
      json([
        approved,
        { ...approved, titleId: 't2', status: TitleStatus.PENDING },
        { ...approved, titleId: 't3', status: TitleStatus.REJECTED },
      ]),
    );

    const result = await creatorApi.stats();

    expect(result).toEqual([
      { titleId: 't1', name: 'Dune', avgRating: 4.5, reviewCount: 8, listAdds: 13 },
    ]);
    expect(result[0]).not.toHaveProperty('status');
    expect(lastCall().url).toBe('/api/creator/stats');
    expect(lastCall().init.method).toBeUndefined();
    expect(lastCall().init.credentials).toBe('include');
  });

  it('an empty array gives an empty list', async () => {
    fetchMock.mockReturnValue(json([]));

    expect(await creatorApi.stats()).toEqual([]);
  });

  it('a 403 for a non-creator shows the server message', async () => {
    fetchMock.mockReturnValue(json({ error: 'Only creators can view stats' }, 403));

    await expect(creatorApi.stats()).rejects.toMatchObject({
      status: 403,
      message: 'Only creators can view stats',
    });
  });
});

describe('listsApi (real)', () => {
  const entry = { id: 'l1', titleId: 't1', status: ListStatus.COMPLETED, title: summary };

  it.each(['list', 'forTitle', 'add', 'setStatus'] as const)(
    '%s resolves poster URLs against the API host without mutating the response',
    async (method) => {
      vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
      const posterUrl = '/api/titles/t1/poster?v=1';
      const row = Object.freeze({ ...entry, title: Object.freeze({ ...summary, posterUrl }) });
      const page = { data: [row], page: 1, pageSize: 12, total: 1 };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => (method === 'list' ? page : row),
      });

      const result =
        method === 'list'
          ? (await listsApi.list({ page: 1 })).data[0]!
          : method === 'forTitle'
            ? (await listsApi.forTitle('t1'))!
            : method === 'add'
              ? await listsApi.add('t1', ListStatus.COMPLETED)
              : await listsApi.setStatus('l1', ListStatus.COMPLETED);

      expect(result.title.posterUrl).toBe('https://api.example.com/api/titles/t1/poster?v=1');
      expect(result).not.toBe(row);
      expect(result.title).not.toBe(row.title);
      expect(row.title.posterUrl).toBe(posterUrl);
    },
  );

  it('list sends only the filters that are set', async () => {
    fetchMock.mockReturnValueOnce(json({ data: [], page: 2, pageSize: 12, total: 0 }));

    await listsApi.list({ page: 2 });

    expect(lastCall().url).toBe('/api/me/lists?page=2&pageSize=12');
    expect(lastCall().init.method).toBeUndefined();
    expect(lastCall().init.credentials).toBe('include');

    fetchMock.mockReturnValueOnce(json({ data: [], page: 1, pageSize: 12, total: 0 }));

    await listsApi.list({ status: ListStatus.PLAN_TO, mediaType: MediaType.BOOK, page: 1 });

    const url = new URL(lastCall().url, 'http://x');
    expect(url.pathname).toBe('/api/me/lists');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'PLAN_TO',
      mediaType: 'BOOK',
      page: '1',
      pageSize: '12',
    });
  });

  it('list returns the page as sent', async () => {
    const page = { data: [entry], page: 2, pageSize: 12, total: 31 };
    fetchMock.mockReturnValue(json(page));

    expect(await listsApi.list({ page: 2 })).toEqual(page);
  });

  it('forTitle returns null when the title is not on the list', async () => {
    fetchMock.mockReturnValue(json(null));

    expect(await listsApi.forTitle('a/b c')).toBeNull();
    expect(lastCall().url).toBe('/api/me/lists/by-title/a%2Fb%20c');
    expect(lastCall().init.method).toBeUndefined();
    expect(lastCall().init.credentials).toBe('include');
  });

  it('forTitle returns the entry as sent', async () => {
    fetchMock.mockReturnValue(json(entry));

    expect(await listsApi.forTitle('t1')).toEqual(entry);
    expect(lastCall().url).toBe('/api/me/lists/by-title/t1');
  });

  it('add posts titleId and status', async () => {
    fetchMock.mockReturnValue(json(entry, 201));

    expect(await listsApi.add('t1', ListStatus.COMPLETED)).toEqual(entry);

    const { url, init } = lastCall();
    expect(url).toBe('/api/me/lists');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ titleId: 't1', status: 'COMPLETED' });
  });

  it("a second add shows the server's 409 message", async () => {
    fetchMock.mockReturnValue(json({ error: 'This title is already on your list' }, 409));

    await expect(listsApi.add('t1', ListStatus.COMPLETED)).rejects.toMatchObject({
      status: 409,
      message: 'This title is already on your list',
    });
  });

  it('setStatus patches only the status', async () => {
    const updated = { ...entry, status: ListStatus.PLAN_TO };
    fetchMock.mockReturnValue(json(updated));

    expect(await listsApi.setStatus('l/1 c', ListStatus.PLAN_TO)).toEqual(updated);

    const { url, init } = lastCall();
    expect(url).toBe('/api/me/lists/l%2F1%20c');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'PLAN_TO' });
  });

  it('remove sends DELETE and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(listsApi.remove('l/1 c')).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(url).toBe('/api/me/lists/l%2F1%20c');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });
});

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

  it('search cuts the text to the 100 characters the API accepts', async () => {
    fetchMock.mockReturnValue(json({ data: [], page: 1, pageSize: 20, total: 0 }));

    await titlesApi.search({ q: `  ${'a'.repeat(130)}  ` });

    expect(new URL(lastCall().url, 'http://x').searchParams.get('q')).toBe('a'.repeat(100));
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
    expect(res.data[0]).toMatchObject({ id: 'r1', author });
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

describe('reviewsApi writes (real)', () => {
  const review = {
    id: 'r1',
    titleId: 't1',
    author,
    rating: 5,
    body: 'Loved it',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('mine returns null when the user has no review', async () => {
    fetchMock.mockReturnValue(json(null));

    expect(await reviewsApi.mine('t1')).toBeNull();
    expect(lastCall().url).toBe('/api/titles/t1/reviews/mine');
    expect(lastCall().init.credentials).toBe('include');
    expect(lastCall().init.method).toBeUndefined();
  });

  it('mine maps the review and encodes the title id', async () => {
    fetchMock.mockReturnValue(json({ ...review, fields: { legacy: 'ignored' } }));

    const result = await reviewsApi.mine('a/b c');

    expect(result).toEqual(review);
    expect(result).not.toHaveProperty('fields');
    expect(lastCall().url).toBe('/api/titles/a%2Fb%20c/reviews/mine');
  });

  it('create posts only rating and body', async () => {
    fetchMock.mockReturnValue(json({ ...review, fields: {} }, 201));
    const input = { rating: 5, body: 'Loved it', fields: { legacy: 'ignored' } };

    expect(await reviewsApi.create('a/b c', input)).toEqual(review);

    const { url, init } = lastCall();
    expect(url).toBe('/api/titles/a%2Fb%20c/reviews');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ rating: 5, body: 'Loved it' });
  });

  it.each([
    ['r1', '/api/reviews/r1'],
    ['r/1 c', '/api/reviews/r%2F1%20c'],
  ])('update patches the review %s', async (id, path) => {
    const updated = { ...review, rating: 4, body: 'Still good' };
    fetchMock.mockReturnValue(json({ ...updated, fields: {} }));
    const input = { rating: 4, body: 'Still good', fields: { legacy: 'ignored' } };

    expect(await reviewsApi.update(id, input)).toEqual(updated);

    const { url, init } = lastCall();
    expect(url).toBe(path);
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ rating: 4, body: 'Still good' });
  });

  it('remove sends DELETE and resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(reviewsApi.remove('r/1 c')).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(url).toBe('/api/reviews/r%2F1%20c');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('a 409 on create carries the server message', async () => {
    fetchMock.mockReturnValue(json({ error: 'You have already reviewed this title' }, 409));

    await expect(reviewsApi.create('t1', { rating: 5, body: 'Loved it' })).rejects.toMatchObject({
      status: 409,
      message: 'You have already reviewed this title',
    });
  });

  it('an admin review attempt carries the server message', async () => {
    fetchMock.mockReturnValue(json({ error: 'Admins cannot write reviews or replies' }, 403));

    await expect(reviewsApi.create('t1', { rating: 5, body: 'Loved it' })).rejects.toMatchObject({
      status: 403,
      message: 'Admins cannot write reviews or replies',
    });
  });

  it('a 401 on create calls the unauthorized handler', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    fetchMock.mockReturnValue(json({ error: 'Unauthorized' }, 401));

    try {
      await expect(reviewsApi.create('t1', { rating: 5, body: 'Loved it' })).rejects.toMatchObject({
        status: 401,
        message: 'Unauthorized',
      });
      expect(unauthorized).toHaveBeenCalledTimes(1);
    } finally {
      setUnauthorizedHandler(null);
    }
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
    expect(url).toBe('/api/reviews/r1/replies?page=1&pageSize=200');
    expect(init.credentials).toBe('include');
    expect(Array.isArray(res)).toBe(true);
    expect(res.map((r) => r.id)).toEqual(['p1', 'p2']);
    // flat replies: no threading fields, and editedAt only on the one that was changed
    expect(res.every((r) => !('parentId' in r) && !('isOfficial' in r))).toBe(true);
    expect(res.map((r) => r.editedAt)).toEqual([undefined, '2026-01-03T00:00:00Z']);
  });

  it('keeps asking for pages until every reply is in', async () => {
    const reply = (n: number) => ({
      id: `p${n}`,
      reviewId: 'r1',
      author,
      body: `reply ${n}`,
      createdAt: '2026-01-01T00:00:00Z',
    });
    fetchMock
      .mockReturnValueOnce(
        json({
          data: Array.from({ length: 200 }, (_, i) => reply(i)),
          page: 1,
          pageSize: 200,
          total: 250,
        }),
      )
      .mockReturnValueOnce(
        json({
          data: Array.from({ length: 50 }, (_, i) => reply(200 + i)),
          page: 2,
          pageSize: 200,
          total: 250,
        }),
      );

    const res = await repliesApi.list('r1');

    expect(res).toHaveLength(250);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/reviews/r1/replies?page=1&pageSize=200',
      '/api/reviews/r1/replies?page=2&pageSize=200',
    ]);
    expect(res[0]?.id).toBe('p0');
    expect(res[249]?.id).toBe('p249');
  });

  it('stops at an empty page even if the total says more', async () => {
    fetchMock.mockReturnValueOnce(json({ data: [], page: 1, pageSize: 200, total: 5 }));

    expect(await repliesApi.list('r1')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

describe('repliesApi writes (real)', () => {
  const reply = {
    id: 'p1',
    reviewId: 'r1',
    author,
    body: 'hi',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it.each([
    ['r1', '/api/reviews/r1/replies'],
    ['r/1 c', '/api/reviews/r%2F1%20c/replies'],
  ])('create posts the text and maps the reply for %s', async (reviewId, path) => {
    fetchMock.mockReturnValue(json({ ...reply, parentId: 'ignored', isOfficial: true }, 201));

    expect(await repliesApi.create(reviewId, 'hi')).toEqual(reply);

    const { url, init } = lastCall();
    expect(url).toBe(path);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ body: 'hi' });
  });

  it('update patches the text', async () => {
    const updated = { ...reply, body: 'edited', editedAt: '2026-01-02T00:00:00.000Z' };
    fetchMock.mockReturnValue(json(updated));

    expect(await repliesApi.update('p/1', 'edited')).toEqual(updated);

    const { url, init } = lastCall();
    expect(url).toBe('/api/replies/p%2F1');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ body: 'edited' });
  });

  it('remove sends DELETE and resolves undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(repliesApi.remove('p/1 c')).resolves.toBeUndefined();

    const { url, init } = lastCall();
    expect(url).toBe('/api/replies/p%2F1%20c');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it("an admin reply attempt shows the server's 403 message", async () => {
    fetchMock.mockReturnValue(json({ error: 'Admins cannot write reviews or replies' }, 403));

    await expect(repliesApi.create('r1', 'hi')).rejects.toMatchObject({
      status: 403,
      message: 'Admins cannot write reviews or replies',
    });
  });
});

describe('creatorApi submissions (real)', () => {
  const dto = {
    ...summary,
    status: TitleStatus.PENDING,
    description: 'Sand.',
    rejectionReason: null,
  };
  const input = { name: 'Dune', mediaType: MediaType.MOVIE, synopsis: 'Sand.' };

  it.each(['submit', 'update'] as const)('%s resolves the uploaded poster URL', async (method) => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    fetchMock
      .mockReturnValueOnce(json(dto))
      .mockReturnValueOnce(json({ posterUrl: '/api/titles/t1/poster?v=1' }));
    const withPoster = { ...input, poster: new Blob(['image'], { type: 'image/png' }) };

    const result =
      method === 'submit'
        ? await creatorApi.submit(withPoster)
        : await creatorApi.update('t1', withPoster);

    expect(result.title.posterUrl).toBe('https://api.example.com/api/titles/t1/poster?v=1');
  });

  it('submissions maps rows and the rejection reason', async () => {
    fetchMock.mockReturnValueOnce(
      json([
        dto,
        {
          ...dto,
          id: 't2',
          description: null,
          rejectionReason: 'Fix it',
          status: TitleStatus.REJECTED,
        },
      ]),
    );
    expect(await creatorApi.submissions()).toEqual([
      {
        title: { ...summary, status: TitleStatus.PENDING, synopsis: 'Sand.' },
        rejectionReason: undefined,
      },
      {
        title: { ...summary, id: 't2', status: TitleStatus.REJECTED, synopsis: '' },
        rejectionReason: 'Fix it',
      },
    ]);
    expect(lastCall().url).toBe('/api/creator/titles');
    expect(lastCall().init.method).toBeUndefined();
    expect(lastCall().init.credentials).toBe('include');
  });

  it('submit posts the title, then puts the image as the raw file', async () => {
    const poster = new Blob(['image'], { type: 'image/webp' });
    fetchMock
      .mockReturnValueOnce(json({ ...dto, id: 'a/b c' }, 201))
      .mockReturnValueOnce(json({ posterUrl: '/new.webp' }));
    const result = await creatorApi.submit({ ...input, poster });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/titles');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Dune',
      mediaType: 'MOVIE',
      description: 'Sand.',
    });
    expect(lastCall().url).toBe('/api/titles/a%2Fb%20c/poster');
    expect(lastCall().init.method).toBe('PUT');
    expect(lastCall().init.credentials).toBe('include');
    expect(lastCall().init.body).toBe(poster);
    expect(lastCall().init.headers).toEqual({ 'Content-Type': 'image/webp' });
    expect(result.title).toMatchObject({ id: 'a/b c', synopsis: 'Sand.', posterUrl: '/new.webp' });
  });

  it('submit without an image makes one call', async () => {
    fetchMock.mockReturnValueOnce(json(dto, 201));
    expect(await creatorApi.submit(input)).toMatchObject({
      title: { id: 't1', synopsis: 'Sand.' },
      rejectionReason: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('submit tells the user the title exists when only the image fails', async () => {
    fetchMock
      .mockReturnValueOnce(json(dto, 201))
      .mockReturnValueOnce(json({ error: 'Use a JPEG, PNG or WebP image' }, 415));
    const error: unknown = await creatorApi
      .submit({ ...input, poster: new Blob(['bad'], { type: 'image/gif' }) })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 415, message: expect.stringContaining('saved') });
    expect(error).toMatchObject({
      message: expect.stringContaining('Use a JPEG, PNG or WebP image'),
    });
  });

  it.each([
    [{ name: 'Edited', mediaType: MediaType.BOOK, synopsis: undefined }, { name: 'Edited' }],
    [{ name: undefined, synopsis: '' }, { description: '' }],
    [
      { name: 'Edited', synopsis: 'New.' },
      { name: 'Edited', description: 'New.' },
    ],
  ])('update sends only what changed and never mediaType: %j', async (changes, body) => {
    fetchMock.mockReturnValueOnce(
      json({ ...dto, name: 'Server name', description: 'Server description' }),
    );
    const result = await creatorApi.update('a/b c', changes);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastCall().url).toBe('/api/titles/a%2Fb%20c');
    expect(lastCall().init.method).toBe('PATCH');
    expect(lastCall().init.credentials).toBe('include');
    expect(JSON.parse(lastCall().init.body as string)).toEqual(body);
    expect(result.title).toMatchObject({ name: 'Server name', synopsis: 'Server description' });
  });

  it('update with removePoster sends DELETE', async () => {
    fetchMock
      .mockReturnValueOnce(json({ ...dto, posterUrl: '/old.jpg' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await creatorApi.update('a/b c', { name: 'Edited', removePoster: true });
    expect(fetchMock.mock.calls.map((c) => [c[0], c[1].method])).toEqual([
      ['/api/titles/a%2Fb%20c', 'PATCH'],
      ['/api/titles/a%2Fb%20c/poster', 'DELETE'],
    ]);
    expect(lastCall().init.body).toBeUndefined();
    expect(result.title.posterUrl).toBeUndefined();
  });

  it.each(['put', 'delete'])(
    'an image-only update skips PATCH, changes the image, then reads its own title: %s',
    async (action) => {
      const poster = new Blob(['new'], { type: 'image/png' });
      if (action === 'put') fetchMock.mockReturnValueOnce(json({ posterUrl: '/new.png' }));
      else fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      // Read after the image change, so a title sent back to PENDING shows as PENDING.
      fetchMock.mockReturnValueOnce(
        json([
          { ...dto, id: 'other' },
          { ...dto, id: 'a/b c', status: TitleStatus.PENDING, posterUrl: '/old.jpg' },
        ]),
      );
      const result = await creatorApi.update('a/b c', {
        name: undefined,
        synopsis: undefined,
        mediaType: MediaType.BOOK,
        ...(action === 'put' ? { poster } : { removePoster: true }),
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/titles/a%2Fb%20c/poster');
      expect(fetchMock.mock.calls[0]?.[1].method).toBe(action === 'put' ? 'PUT' : 'DELETE');
      if (action === 'put') {
        expect(fetchMock.mock.calls[0]?.[1].body).toBe(poster);
        expect(fetchMock.mock.calls[0]?.[1].headers).toEqual({ 'Content-Type': 'image/png' });
      }
      expect(lastCall().url).toBe('/api/creator/titles');
      expect(lastCall().init.method).toBeUndefined();
      expect(result.title.id).toBe('a/b c');
      expect(result.title.status).toBe(TitleStatus.PENDING);
      expect(result.title.posterUrl).toBe(action === 'put' ? '/new.png' : undefined);
    },
  );

  it('an image-only update reports a missing own title', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockReturnValueOnce(json([]));
    await expect(creatorApi.update('missing', { removePoster: true })).rejects.toMatchObject({
      status: 404,
      message: 'Title not found',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a failed image after a saved edit says the edit was saved', async () => {
    fetchMock
      .mockReturnValueOnce(json({ ...dto, name: 'Edited' }))
      .mockReturnValueOnce(json({ error: 'Image too large' }, 413));
    const poster = new Blob(['big'], { type: 'image/png' });
    await expect(creatorApi.update('a/b c', { name: 'Edited', poster })).rejects.toMatchObject({
      status: 413,
      message: expect.stringContaining('Your changes were saved'),
    });
  });

  it('a failed image-only update keeps the server message', async () => {
    fetchMock.mockReturnValueOnce(json({ error: 'Image too large' }, 413));
    const poster = new Blob(['big'], { type: 'image/png' });
    await expect(creatorApi.update('a/b c', { poster })).rejects.toMatchObject({
      status: 413,
      message: 'Image too large',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['submissions', 'submit', 'update'] as const)(
    'a 403 shows the server message for %s',
    async (method) => {
      fetchMock.mockReturnValueOnce(json({ error: 'Only creators can edit titles' }, 403));
      const request =
        method === 'submissions'
          ? creatorApi.submissions()
          : method === 'submit'
            ? creatorApi.submit(input)
            : creatorApi.update('t1', { name: 'Edited' });
      await expect(request).rejects.toMatchObject({
        name: 'ApiError',
        status: 403,
        message: 'Only creators can edit titles',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});


describe('adminApi title queue (real)', () => {
  const dto = {
    ...summary,
    status: TitleStatus.PENDING,
    description: 'Sand.',
    rejectionReason: null,
    updatedAt: '2026-11-02T00:00:00.000Z',
  };

  it('pendingTitles reads every page so no pending title is left out', async () => {
    const page1 = Array.from({ length: 50 }, (_, n) => ({ ...dto, id: `p${n}` }));
    fetchMock
      .mockReturnValueOnce(json({ data: page1, page: 1, pageSize: 50, total: 51 }))
      .mockReturnValueOnce(json({ data: [{ ...dto, id: 'p50' }], page: 2, pageSize: 50, total: 51 }));
    const titles = await adminApi.pendingTitles();
    expect(titles).toHaveLength(51);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/admin/titles?status=PENDING&pageSize=50&page=1',
      '/api/admin/titles?status=PENDING&pageSize=50&page=2',
    ]);
  });

  it('pendingTitles asks for PENDING with pageSize 50 and maps rows', async () => {
    fetchMock.mockReturnValueOnce(
      json({ data: [dto, { ...dto, id: 't2', description: null }], page: 1, pageSize: 50, total: 2 }),
    );
    expect(await adminApi.pendingTitles()).toEqual([
      { ...summary, status: TitleStatus.PENDING, synopsis: 'Sand.', version: dto.updatedAt },
      { ...summary, id: 't2', status: TitleStatus.PENDING, synopsis: '', version: dto.updatedAt },
    ]);
    expect(lastCall().url).toBe('/api/admin/titles?status=PENDING&pageSize=50&page=1');
    expect(lastCall().init.method).toBeUndefined();
    expect(lastCall().init.credentials).toBe('include');
  });

  it('setTitleStatus patches status and reason', async () => {
    fetchMock.mockReturnValueOnce(
      json({ ...dto, status: TitleStatus.REJECTED, rejectionReason: 'Fix it' }),
    );
    await expect(
      adminApi.setTitleStatus('a/b c', TitleStatus.REJECTED, 'Fix it', dto.updatedAt),
    ).resolves.toBeUndefined();
    expect(lastCall().url).toBe('/api/admin/titles/a%2Fb%20c/status');
    expect(lastCall().init.method).toBe('PATCH');
    expect(lastCall().init.credentials).toBe('include');
    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      status: 'REJECTED',
      updatedAt: dto.updatedAt,
      rejectionReason: 'Fix it',
    });
  });

  it('setTitleStatus omits the rejectionReason key when no reason is given', async () => {
    fetchMock.mockReturnValueOnce(json({ ...dto, status: TitleStatus.APPROVED }));
    await expect(adminApi.setTitleStatus('t1', TitleStatus.APPROVED, undefined, dto.updatedAt)).resolves.toBeUndefined();
    expect(lastCall().url).toBe('/api/admin/titles/t1/status');
    expect(lastCall().init.method).toBe('PATCH');
    const body = JSON.parse(lastCall().init.body as string);
    expect(body).toEqual({ status: 'APPROVED', updatedAt: dto.updatedAt });
    expect(body).not.toHaveProperty('rejectionReason');
  });
  it('setTitleStatus without a version throws without making a request', async () => {
    const error: unknown = await adminApi
      .setTitleStatus('t1', TitleStatus.APPROVED)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Reload the queue and try again.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('setTitleStatus surfaces a 409 with the server message', async () => {
    const message = 'This title changed after you opened it. Reload the queue and review it again.';
    fetchMock.mockReturnValueOnce(json({ error: message }, 409));
    const error: unknown = await adminApi
      .setTitleStatus('t1', TitleStatus.APPROVED, undefined, dto.updatedAt)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

