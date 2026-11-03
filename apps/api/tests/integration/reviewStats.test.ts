import request from 'supertest';
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
vi.mock('../../src/mongo/models/reviewBody.model.js', () => ({
  ReviewBody: { aggregate, collection: { name: 'reviewbodies' } },
}));
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

const { createApp } = await import('../../src/app.js');
const app = createApp();

describe('GET /api/titles/:titleId/review-activity', () => {
  it('is public and returns populated months only', async () => {
    const data = [
      { month: '2022-01', reviews: 3, avgBodyLength: 10.3 },
      { month: '2025-12', reviews: 1, avgBodyLength: 5 },
    ];
    aggregate.mockResolvedValue(data);
    const res = await request(app).get('/api/titles/t1/review-activity');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data });
    expect(aggregate).toHaveBeenCalledWith(stats.reviewActivityPipeline('t1', 120));
  });

  it('returns 200 with an empty series for a title without reviews', async () => {
    const res = await request(app).get('/api/titles/t1/review-activity');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it.each(['missing', 'unapproved'])('returns 404 for a %s title before aggregating', async () => {
    prisma.title.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/titles/t1/review-activity');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Title not found' });
    expect(prisma.title.findFirst).toHaveBeenCalledWith({
      where: { id: 't1', status: 'APPROVED' },
      select: { id: true },
    });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it.each(['0', '241', 'abc', '1.5'])('rejects months=%s before querying', async (months) => {
    const res = await request(app).get(`/api/titles/t1/review-activity?months=${months}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
    expect(prisma.title.findFirst).not.toHaveBeenCalled();
    expect(aggregate).not.toHaveBeenCalled();
  });

  it.each([1, 240])('accepts months=%i', async (months) => {
    const res = await request(app).get(`/api/titles/t1/review-activity?months=${months}`);
    expect(res.status).toBe(200);
    expect(aggregate).toHaveBeenCalledWith(stats.reviewActivityPipeline('t1', months));
  });

  it('rejects an oversized title id', async () => {
    const res = await request(app).get(`/api/titles/${'x'.repeat(41)}/review-activity`);
    expect(res.status).toBe(400);
    expect(aggregate).not.toHaveBeenCalled();
  });
});

describe('GET /api/reviews/top-reviewers', () => {
  it('is public, excludes hidden titles, missing users and admins, and respects type and limit', async () => {
    aggregate.mockResolvedValue([
      { userId: 'gone', reviews: 10, replies: 1 },
      { userId: 'admin', reviews: 9, replies: 0 },
      { userId: 'u1', reviews: 8, replies: 2 },
      { userId: 'u2', reviews: 7, replies: 0 },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'admin', username: 'Admin', role: 'ADMIN' },
      { id: 'u1', username: 'Maya', role: 'CONSUMER' },
      { id: 'u2', username: 'Lee', role: 'CREATOR' },
    ]);
    const res = await request(app).get('/api/reviews/top-reviewers?type=TV_SHOW&limit=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [{ userId: 'u1', name: 'Maya', reviews: 8, replies: 2 }] });
    expect(prisma.title.findMany).toHaveBeenCalledExactlyOnceWith({
      where: { status: { not: 'APPROVED' } },
      select: { id: true },
    });
    expect(aggregate).toHaveBeenCalledWith(
      stats.topReviewersPipeline(['hidden'], { type: 'TV_SHOW', limit: 1 }),
    );
    expect(aggregate.mock.calls[0]![0][4]).toEqual({
      $lookup: {
        from: 'replies',
        let: { userId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
          {
            $lookup: {
              from: 'reviewbodies',
              localField: 'reviewId',
              foreignField: '_id',
              as: 'review',
            },
          },
          { $match: { review: { $ne: [] }, 'review.titleId': { $nin: ['hidden'] } } },
          { $count: 'count' },
        ],
        as: 'replyCounts',
      },
    });
  });

  it('defaults to limit 10 and returns an empty array', async () => {
    const res = await request(app).get('/api/reviews/top-reviewers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
    expect(aggregate).toHaveBeenCalledWith(stats.topReviewersPipeline(['hidden'], { limit: 10 }));
  });

  it.each(['limit=0', 'limit=51', 'limit=abc', 'limit=1.5', 'type=PODCAST'])(
    'rejects %s before querying',
    async (query) => {
      const res = await request(app).get(`/api/reviews/top-reviewers?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(prisma.title.findMany).not.toHaveBeenCalled();
      expect(aggregate).not.toHaveBeenCalled();
    },
  );

  it.each([1, 50])('accepts limit=%i', async (limit) => {
    const res = await request(app).get(`/api/reviews/top-reviewers?limit=${limit}`);
    expect(res.status).toBe(200);
    expect(aggregate).toHaveBeenCalledWith(stats.topReviewersPipeline(['hidden'], { limit }));
  });
});
