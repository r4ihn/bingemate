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

const recentReviewCounts = vi.fn();
vi.mock('../../src/modules/reviewStats/reviewStats.service.js', () => ({ recentReviewCounts }));

vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/trendingCard.model.js', () => ({ TrendingCard: trendingCard }));

const { createApp } = await import('../../src/app.js');
const { refreshTrending, TRENDING_PER_TYPE } = await import('../../src/jobs/refreshTrending.js');
const app = createApp();
const { listTrending } = await import('../../src/modules/trending/trending.service.js');
const { trendingQuerySchema } = await import('../../src/modules/trending/trending.schema.js');

const card = (over: Record<string, unknown> = {}) => ({
  _id: 'x',
  titleId: 't1',
  name: 'Dune',
  mediaType: 'BOOK',
  posterUrl: 'https://img/dune.jpg',
  avgRating: 4.5,
  reviewCount: 12,
  recentReviews: 3,
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
  recentReviewCounts.mockReset().mockResolvedValue(new Map());
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
    expect(prisma.title.findMany).not.toHaveBeenCalled();
  });

  it('reads MongoDB with no type filter, limit 20, best score first then title id', async () => {
    await request(app).get('/api/trending');

    expect(trendingCard.find).toHaveBeenCalledWith({});
    expect(chain.sort).toHaveBeenCalledWith({ score: -1, titleId: 1 });
    expect(chain.limit).toHaveBeenCalledWith(150);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('filters by media type and takes the limit asked for', async () => {
    await request(app).get('/api/trending?type=TV_SHOW&limit=5');

    expect(trendingCard.find).toHaveBeenCalledWith({ mediaType: 'TV_SHOW' });
    expect(chain.limit).toHaveBeenCalledWith(150);
  });

  it('treats an empty type and limit as not given', async () => {
    const res = await request(app).get('/api/trending?type=&limit=');

    expect(res.status).toBe(200);
    expect(trendingCard.find).toHaveBeenCalledWith({});
    expect(chain.limit).toHaveBeenCalledWith(150);
  });

  it.each([
    ['unknown type', 'type=PODCAST'],
    ['unknown sort', 'sort=popular'],
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
    expect(chain.limit).toHaveBeenCalledWith(150);
  });

  it('excludes deleted or hidden titles immediately', async () => {
    chain.lean.mockResolvedValue([card({ titleId: 'hidden' }), card({ titleId: 't1' })]);
    prisma.title.findMany.mockResolvedValue([{ id: 't1' }]);
    const res = await request(app).get('/api/trending?limit=1');
    expect(res.body.data.map((c: { titleId: string }) => c.titleId)).toEqual(['t1']);
    expect(prisma.title.findMany.mock.calls[0]?.[0].where.status).toBe('APPROVED');
  });

  it('maps cards to the response shape, in the order MongoDB gave them', async () => {
    prisma.title.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
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
          recentReviews: 3,
          score: 4.8,
        },
        {
          titleId: 't1',
          name: 'Dune',
          mediaType: 'BOOK',
          avgRating: 4.5,
          reviewCount: 12,
          recentReviews: 3,
          score: 4.2,
        },
      ],
    });
  });

  it('reads an old card without recentReviews as zero', async () => {
    chain.lean.mockResolvedValue([card({ recentReviews: undefined })]);
    prisma.title.findMany.mockResolvedValue([{ id: 't1' }]);

    const res = await request(app).get('/api/trending');

    expect(res.status).toBe(200);
    expect(res.body.data[0].recentReviews).toBe(0);
  });

  it('orders recent reviews first, then score and title id for ties', async () => {
    stubRecentCards();

    const res = await request(app).get('/api/trending?sort=recent');

    expect(res.status).toBe(200);
    expect(chain.sort).toHaveBeenCalledWith({ recentReviews: -1, score: -1, titleId: 1 });
    expect(res.body.data.map((c: { titleId: string }) => c.titleId)).toEqual([
      't4',
      't1',
      't2',
      't3',
    ]);
  });

  it('does not return a card whose title is no longer approved', async () => {
    chain.lean.mockResolvedValue([card()]);
    prisma.title.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/trending?limit=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
    expect(trendingCard.find).toHaveBeenCalledTimes(1);
    expect(chain.limit).toHaveBeenCalledWith(150);
  });

  it('keeps score order after filtering unapproved titles', async () => {
    chain.lean.mockResolvedValue([
      card({ titleId: 't3', score: 4.9 }),
      card({ titleId: 't2', score: 4.8 }),
      card({ titleId: 't1', score: 4.2 }),
    ]);
    prisma.title.findMany.mockResolvedValue([{ id: 't1' }, { id: 't3' }]);

    const res = await request(app).get('/api/trending');

    expect(res.status).toBe(200);
    expect(
      res.body.data.map((c: { titleId: string; score: number }) => [c.titleId, c.score]),
    ).toEqual([
      ['t3', 4.9],
      ['t1', 4.2],
    ]);
  });

  it('looks up only the returned card ids with status APPROVED and selects only ids', async () => {
    chain.lean.mockResolvedValue([card({ titleId: 't2' }), card({ titleId: 't1' })]);

    const res = await request(app).get('/api/trending?type=BOOK&limit=2');

    expect(res.status).toBe(200);
    expect(prisma.title.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.title.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['t2', 't1'] }, status: 'APPROVED' },
      select: { id: true },
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
      viewRow('t1', {
        posterUrl: 'https://img/1.jpg',
        review_count: 7n,
        avg_rating: '4.5',
        trending_score: 3.9,
      }),
      viewRow('t2', { mediaType: 'BOOK' }),
    ]);
    prisma.title.findMany.mockResolvedValue([
      { id: 't1', posterUrl: 'https://img/1.jpg' },
      { id: 't2', posterUrl: null },
    ]);

    const result = await refreshTrending();

    expect(prisma.title.findMany).not.toHaveBeenCalled();
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
              recentReviews: 0,
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
            $set: {
              name: 'Title t2',
              mediaType: 'BOOK',
              avgRating: 4,
              reviewCount: 4,
              recentReviews: 0,
              score: 3.5,
            },
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

  it('keeps existing cards when nothing is trending, and writes nothing', async () => {
    store.set('old', { titleId: 'old' });

    const result = await refreshTrending();

    expect(trendingCard.bulkWrite).not.toHaveBeenCalled();
    expect(prisma.title.findMany).not.toHaveBeenCalled();
    expect(trendingCard.deleteMany).not.toHaveBeenCalled();
    expect(store.get('old')).toEqual({ titleId: 'old' });
    expect(result).toEqual({ upserted: 0, removed: 0 });
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

/** Model Mongo's requested sort on deliberately unordered cards, including both tie breakers. */
function stubRecentCards() {
  const cards = [
    card({ titleId: 't3', recentReviews: 1, score: 5 }),
    card({ titleId: 't2', recentReviews: 2, score: 4 }),
    card({ titleId: 't4', recentReviews: 2, score: 5 }),
    card({ titleId: 't1', recentReviews: 2, score: 4 }),
  ];
  prisma.title.findMany.mockResolvedValue(cards.map(({ titleId }) => ({ id: titleId })));
  chain.sort.mockImplementation((sort: Record<string, number>) => {
    cards.sort((a, b) => {
      for (const [key, direction] of Object.entries(sort)) {
        const av = a[key as keyof typeof a];
        const bv = b[key as keyof typeof b];
        if (av < bv) return -direction;
        if (av > bv) return direction;
      }
      return 0;
    });
    chain.lean.mockResolvedValue(cards);
    return chain;
  });
}

// These use the same route schema and service without opening a Supertest socket.
describe('trending socket-free', () => {
  it('defaults to score sorting and rejects an unknown sort', async () => {
    const query = trendingQuerySchema.parse({});
    expect(query).toEqual({ sort: 'score', limit: 20 });
    expect(trendingQuerySchema.safeParse({ sort: 'bad' }).success).toBe(false);
    await listTrending(query);
    expect(chain.sort).toHaveBeenCalledWith({ score: -1, titleId: 1 });
    expect(chain.limit).toHaveBeenCalledWith(150);
  });

  it('returns recent ordering including score and title-id tie breakers', async () => {
    stubRecentCards();
    const result = await listTrending(trendingQuerySchema.parse({ sort: 'recent' }));
    expect(chain.sort).toHaveBeenCalledWith({ recentReviews: -1, score: -1, titleId: 1 });
    expect(result.data.map((c) => c.titleId)).toEqual(['t4', 't1', 't2', 't3']);
    expect(result.data.map((c) => c.recentReviews)).toEqual([2, 2, 2, 1]);
  });

  it('maps missing counts to zero and filters non-APPROVED titles before trimming', async () => {
    chain.lean.mockResolvedValue([
      card({ titleId: 'hidden', recentReviews: 10 }),
      card({ recentReviews: undefined }),
    ]);
    prisma.title.findMany.mockResolvedValue([{ id: 't1' }]);
    const result = await listTrending(trendingQuerySchema.parse({ sort: 'recent', limit: 2 }));
    expect(chain.limit).toHaveBeenCalledWith(150);
    expect(chain.sort).toHaveBeenCalledWith({ recentReviews: -1, score: -1, titleId: 1 });
    expect(prisma.title.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['hidden', 't1'] }, status: 'APPROVED' },
      select: { id: true },
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ titleId: 't1', recentReviews: 0 });
  });

  it('applies the requested limit after filtering non-APPROVED titles', async () => {
    chain.lean.mockResolvedValue([
      card({ titleId: 'hidden' }),
      card({ titleId: 't1' }),
      card({ titleId: 't2' }),
      card({ titleId: 't3' }),
    ]);
    prisma.title.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }, { id: 't3' }]);

    const result = await listTrending(trendingQuerySchema.parse({ limit: 2 }));

    expect(chain.limit).toHaveBeenCalledWith(150);
    expect(result.data.map((c) => c.titleId)).toEqual(['t1', 't2']);
  });
});
