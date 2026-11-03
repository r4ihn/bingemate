import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, bodies, replies } = vi.hoisted(() => ({
  prisma: { review: { findMany: vi.fn() } },
  bodies: { find: vi.fn(), deleteMany: vi.fn() },
  replies: { find: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/reviewBody.model.js', () => ({ ReviewBody: bodies }));
vi.mock('../../src/mongo/models/reply.model.js', () => ({ Reply: replies }));

const { cleanupOrphans } = await import('../../src/jobs/cleanupOrphans.js');

type Doc = { _id: string; reviewId?: string };
let bodyDocs: Doc[];
let replyDocs: Doc[];
let liveIds: Set<string>;

/** Stateful stores: enforce bounded, projected, ordered reads and really remove deleted rows. */
function stubStore(model: typeof bodies, docs: () => Doc[], field: '_id' | 'reviewId') {
  model.find.mockImplementation((filter: { _id?: { $gt: string } }) => {
    let limit: number;
    const chain = {
      select: (projection: Record<string, number>) => {
        expect(projection).toEqual(field === '_id' ? { _id: 1 } : { _id: 1, reviewId: 1 });
        return chain;
      },
      sort: (sort: unknown) => {
        expect(sort).toEqual({ _id: 1 });
        return chain;
      },
      limit: (size: number) => {
        expect(size).toBe(1000);
        limit = size;
        return chain;
      },
      lean: async () => {
        expect(limit).toBe(1000);
        return docs()
          .filter((doc) => !filter._id || doc._id > filter._id.$gt)
          .sort((a, b) => a._id.localeCompare(b._id))
          .slice(0, limit);
      },
    };
    return chain;
  });
  model.deleteMany.mockImplementation(async (filter: Record<string, { $in: string[] }>) => {
    const ids = filter[field]!.$in;
    const rows = docs();
    let deletedCount = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (ids.includes(rows[i]![field]!)) {
        rows.splice(i, 1);
        deletedCount++;
      }
    }
    return { deletedCount };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  bodyDocs = [];
  replyDocs = [];
  liveIds = new Set();
  stubStore(bodies, () => bodyDocs, '_id');
  stubStore(replies, () => replyDocs, 'reviewId');
  prisma.review.findMany.mockImplementation(
    async ({ where, select }: { where: { id: { in: string[] } }; select: unknown }) => {
      expect(select).toEqual({ id: true });
      expect(where.id.in.length).toBeLessThanOrEqual(1000);
      return where.id.in.filter((id) => liveIds.has(id)).map((id) => ({ id }));
    },
  );
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('cleanupOrphans', () => {
  it('removes bodies with no header row and leaves live bodies', async () => {
    bodyDocs = [{ _id: 'gone' }, { _id: 'live' }];
    liveIds.add('live');

    await expect(cleanupOrphans()).resolves.toEqual({ reviewBodies: 1, replies: 0 });
    expect(bodyDocs).toEqual([{ _id: 'live' }]);
    expect(bodies.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['gone'] } });
    expect(console.info).toHaveBeenCalledWith('Orphans cleaned: 1 review bodies, 0 replies');
  });

  it('removes all replies for a missing review and keeps replies for live reviews', async () => {
    replyDocs = [
      { _id: 'a', reviewId: 'gone' },
      { _id: 'b', reviewId: 'gone' },
      { _id: 'c', reviewId: 'live' },
    ];
    liveIds.add('live');

    await expect(cleanupOrphans()).resolves.toEqual({ reviewBodies: 0, replies: 2 });
    expect(replyDocs).toEqual([{ _id: 'c', reviewId: 'live' }]);
    expect(prisma.review.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['gone', 'live'] } },
      select: { id: true },
    });
  });

  it('examines all 2500 ids in each collection across three bounded pages', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => `r${String(i).padStart(4, '0')}`);
    // Reverse insertion order so the stub must sort before applying the page limit.
    bodyDocs = ids.map((_id) => ({ _id })).reverse();
    replyDocs = ids.map((_id) => ({ _id, reviewId: _id })).reverse();

    await expect(cleanupOrphans()).resolves.toEqual({ reviewBodies: 2500, replies: 2500 });
    expect(prisma.review.findMany.mock.calls.map(([query]) => query.where.id.in)).toEqual([
      ids.slice(0, 1000),
      ids.slice(1000, 2000),
      ids.slice(2000),
      ids.slice(0, 1000),
      ids.slice(1000, 2000),
      ids.slice(2000),
    ]);
    for (const model of [bodies, replies]) {
      expect(model.find.mock.calls.map(([filter]) => filter)).toEqual([
        {},
        { _id: { $gt: ids[999] } },
        { _id: { $gt: ids[1999] } },
        { _id: { $gt: ids[2499] } },
      ]);
    }
  });

  it('returns zero deletions on a second run', async () => {
    bodyDocs = [{ _id: 'gone' }, { _id: 'live' }];
    replyDocs = [
      { _id: 'a', reviewId: 'gone' },
      { _id: 'b', reviewId: 'live' },
    ];
    liveIds.add('live');

    await expect(cleanupOrphans()).resolves.toEqual({ reviewBodies: 1, replies: 1 });
    await expect(cleanupOrphans()).resolves.toEqual({ reviewBodies: 0, replies: 0 });
    expect(bodies.deleteMany).toHaveBeenCalledTimes(1);
    expect(replies.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('deletes nothing and rejects when the first Prisma read fails', async () => {
    bodyDocs = [{ _id: 'gone' }];
    replyDocs = [{ _id: 'a', reviewId: 'gone' }];
    const error = new Error('PostgreSQL unavailable');
    prisma.review.findMany.mockRejectedValueOnce(error);

    await expect(cleanupOrphans()).rejects.toBe(error);
    expect(bodies.deleteMany).not.toHaveBeenCalled();
    expect(replies.deleteMany).not.toHaveBeenCalled();
    expect(replies.find).not.toHaveBeenCalled();
  });

  it.each(['bodies', 'replies'])(
    'stops all further deletions after a later %s lookup fails',
    async (phase) => {
      const ids = Array.from({ length: 1001 }, (_, i) => `r${String(i).padStart(4, '0')}`);
      if (phase === 'bodies') bodyDocs = ids.map((_id) => ({ _id }));
      replyDocs = ids.map((_id) => ({ _id, reviewId: _id }));
      const error = new Error('Connection lost');
      prisma.review.findMany.mockResolvedValueOnce([]).mockRejectedValueOnce(error);

      await expect(cleanupOrphans()).rejects.toBe(error);
      expect(prisma.review.findMany).toHaveBeenCalledTimes(2);
      expect(bodies.deleteMany).toHaveBeenCalledTimes(phase === 'bodies' ? 1 : 0);
      expect(replies.deleteMany).toHaveBeenCalledTimes(phase === 'replies' ? 1 : 0);
      expect(phase === 'bodies' ? bodyDocs : replyDocs).toHaveLength(1);
      if (phase === 'bodies') expect(replies.find).not.toHaveBeenCalled();
    },
  );

  it('deletes nothing when every id exists', async () => {
    bodyDocs = [{ _id: 'live' }];
    replyDocs = [{ _id: 'a', reviewId: 'live' }];
    liveIds.add('live');

    await expect(cleanupOrphans()).resolves.toEqual({ reviewBodies: 0, replies: 0 });
    expect(bodies.deleteMany).not.toHaveBeenCalled();
    expect(replies.deleteMany).not.toHaveBeenCalled();
  });

  it('does not query Prisma or delete anything for empty collections', async () => {
    await expect(cleanupOrphans()).resolves.toEqual({ reviewBodies: 0, replies: 0 });
    expect(prisma.review.findMany).not.toHaveBeenCalled();
    expect(bodies.deleteMany).not.toHaveBeenCalled();
    expect(replies.deleteMany).not.toHaveBeenCalled();
  });
});
