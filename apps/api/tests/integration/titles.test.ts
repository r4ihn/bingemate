import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No database in CI: Prisma is replaced, and the tests check what the module asks it for.
const findMany = vi.fn();
const count = vi.fn();
const findFirst = vi.fn();
vi.mock('../../src/db/prisma.js', () => ({
  prisma: {
    title: { findMany, count, findFirst },
    $transaction: (queries: unknown[]) => Promise.all(queries),
  },
}));

const { createApp } = await import('../../src/app.js');
const app = createApp();

/** The query a mock was first called with; fails loudly if it never was. */
const firstArgs = (fn: typeof findMany) => {
  const call = fn.mock.calls[0];
  if (!call) throw new Error('expected a Prisma call, got none');
  return call[0];
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Inception',
  mediaType: 'MOVIE',
  status: 'APPROVED',
  avgRating: 4.5,
  reviewCount: 3,
  posterUrl: null,
  createdById: null,
  ...over,
});

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([row()]);
  count.mockReset().mockResolvedValue(1);
  findFirst.mockReset();
});

describe('GET /api/titles', () => {
  it('returns a page with the total, and maps rows to summaries', async () => {
    findMany.mockResolvedValue([
      row({ posterUrl: 'http://x/p.jpg', createdById: 'u-1' }),
      row({ id: 't2' }),
    ]);
    count.mockResolvedValue(41);

    const res = await request(app).get('/api/titles?page=2&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 41 });
    expect(res.body.data[0]).toMatchObject({
      id: 't1',
      posterUrl: 'http://x/p.jpg',
      createdById: 'u-1',
    });
    expect(res.body.data[1]).not.toHaveProperty('posterUrl');
    expect(firstArgs(findMany)).toMatchObject({ skip: 2, take: 2 });
  });

  it('only ever asks for APPROVED titles, with or without filters', async () => {
    await request(app).get('/api/titles');
    await request(app).get('/api/titles?q=dune&type=BOOK&genre=Drama&minRating=3&year=1999');

    for (const [args] of findMany.mock.calls) expect(args.where.status).toBe('APPROVED');
    for (const [args] of count.mock.calls) expect(args.where.status).toBe('APPROVED');
  });

  it('turns each filter into the matching condition', async () => {
    await request(app).get(
      '/api/titles?q=%20dune%20&type=BOOK&genre=Drama&minRating=3.5&year=1965',
    );

    const { where } = firstArgs(findMany);
    expect(where).toMatchObject({
      mediaType: 'BOOK',
      name: { contains: 'dune', mode: 'insensitive' },
      avgRating: { gte: 3.5 },
      releaseYear: 1965,
      genres: { some: { genre: { name: { equals: 'Drama', mode: 'insensitive' } } } },
    });
  });

  it('treats empty filter values as not given', async () => {
    const res = await request(app).get('/api/titles?q=&type=&genre=&minRating=&year=&sort=');

    expect(res.status).toBe(200);
    expect(firstArgs(findMany).where).toEqual({ status: 'APPROVED' });
  });

  it.each([
    ['name', [{ name: 'asc' }, { id: 'asc' }]],
    ['rating', [{ avgRating: 'desc' }, { reviewCount: 'desc' }, { id: 'asc' }]],
    ['reviews', [{ reviewCount: 'desc' }, { id: 'asc' }]],
  ])('sorts by %s and ends on id so pages stay stable', async (sort, orderBy) => {
    await request(app).get(`/api/titles?sort=${sort}`);

    expect(firstArgs(findMany).orderBy).toEqual(orderBy);
  });

  it('puts titles without a year last when sorting by year', async () => {
    await request(app).get('/api/titles?sort=year');

    expect(firstArgs(findMany).orderBy).toEqual([
      { releaseYear: { sort: 'desc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });

  it('defaults to page 1, 20 per page, by name', async () => {
    await request(app).get('/api/titles');

    expect(firstArgs(findMany)).toMatchObject({ skip: 0, take: 20 });
    expect(firstArgs(findMany).orderBy[0]).toEqual({ name: 'asc' });
  });

  it.each([
    ['an unknown media type', 'type=GAME'],
    ['a page size over 100', 'pageSize=500'],
    ['page 0', 'page=0'],
    ['a rating above 5', 'minRating=6'],
    ['a rating below 1', 'minRating=0'],
    ['a year that is not a number', 'year=abc'],
    ['an unknown sort', 'sort=popularity'],
  ])('rejects %s with 400 and never queries', async (_label, qs) => {
    const res = await request(app).get(`/api/titles?${qs}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/titles/:id', () => {
  it('returns the detail with sorted genre names and people', async () => {
    findFirst.mockResolvedValue({
      ...row({ createdById: 'u-9' }),
      description: 'A dream heist.',
      releaseYear: 2010,
      genres: [{ genre: { name: 'Thriller' } }, { genre: { name: 'Action' } }],
      people: [{ role: 'DIRECTOR', person: { id: 'p1', name: 'Christopher Nolan' } }],
    });

    const res = await request(app).get('/api/titles/t1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 't1',
      createdById: 'u-9',
      description: 'A dream heist.',
      releaseYear: 2010,
      genres: ['Action', 'Thriller'],
      people: [{ id: 'p1', name: 'Christopher Nolan', role: 'DIRECTOR' }],
    });
  });

  it('only looks up APPROVED titles', async () => {
    findFirst.mockResolvedValue(null);

    await request(app).get('/api/titles/t1');

    expect(firstArgs(findFirst).where).toEqual({ id: 't1', status: 'APPROVED' });
  });

  it('answers 404 for a missing, pending or rejected title alike', async () => {
    findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/titles/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Title not found' });
  });
});
