import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No databases in CI: both stores are replaced and the tests check what the module asks of them.
const prisma = {
  user: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  review: { findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
};
const mongoFind = vi.fn();
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/reviewBody.model.js', () => ({
  ReviewBody: { find: (q: unknown) => ({ lean: () => mongoFind(q) }) },
  MovieReviewBody: {},
  BookReviewBody: {},
  TvShowReviewBody: {},
}));
vi.mock('../../src/mongo/models/reply.model.js', () => ({ Reply: {} }));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

type RoleName = 'MEMBER' | 'ADMIN';
const as = (id = 'a1', role: RoleName = 'ADMIN') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role, username: null })}`,
});

beforeEach(() => {
  for (const group of [prisma.user, prisma.review]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  prisma.$transaction.mockReset().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  mongoFind.mockReset().mockResolvedValue([]);
});

const routes = [
  ['get', '/api/admin/users'],
  ['patch', '/api/admin/users/u2/role'],
  ['get', '/api/admin/reviews'],
] as const;

describe('admin route access', () => {
  it.each(routes)('%s %s needs a signed-in user', async (method, path) => {
    const res = await request(app)[method](path).send({ role: 'MEMBER' });
    expect(res.status).toBe(401);
  });

  it.each(routes)('%s %s refuses a MEMBER with 403', async (method, path) => {
    const res = await request(app)[method](path).set(as('u1', 'MEMBER')).send({ role: 'MEMBER' });
    expect(res.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/users', () => {
  it('returns a page of { id, email, role }', async () => {
    const users = [{ id: 'u1', email: 'u1@example.com', role: 'MEMBER' }];
    prisma.user.findMany.mockResolvedValue(users);
    prisma.user.count.mockResolvedValue(21);

    const res = await request(app).get('/api/admin/users?page=3&pageSize=5').set(as());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: users, page: 3, pageSize: 5, total: 21 });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, email: true, role: true },
        skip: 10,
        take: 5,
      }),
    );
  });

  it('rejects a bad page with 400', async () => {
    const res = await request(app).get('/api/admin/users?page=0').set(as());
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('changes another user’s role and returns the updated user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
    prisma.user.update.mockResolvedValue({ id: 'u2', email: 'u2@example.com', role: 'MEMBER' });

    const res = await request(app)
      .patch('/api/admin/users/u2/role')
      .set(as())
      .send({ role: 'MEMBER' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u2', email: 'u2@example.com', role: 'MEMBER' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u2' }, data: { role: 'MEMBER' } }),
    );
  });

  it('refuses to change your own role with 400', async () => {
    const res = await request(app)
      .patch('/api/admin/users/a1/role')
      .set(as('a1'))
      .send({ role: 'MEMBER' });

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/admin/users/nope/role')
      .set(as())
      .send({ role: 'MEMBER' });

    expect(res.status).toBe(404);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([{ role: 'SUPERUSER' }, {}, { role: 'ADMIN', extra: 1 }])(
    'rejects body %j with 400',
    async (body) => {
      const res = await request(app).patch('/api/admin/users/u2/role').set(as()).send(body);
      expect(res.status).toBe(400);
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );
});

describe('GET /api/admin/reviews', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    titleId: 't1',
    userId: 'u1',
    rating: 4,
    createdAt: new Date('2026-10-01T10:00:00Z'),
    user: { id: 'u1', username: 'maya_r', role: 'MEMBER' },
    title: { name: 'Dune' },
    ...over,
  });

  it('joins title names and MongoDB bodies, newest first, across all titles', async () => {
    prisma.review.findMany.mockResolvedValue([
      row(),
      row({
        id: 'r2',
        titleId: 't9',
        user: { id: 'u7', username: null, role: 'MEMBER' },
        title: { name: 'Hidden' },
      }),
    ]);
    prisma.review.count.mockResolvedValue(2);
    mongoFind.mockResolvedValue([{ _id: 'r1', body: 'Great sand.' }]);

    const res = await request(app).get('/api/admin/reviews').set(as());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
      data: [
        {
          id: 'r1',
          titleId: 't1',
          titleName: 'Dune',
          author: { id: 'u1', name: 'maya_r' },
          rating: 4,
          body: 'Great sand.',
          createdAt: '2026-10-01T10:00:00.000Z',
        },
        expect.objectContaining({
          id: 'r2',
          titleName: 'Hidden',
          author: { id: 'u7', name: 'user-u7' },
          body: '',
        }),
      ],
    });
    const query = prisma.review.findMany.mock.calls[0]?.[0];
    expect(query.where).toBeUndefined();
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('skips MongoDB when the page is empty', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(0);

    const res = await request(app).get('/api/admin/reviews?page=4').set(as());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(mongoFind).not.toHaveBeenCalled();
  });
});
