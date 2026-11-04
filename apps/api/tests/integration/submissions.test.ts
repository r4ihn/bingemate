import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No databases: check the query arguments and return the selected title fields.
const calls: string[] = [];
const prisma = {
  title: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  review: { findMany: vi.fn(), count: vi.fn() },
  listEntry: { count: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};
const mongo = {
  bodyDeleteMany: vi.fn(),
  replyDeleteMany: vi.fn(),
  posterDeleteOne: vi.fn(),
};
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/reviewBody.model.js', () => ({
  ReviewBody: { deleteMany: mongo.bodyDeleteMany },
}));
vi.mock('../../src/mongo/models/reply.model.js', () => ({
  Reply: { deleteMany: mongo.replyDeleteMany },
}));
vi.mock('../../src/mongo/models/titlePoster.model.js', () => ({
  TitlePoster: { deleteOne: mongo.posterDeleteOne },
}));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

const as = (id = 'c1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'CREATOR') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

const updatedAt = new Date('2026-11-02T01:02:03.456Z');

beforeEach(() => {
  calls.length = 0;
  prisma.$queryRaw.mockReset().mockImplementation(async () => calls.push('lock'));
  prisma.$transaction
    .mockReset()
    .mockImplementation(async (arg: unknown) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
    );
  prisma.title.findMany.mockReset().mockResolvedValue([]);
  prisma.title.delete.mockReset().mockImplementation(async () => calls.push('pg-delete'));
  prisma.review.count.mockReset().mockImplementation(async () => {
    calls.push('review-count');
    return 0;
  });
  prisma.listEntry.count.mockReset().mockImplementation(async () => {
    calls.push('list-count');
    return 0;
  });
  prisma.review.findMany.mockReset().mockImplementation(async () => {
    calls.push('review-ids');
    return [{ id: 'r1' }, { id: 'r2' }];
  });
  mongo.bodyDeleteMany.mockReset().mockImplementation(async () => calls.push('mongo-bodies'));
  mongo.replyDeleteMany.mockReset().mockImplementation(async () => calls.push('mongo-replies'));
  mongo.posterDeleteOne.mockReset().mockImplementation(async () => calls.push('mongo-poster'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  prisma.title.findUnique.mockReset().mockResolvedValue({ createdById: 'c1', status: 'PENDING' });
  prisma.title.update.mockReset().mockImplementation(async ({ where, data }) => ({
    id: where.id,
    name: 'Dune',
    mediaType: 'MOVIE',
    status: 'PENDING',
    avgRating: 0,
    reviewCount: 0,
    posterUrl: null,
    createdById: 'c1',
    description: 'Sand.',
    rejectionReason: null,
    updatedAt,
    ...data,
  }));
  prisma.title.create.mockReset().mockImplementation(async ({ data }) => ({
    id: 't1',
    status: 'PENDING',
    avgRating: 0,
    reviewCount: 0,
    posterUrl: null,
    rejectionReason: null,
    updatedAt,
    ...data,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/creator/titles', () => {
  it('needs a signed-in user', async () => {
    const res = await request(app).get('/api/creator/titles');

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findMany).not.toHaveBeenCalled();
  });

  it.each(['CONSUMER', 'ADMIN'] as const)('refuses a %s', async (role) => {
    const res = await request(app).get('/api/creator/titles').set(as('u1', role));

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findMany).not.toHaveBeenCalled();
  });

  it.each(['', '?createdById=other'])(
    'lists only the signed-in creator\'s titles, newest first (query: %s)',
    async (query) => {
      const res = await request(app).get(`/api/creator/titles${query}`).set(as());

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(prisma.title.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.title.findMany).toHaveBeenCalledWith({
        where: { createdById: 'c1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          mediaType: true,
          status: true,
          avgRating: true,
          reviewCount: true,
          posterUrl: true,
          createdById: true,
          description: true,
          rejectionReason: true,
          updatedAt: true,
        },
      });
    },
  );

  it('returns status and rejection reason for every status in database order', async () => {
    const rows = [
      { id: 't3', status: 'PENDING', rejectionReason: null },
      { id: 't2', status: 'APPROVED', rejectionReason: null },
      { id: 't1', status: 'REJECTED', rejectionReason: 'Needs more detail.' },
    ].map((fields) => ({
      name: 'Dune',
      mediaType: 'MOVIE',
      avgRating: 0,
      reviewCount: 0,
      posterUrl: null,
      createdById: 'c1',
      description: 'Sand.',
      updatedAt,
      ...fields,
    }));
    prisma.title.findMany.mockResolvedValue(rows);

    const res = await request(app).get('/api/creator/titles').set(as());

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows.map(({ posterUrl: _posterUrl, ...submission }) => ({
      ...submission, updatedAt: submission.updatedAt.toISOString(),
    })));
  });
});

describe('DELETE /api/titles/:id', () => {
  const del = (cookie = as(), id = 't1') =>
    request(app).delete(`/api/titles/${id}`).set(cookie);

  const expectNoDelete = () => {
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.review.count).not.toHaveBeenCalled();
    expect(prisma.listEntry.count).not.toHaveBeenCalled();
    expect(prisma.review.findMany).not.toHaveBeenCalled();
    expect(prisma.title.delete).not.toHaveBeenCalled();
    for (const fn of Object.values(mongo)) expect(fn).not.toHaveBeenCalled();
  };

  it('needs a signed-in user', async () => {
    const res = await request(app).delete('/api/titles/t1');

    expect(res.status).toBe(401);
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expectNoDelete();
  });

  it('refuses a consumer even when their id matches the owner', async () => {
    const res = await del(as('c1', 'CONSUMER'));

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTypeOf('string');
    expectNoDelete();
  });

  it('404 for a missing title', async () => {
    prisma.title.findUnique.mockResolvedValue(null);

    const res = await del();

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { createdById: true },
    });
    expectNoDelete();
  });

  it.each([
    ['refuses a creator who does not own it', 'someone-else'],
    ['refuses an imported title to a creator', null],
  ])('%s', async (_label, createdById) => {
    prisma.title.findUnique.mockResolvedValue({ createdById });

    const res = await del();

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTypeOf('string');
    expectNoDelete();
  });

  it('rejects an invalid title id before touching the stores', async () => {
    const res = await del(as(), 'x'.repeat(41));

    expect(res.status).toBe(400);
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expectNoDelete();
  });

  it('locks before counting, reading review ids and deleting for the owner', async () => {
    const res = await del();

    expect(res.status).toBe(204);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'lock', 'review-count', 'list-count', 'review-ids', 'pg-delete',
      'mongo-bodies', 'mongo-replies', 'mongo-poster',
    ]);
    const [sql, titleId] = prisma.$queryRaw.mock.calls[0] ?? [];
    expect((sql as string[]).join('?')).toBe('SELECT "id" FROM "Title" WHERE "id" = ? FOR UPDATE');
    expect(titleId).toBe('t1');
  });

  it('lets the owner delete', async () => {
    prisma.review.findMany.mockResolvedValue([]);

    const res = await del();

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(prisma.title.delete).toHaveBeenCalledTimes(1);
    expect(prisma.title.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(prisma.review.count).toHaveBeenCalledWith({ where: { titleId: 't1' } });
    expect(prisma.listEntry.count).toHaveBeenCalledWith({
      where: { titleId: 't1', userId: { not: 'c1' } },
    });
  });

  it('lets the owner delete when the only list entry is their own', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    const entries = [{ titleId: 't1', userId: 'c1' }];
    prisma.listEntry.count.mockImplementation(async ({ where }: {
      where: { titleId: string; userId?: { not: string } };
    }) => entries.filter((entry) =>
      entry.titleId === where.titleId && entry.userId !== where.userId?.not,
    ).length);

    const res = await del();

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(prisma.listEntry.count).toHaveBeenCalledTimes(1);
    expect(prisma.listEntry.count).toHaveBeenCalledWith({
      where: { titleId: 't1', userId: { not: 'c1' } },
    });
    expect(prisma.review.count).toHaveBeenCalledWith({ where: { titleId: 't1' } });
    expect(prisma.title.delete).toHaveBeenCalledTimes(1);
    expect(prisma.title.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it.each(['review', 'listEntry'] as const)(
    'refuses the owner when the approved title has a %s',
    async (relation) => {
      prisma.title.findUnique.mockResolvedValue({ createdById: 'c1', status: 'APPROVED' });
      prisma.review.findMany.mockResolvedValue(relation === 'review' ? [{ id: 'r1' }] : []);
      prisma[relation].count.mockResolvedValue(1);

      const res = await del();

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        'Other users have reviewed or listed this title, so it cannot be deleted by its creator. Ask an admin to remove it.',
      );
      expect(prisma[relation].count).toHaveBeenCalledWith({
        where: relation === 'listEntry'
          ? { titleId: 't1', userId: { not: 'c1' } }
          : { titleId: 't1' },
      });
      expect(prisma.title.delete).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(calls[0]).toBe('lock');
      expect(prisma.review.findMany).not.toHaveBeenCalled();
      for (const fn of Object.values(mongo)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each(['someone-else', null])('lets an admin delete a title owned by %s', async (createdById) => {
    prisma.title.findUnique.mockResolvedValue({ createdById });

    const res = await del(as('a1', 'ADMIN'));

    expect(res.status).toBe(204);
    expect(prisma.title.delete).toHaveBeenCalledTimes(1);
  });

  it('reads review ids first and removes MongoDB leftovers after the PostgreSQL delete', async () => {
    prisma.review.count.mockResolvedValue(2);
    prisma.listEntry.count.mockResolvedValue(1);

    const res = await del(as('a1', 'ADMIN'));

    expect(res.status).toBe(204);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.title.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    expect(prisma.review.count).not.toHaveBeenCalled();
    expect(prisma.listEntry.count).not.toHaveBeenCalled();
    expect(prisma.review.findMany).toHaveBeenCalledWith({
      where: { titleId: 't1' },
      select: { id: true },
    });
    expect(mongo.bodyDeleteMany).toHaveBeenCalledWith({ titleId: 't1' });
    expect(mongo.replyDeleteMany).toHaveBeenCalledWith({ reviewId: { $in: ['r1', 'r2'] } });
    expect(mongo.posterDeleteOne).toHaveBeenCalledWith({ _id: 't1' });
    expect(calls).toEqual([
      'lock', 'review-ids', 'pg-delete', 'mongo-bodies', 'mongo-replies', 'mongo-poster',
    ]);
  });

  it('skips deleting replies when there are no review ids', async () => {
    prisma.review.findMany.mockResolvedValue([]);

    const res = await del();

    expect(res.status).toBe(204);
    expect(mongo.replyDeleteMany).not.toHaveBeenCalled();
    expect(mongo.bodyDeleteMany).toHaveBeenCalledWith({ titleId: 't1' });
    expect(mongo.posterDeleteOne).toHaveBeenCalledWith({ _id: 't1' });
  });

  it.each(['bodyDeleteMany', 'replyDeleteMany', 'posterDeleteOne'] as const)(
    'a MongoDB failure in %s does not fail the delete or skip other cleanup',
    async (method) => {
      const error = new Error('mongo is down');
      mongo[method].mockRejectedValue(error);

      const res = await del();

      expect(res.status).toBe(204);
      expect(prisma.title.delete).toHaveBeenCalledTimes(1);
      for (const fn of Object.values(mongo)) expect(fn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
    },
  );

  it('does not delete anything when reading review ids fails', async () => {
    prisma.review.findMany.mockRejectedValue(new Error('PostgreSQL is down'));

    const res = await del();

    expect(res.status).toBe(500);
    expect(prisma.title.delete).not.toHaveBeenCalled();
    for (const fn of Object.values(mongo)) expect(fn).not.toHaveBeenCalled();
  });

  it('answers 404 without MongoDB cleanup when the title vanishes before deletion', async () => {
    prisma.title.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
    );

    const res = await del();

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Title not found' });
    expect(prisma.title.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.title.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    for (const fn of Object.values(mongo)) expect(fn).not.toHaveBeenCalled();
  });

  it('does not clear MongoDB leftovers when the PostgreSQL delete fails', async () => {
    prisma.title.delete.mockRejectedValue(new Error('PostgreSQL is down'));

    const res = await del();

    expect(res.status).toBe(500);
    for (const fn of Object.values(mongo)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/titles/:id', () => {
  const patch = (body: unknown, cookie = as(), id = 't1') =>
    request(app)
      .patch(`/api/titles/${id}`)
      .set(cookie)
      .send(body as object);

  it('needs a signed-in user', async () => {
    const res = await request(app).patch('/api/titles/t1').send({ name: 'Dune Messiah' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
  });

  it.each(['CONSUMER', 'ADMIN'] as const)('refuses a %s', async (role) => {
    const res = await patch({ name: 'Dune Messiah' }, as('c1', role));

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
  });

  it('404 for a missing title', async () => {
    prisma.title.findUnique.mockResolvedValue(null);

    const res = await patch({ name: 'Dune Messiah' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { createdById: true, status: true },
    });
    expect(prisma.title.update).not.toHaveBeenCalled();
  });

  it('answers 404 when the title vanishes before updating', async () => {
    prisma.title.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'test' }),
    );

    const res = await patch({ name: 'Dune Messiah' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Title not found' });
    expect(prisma.title.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.title.update).toHaveBeenCalledTimes(1);
  });

  it('keeps unexpected update failures as server errors', async () => {
    prisma.title.update.mockRejectedValue(new Error('PostgreSQL is down'));

    const res = await patch({ name: 'Dune Messiah' });

    expect(res.status).toBe(500);
  });

  it.each([
    ['refuses a creator who is not the owner', 'someone-else'],
    ['an imported title (no owner) cannot be edited', null],
  ])('%s', async (_label, createdById) => {
    prisma.title.findUnique.mockResolvedValue({ createdById, status: 'APPROVED' });

    const res = await patch({ name: 'Dune Messiah' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.update).not.toHaveBeenCalled();
  });

  it.each([
    ['APPROVED', null],
    ['REJECTED', 'Needs more detail.'],
  ])('editing a %s title resubmits it and clears the reason', async (status, rejectionReason) => {
    prisma.title.findUnique.mockResolvedValue({ createdById: 'c1', status, rejectionReason });

    const res = await patch({ name: '  Dune Messiah  ' });

    expect(res.status).toBe(200);
    expect(prisma.title.update).toHaveBeenCalledTimes(1);
    const args = prisma.title.update.mock.calls[0]?.[0];
    expect(args.where).toEqual({ id: 't1' });
    expect(args.data).toEqual({
      name: 'Dune Messiah',
      status: 'PENDING',
      rejectionReason: null,
    });
    expect(res.body).toMatchObject({ name: 'Dune Messiah', status: 'PENDING', rejectionReason: null });
  });

  it('editing a PENDING title keeps it PENDING and changes only what was sent', async () => {
    const res = await patch({ description: '  More sand.  ' });

    expect(res.status).toBe(200);
    expect(prisma.title.update).toHaveBeenCalledTimes(1);
    expect(prisma.title.update.mock.calls[0]?.[0].data).toEqual({
      description: 'More sand.',
      status: 'PENDING',
      rejectionReason: null,
    });
    expect(res.body).toMatchObject({
      name: 'Dune', description: 'More sand.', status: 'PENDING', rejectionReason: null,
    });
  });

  it('stores an empty description as none', async () => {
    const res = await patch({ description: '   ' });

    expect(res.status).toBe(200);
    expect(prisma.title.update.mock.calls[0]?.[0].data.description).toBeNull();
    expect(res.body.description).toBeNull();
  });

  it.each([
    ['a supplied media type', { mediaType: 'BOOK' }],
    ['a supplied status', { status: 'APPROVED' }],
    ['an empty body', {}],
    ['a whitespace-only name', { name: '   ' }],
    ['a name of 201 characters', { name: 'x'.repeat(201) }],
    ['a description of 5001 characters', { description: 'x'.repeat(5001) }],
    ['an unknown key', { name: 'Dune', extra: true }],
  ])('rejects %s with 400 and writes nothing', async (_label, payload) => {
    const res = await patch(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid title id with 400 and writes nothing', async () => {
    const res = await patch({ name: 'Dune' }, as(), 'x'.repeat(41));

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
  });
});

describe('POST /api/titles', () => {
  const post = (body: unknown, cookie = as()) =>
    request(app)
      .post('/api/titles')
      .set(cookie)
      .send(body as object);

  it('needs a signed-in user', async () => {
    const res = await request(app)
      .post('/api/titles')
      .send({ name: 'Dune', mediaType: 'MOVIE' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.create).not.toHaveBeenCalled();
  });

  it.each(['CONSUMER', 'ADMIN'] as const)('refuses a %s', async (role) => {
    const res = await post({ name: 'Dune', mediaType: 'MOVIE' }, as('u1', role));

    expect(res.status).toBe(403);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.create).not.toHaveBeenCalled();
  });

  it('creates a PENDING title owned by the creator', async () => {
    const res = await post({ name: '  Dune  ', mediaType: 'MOVIE', description: 'Sand.' });

    expect(res.status).toBe(201);
    expect(prisma.title.create).toHaveBeenCalledTimes(1);
    const args = prisma.title.create.mock.calls[0]?.[0];
    expect(args.data).toMatchObject({
      name: 'Dune',
      mediaType: 'MOVIE',
      description: 'Sand.',
      createdById: 'c1',
    });
    expect([undefined, 'PENDING']).toContain(args.data.status);
    expect(args.select).toEqual({
      id: true,
      name: true,
      mediaType: true,
      status: true,
      avgRating: true,
      reviewCount: true,
      posterUrl: true,
      createdById: true,
      description: true,
      rejectionReason: true,
      updatedAt: true,
    });
    expect(res.body).toEqual({
      id: 't1',
      name: 'Dune',
      mediaType: 'MOVIE',
      status: 'PENDING',
      avgRating: 0,
      reviewCount: 0,
      createdById: 'c1',
      description: 'Sand.',
      rejectionReason: null,
      updatedAt: updatedAt.toISOString(),
    });
  });

  it.each(['   ', undefined])('stores an empty or omitted description as none (%s)', async (description) => {
    const res = await post({ name: 'Dune', mediaType: 'MOVIE', description });

    expect(res.status).toBe(201);
    expect(prisma.title.create.mock.calls[0]?.[0].data.description).toBeNull();
    expect(res.body.description).toBeNull();
  });

  it.each([
    ['a whitespace-only name', { name: '   ', mediaType: 'MOVIE' }],
    ['a name of 201 characters', { name: 'x'.repeat(201), mediaType: 'MOVIE' }],
    ['a description of 5001 characters', { name: 'Dune', mediaType: 'MOVIE', description: 'x'.repeat(5001) }],
    ['an unknown media type', { name: 'Dune', mediaType: 'PODCAST' }],
    ['a supplied status', { name: 'Dune', mediaType: 'MOVIE', status: 'APPROVED' }],
    ['a supplied owner', { name: 'Dune', mediaType: 'MOVIE', createdById: 'x' }],
  ])('rejects %s with 400 and writes nothing', async (_label, payload) => {
    const res = await post(payload);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.create).not.toHaveBeenCalled();
  });
});
