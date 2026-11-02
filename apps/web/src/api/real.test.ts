import { ListStatus, MediaType, Role, TitleStatus } from '@bingemate/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setUnauthorizedHandler } from './client.js';
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

describe('listsApi (real)', () => {
  const entry = { id: 'l1', titleId: 't1', status: ListStatus.COMPLETED, title: summary };

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
