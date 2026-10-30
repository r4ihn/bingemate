import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No databases in CI: both stores are replaced and the tests check what the code asks of them.
const prisma = { $queryRaw: vi.fn(), title: { findMany: vi.fn() } };

type Card = Record<string, unknown> & { titleId: string };
/** A tiny in-memory stand-in for the collection, so the job can be run twice against it. */
let store = new Map<string, Card>();

const chain = {
  sort: vi.fn(),
  limit: vi.fn(),
  lean: vi.fn(),
};
const trendingCard = {
  find: vi.fn(),
  bulkWrite: vi.fn(),
  deleteMany: vi.fn(),
};

vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/trendingCard.model.js', () => ({ TrendingCard: trendingCard }));

const { createApp } = await import('../../src/app.js');
const { refreshTrending, TRENDING_PER_TYPE } = await import('../../src/jobs/refreshTrending.js');
const app = createApp();

const card = (over: Record<string, unknown> = {}) => ({
  _id: 'x',
  titleId: 't1',
  name: 'Dune',
  mediaType: 'BOOK',
  posterUrl: 'https://img/dune.jpg',
  avgRating: 4.5,
  reviewCount: 12,
  score: 4.2,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const viewRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Title ${id}`,
  mediaType: 'MOVIE',
  review_count: 4,
  avg_rating: 4,
  trending_score: 3.5,
  ...over,
});

beforeEach(() => {
  store = new Map();
  chain.sort.mockReset().mockReturnValue(chain);
  chain.limit.mockReset().mockReturnValue(chain);
  chain.lean.mockReset().mockResolvedValue([]);
  trendingCard.find.mockReset().mockReturnValue(chain);
  trendingCard.bulkWrite.mockReset().mockImplementation(async (ops: unknown[]) => {
    for (const op of ops as {
      updateOne: {
        filter: { titleId: string };
        update: { $set: Record<string, unknown>; $unset?: Record<string, unknown> };
        upsert: boolean;
      };
    }[]) {
      const { filter, update, upsert } = op.updateOne;
      const existing = store.get(filter.titleId);
      if (!existing && !upsert) continue;
      const next: Card = { ...(existing ?? { titleId: filter.titleId }), ...update.$set };
      for (const k of Object.keys(update.$unset ?? {})) delete next[k];
      store.set(filter.titleId, next);
    }
  });
  trendingCard.deleteMany
    .mockReset()
    .mockImplementation(async (f: { titleId: { $nin: string[] } }) => {
      let deletedCount = 0;
      for (const id of [...store.keys()]) {
        if (!f.titleId.$nin.includes(id)) {
          store.delete(id);
          deletedCount += 1;
        }
      }
      return { deletedCount };
    });
  prisma.$queryRaw.mockReset().mockResolvedValue([]);
  prisma.title.findMany.mockReset().mockResolvedValue([]);
});

describe('GET /api/trending', () => {
  it('is public and returns { data: [] } when there are no cards', async () => {
    const res = await request(app).get('/api/trending');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('reads MongoDB only: no type filter, limit 20, best score first then title id', async () => {
    await request(app).get('/api/trending');

    expect(trendingCard.find).toHaveBeenCalledWith({});
    expect(chain.sort).toHaveBeenCalledWith({ score: -1, titleId: 1 });
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('filters by media type and takes the limit asked for', async () => {
    await request(app).get('/api/trending?type=TV_SHOW&limit=5');

    expect(trendingCard.find).toHaveBeenCalledWith({ mediaType: 'TV_SHOW' });
    expect(chain.limit).toHaveBeenCalledWith(5);
  });

  it('treats an empty type and limit as not given', async () => {
    const res = await request(app).get('/api/trending?type=&limit=');

    expect(res.status).toBe(200);
    expect(trendingCard.find).toHaveBeenCalledWith({});
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it.each([
    ['unknown type', 'type=PODCAST'],
    ['limit 0', 'limit=0'],
    ['limit 51', 'limit=51'],
    ['negative limit', 'limit=-1'],
    ['fractional limit', 'limit=2.5'],
    ['non-numeric limit', 'limit=abc'],
  ])('rejects %s with 400 without querying', async (_label, qs) => {
    const res = await request(app).get(`/api/trending?${qs}`);

    expect(res.status).toBe(400);
    expect(trendingCard.find).not.toHaveBeenCalled();
  });

  it.each([1, 50])('accepts limit=%i', async (limit) => {
    const res = await request(app).get(`/api/trending?limit=${limit}`);

    expect(res.status).toBe(200);
    expect(chain.limit).toHaveBeenCalledWith(limit);
  });

  it('maps cards to the response shape, in the order MongoDB gave them', async () => {
    chain.lean.mockResolvedValue([
      card({ titleId: 't2', name: 'Alien', mediaType: 'MOVIE', score: 4.8 }),
      card({ titleId: 't1', posterUrl: undefined }),
    ]);

    const res = await request(app).get('/api/trending');

    expect(res.body).toEqual({
      data: [
        {
          titleId: 't2',
          name: 'Alien',
          mediaType: 'MOVIE',
          posterUrl: 'https://img/dune.jpg',
          avgRating: 4.5,
          reviewCount: 12,
          score: 4.8,
        },
        {
          titleId: 't1',
          name: 'Dune',
          mediaType: 'BOOK',
          avgRating: 4.5,
          reviewCount: 12,
          score: 4.2,
        },
      ],
    });
  });
});

describe('refreshTrending', () => {
  it('asks the view for the top 50 per media type', async () => {
    await refreshTrending();

    expect(TRENDING_PER_TYPE).toBe(50);
    const sql = prisma.$queryRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain('"trending_titles"');
    expect(sql.sql).toContain('PARTITION BY v."mediaType"');
    expect(sql.sql).toContain('ORDER BY v."trending_score" DESC, v."id" ASC');
    expect(sql.sql).toContain('"rank" <= ?');
    expect(sql.values).toEqual([50]);
  });

  it('writes one upsert per row keyed by title id, with the poster from Title', async () => {
    prisma.$queryRaw.mockResolvedValue([
      viewRow('t1', { review_count: 7n, avg_rating: '4.5', trending_score: 3.9 }),
      viewRow('t2', { mediaType: 'BOOK' }),
    ]);
    prisma.title.findMany.mockResolvedValue([
      { id: 't1', posterUrl: 'https://img/1.jpg' },
      { id: 't2', posterUrl: null },
    ]);

    const result = await refreshTrending();

    expect(prisma.title.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1', 't2'] } },
      select: { id: true, posterUrl: true },
    });
    expect(trendingCard.bulkWrite.mock.calls[0]?.[0]).toEqual([
      {
        updateOne: {
          filter: { titleId: 't1' },
          update: {
            $set: {
              name: 'Title t1',
              mediaType: 'MOVIE',
              avgRating: 4.5,
              reviewCount: 7,
              score: 3.9,
              posterUrl: 'https://img/1.jpg',
            },
          },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { titleId: 't2' },
          update: {
            $set: { name: 'Title t2', mediaType: 'BOOK', avgRating: 4, reviewCount: 4, score: 3.5 },
            $unset: { posterUrl: '' },
          },
          upsert: true,
        },
      },
    ]);
    expect(result).toEqual({ upserted: 2, removed: 0 });
  });

  it('removes cards whose title is no longer in the top set', async () => {
    store.set('old', { titleId: 'old', name: 'Gone' });
    store.set('t1', { titleId: 't1', name: 'Stale name' });
    prisma.$queryRaw.mockResolvedValue([viewRow('t1'), viewRow('t2')]);

    const result = await refreshTrending();

    expect(trendingCard.deleteMany).toHaveBeenCalledWith({ titleId: { $nin: ['t1', 't2'] } });
    expect([...store.keys()].sort()).toEqual(['t1', 't2']);
    expect(store.get('t1')?.name).toBe('Title t1');
    expect(result).toEqual({ upserted: 2, removed: 1 });
  });

  it('clears every card when nothing is trending, and writes nothing', async () => {
    store.set('old', { titleId: 'old' });

    const result = await refreshTrending();

    expect(trendingCard.bulkWrite).not.toHaveBeenCalled();
    expect(prisma.title.findMany).not.toHaveBeenCalled();
    expect(trendingCard.deleteMany).toHaveBeenCalledWith({ titleId: { $nin: [] } });
    expect(store.size).toBe(0);
    expect(result).toEqual({ upserted: 0, removed: 1 });
  });

  it('is idempotent: a second run leaves the same cards and removes nothing', async () => {
    store.set('old', { titleId: 'old' });
    prisma.$queryRaw.mockResolvedValue([viewRow('t1'), viewRow('t2', { mediaType: 'BOOK' })]);
    prisma.title.findMany.mockResolvedValue([{ id: 't1', posterUrl: 'https://img/1.jpg' }]);

    const first = await refreshTrending();
    const afterFirst = structuredClone([...store.entries()]);
    const second = await refreshTrending();

    expect(first).toEqual({ upserted: 2, removed: 1 });
    expect(second).toEqual({ upserted: 2, removed: 0 });
    expect([...store.entries()]).toEqual(afterFirst);
    expect(store.size).toBe(2);
  });

  it('drops a poster that has been removed from the title', async () => {
    store.set('t1', { titleId: 't1', posterUrl: 'https://img/old.jpg' });
    prisma.$queryRaw.mockResolvedValue([viewRow('t1')]);
    prisma.title.findMany.mockResolvedValue([{ id: 't1', posterUrl: null }]);

    await refreshTrending();

    expect(store.get('t1')).not.toHaveProperty('posterUrl');
  });
});
