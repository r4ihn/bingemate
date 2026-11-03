import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

const prisma = {
  title: { findFirst: vi.fn(), findMany: vi.fn() },
  user: { findMany: vi.fn() },
};
const aggregate = vi.fn();
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/reviewBody.model.js', () => ({ ReviewBody: { aggregate } }));
vi.mock('../../src/mongo/models/reply.model.js', () => ({
  Reply: { collection: { name: 'replies' } },
}));

const stats = await import('../../src/modules/reviewStats/reviewStats.service.js');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T14:23:45Z'));
  prisma.title.findFirst.mockReset().mockResolvedValue({ id: 't1' });
  prisma.title.findMany.mockReset().mockResolvedValue([{ id: 'hidden' }]);
  prisma.user.findMany.mockReset().mockResolvedValue([]);
  aggregate.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('quoted aggregation pipelines', () => {
  it('matches the exact activity stages with a UTC month boundary', () => {
    expect(stats.reviewActivityPipeline('t1', 120)).toEqual([
      { $match: { titleId: 't1', createdAt: { $gte: new Date('2016-11-01T00:00:00Z') } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
          reviews: { $sum: 1 },
          avgBodyLength: { $avg: { $strLenCP: '$body' } },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          month: '$_id',
          reviews: 1,
          avgBodyLength: { $round: ['$avgBodyLength', 1] },
        },
      },
    ]);
  });

  it.each([undefined, 'MOVIE', 'BOOK', 'TV_SHOW'] as const)(
    'matches the exact reviewer stages for %s',
    (type) => {
      expect(stats.topReviewersPipeline(['hidden'], { type, limit: 3 })).toEqual([
        { $match: { ...(type ? { mediaType: type } : {}), titleId: { $nin: ['hidden'] } } },
        { $group: { _id: '$userId', reviews: { $sum: 1 } } },
        { $sort: { reviews: -1, _id: 1 } },
        { $limit: 6 },
        {
          $lookup: {
            from: 'replies',
            let: { userId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
              { $count: 'count' },
            ],
            as: 'replyCounts',
          },
        },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            reviews: 1,
            replies: { $ifNull: [{ $arrayElemAt: ['$replyCounts.count', 0] }, 0] },
          },
        },
      ]);
    },
  );

  it('matches the exact recent-count stages', () => {
    const since = new Date('2025-01-02T03:04:05Z');
    expect(stats.recentReviewCountsPipeline(since)).toEqual([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$titleId', reviews: { $sum: 1 } } },
    ]);
  });
});

describe('socket-free service checks', () => {
  it('returns sparse activity unchanged and checks approval first', async () => {
    const rows = [
      { month: '2022-01', reviews: 2, avgBodyLength: 3.5 },
      { month: '2025-12', reviews: 1, avgBodyLength: 7 },
    ];
    aggregate.mockImplementation(async () => {
      expect(prisma.title.findFirst).toHaveBeenCalledWith({
        where: { id: 't1', status: 'APPROVED' },
        select: { id: true },
      });
      return rows;
    });
    expect(await stats.reviewActivity('t1', 120)).toEqual({ data: rows });
    expect(aggregate).toHaveBeenCalledWith(stats.reviewActivityPipeline('t1', 120));
  });

  it('returns empty activity', async () => {
    expect(await stats.reviewActivity('t1', 120)).toEqual({ data: [] });
  });

  it('hides missing/unapproved titles without aggregating', async () => {
    prisma.title.findFirst.mockResolvedValue(null);
    await expect(stats.reviewActivity('t1', 120)).rejects.toMatchObject({
      status: 404,
      message: 'Title not found',
    });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('filters hidden titles and authors, preserves order and trims to limit', async () => {
    aggregate.mockResolvedValue([
      { userId: 'gone', reviews: 9, replies: 1 },
      { userId: 'admin', reviews: 8, replies: 2 },
      { userId: 'u1', reviews: 7, replies: 0 },
      { userId: 'u2', reviews: 7, replies: 3 },
      { userId: 'u3', reviews: 6, replies: 0 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'admin', username: 'Admin', role: 'ADMIN' },
      { id: 'u1', username: 'Maya', role: 'CONSUMER' },
      { id: 'u2', username: null, role: 'CREATOR' },
      { id: 'u3', username: 'Third', role: 'CONSUMER' },
    ]);
    expect(await stats.topReviewers({ type: 'BOOK', limit: 2 })).toEqual({
      data: [
        { userId: 'u1', name: 'Maya', reviews: 7, replies: 0 },
        { userId: 'u2', name: 'user-u2', reviews: 7, replies: 3 },
      ],
    });
    expect(prisma.title.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { status: { not: 'APPROVED' } },
      select: { id: true },
    });
    expect(aggregate).toHaveBeenCalledWith(
      stats.topReviewersPipeline(['hidden'], { type: 'BOOK', limit: 2 }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: { in: ['gone', 'admin', 'u1', 'u2', 'u3'] } },
      select: { id: true, username: true, role: true },
    });
  });

  it('returns no reviewers without loading authors', async () => {
    expect(await stats.topReviewers({ limit: 10 })).toEqual({ data: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns recent review counts as a Map with a rolling day cutoff', async () => {
    aggregate.mockResolvedValue([
      { _id: 't1', reviews: 3 },
      { _id: 't2', reviews: 1 },
    ]);
    expect(await stats.recentReviewCounts(2)).toEqual(
      new Map([
        ['t1', 3],
        ['t2', 1],
      ]),
    );
    expect(aggregate).toHaveBeenCalledWith(
      stats.recentReviewCountsPipeline(new Date('2026-11-01T14:23:45Z')),
    );
  });

  it('returns an empty Map for no recent reviews', async () => {
    expect(await stats.recentReviewCounts(1)).toEqual(new Map());
  });
});

const schemas = await import('../../src/modules/reviewStats/reviewStats.schema.js');

describe('bounded query and parameter schemas', () => {
  it('uses the specified defaults, including empty query strings', () => {
    expect(schemas.reviewActivityQuerySchema.parse({})).toEqual({ months: 120 });
    expect(schemas.reviewActivityQuerySchema.parse({ months: '' })).toEqual({ months: 120 });
    expect(schemas.topReviewersQuerySchema.parse({})).toEqual({ limit: 10 });
    expect(schemas.topReviewersQuerySchema.parse({ type: '', limit: '' })).toEqual({ limit: 10 });
  });

  it.each(['0', '241', 'abc', '-1', '1.5', ['1', '2']])('rejects invalid months %s', (months) => {
    expect(schemas.reviewActivityQuerySchema.safeParse({ months }).success).toBe(false);
  });

  it.each(['0', '51', 'abc', '-1', '1.5', ['1', '2']])('rejects invalid limit %s', (limit) => {
    expect(schemas.topReviewersQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it.each([1, 240])('accepts months boundary %i', (months) => {
    expect(schemas.reviewActivityQuerySchema.parse({ months: String(months) })).toEqual({ months });
  });

  it.each([1, 50])('accepts limit boundary %i', (limit) => {
    expect(schemas.topReviewersQuerySchema.parse({ limit: String(limit) })).toEqual({ limit });
  });

  it.each(['MOVIE', 'BOOK', 'TV_SHOW'])('accepts media type %s', (type) => {
    expect(schemas.topReviewersQuerySchema.parse({ type })).toEqual({ type, limit: 10 });
  });

  it('rejects unknown media types and invalid title ids', () => {
    expect(schemas.topReviewersQuerySchema.safeParse({ type: 'PODCAST' }).success).toBe(false);
    expect(schemas.titleIdParamSchema.safeParse({ titleId: '' }).success).toBe(false);
    expect(schemas.titleIdParamSchema.safeParse({ titleId: 'x'.repeat(41) }).success).toBe(false);
    expect(schemas.titleIdParamSchema.parse({ titleId: 't1' })).toEqual({ titleId: 't1' });
  });
});
