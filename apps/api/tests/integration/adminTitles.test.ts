import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No databases: check the query arguments and return the selected title fields.
const prisma = {
  title: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  $transaction: vi.fn(),
};
vi.mock('../../src/db/prisma.js', () => ({ prisma }));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

const as = (id = 'a1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'ADMIN') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

const updatedAt = '2026-11-02T01:02:03.456Z';
const savedUpdatedAt = '2026-11-02T01:03:00.000Z';

const submission = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Dune',
  mediaType: 'MOVIE',
  status: 'PENDING',
  avgRating: 0,
  reviewCount: 0,
  createdById: 'c1',
  description: 'Sand.',
  rejectionReason: null,
  updatedAt,
  ...over,
});

const select = {
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
};

beforeEach(() => {
  for (const fn of Object.values(prisma.title)) fn.mockReset();
  prisma.title.findMany.mockResolvedValue([{ ...submission(), posterUrl: null, updatedAt: new Date(updatedAt) }]);
  prisma.title.count.mockResolvedValue(31);
  prisma.title.findUnique.mockResolvedValue({ id: 't1' });
  prisma.title.findUniqueOrThrow.mockResolvedValue({
    ...submission(), posterUrl: null, updatedAt: new Date(savedUpdatedAt),
  });
  prisma.title.updateMany.mockImplementation(async ({ where, data }) => {
    prisma.title.findUniqueOrThrow.mockResolvedValue({
      ...submission(),
      posterUrl: null,
      id: where.id,
      ...data,
      updatedAt: new Date(savedUpdatedAt),
    });
    return { count: 1 };
  });
  prisma.$transaction
    .mockReset()
    .mockImplementation(async (queries: Promise<unknown>[]) => Promise.all(queries));
});

describe('admin title route authorization', () => {
  it.each([
    ['get', '/api/admin/titles'],
    ['patch', '/api/admin/titles/t1/status'],
  ] as const)('needs a signed-in user: %s %s', async (method, path) => {
    const res = await request(app)[method](path).send({ status: 'APPROVED', updatedAt });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeTypeOf('string');
    for (const fn of Object.values(prisma.title)) expect(fn).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['CONSUMER', 'CREATOR'] as const)('refuses a %s on both routes', async (role) => {
    const list = await request(app).get('/api/admin/titles').set(as('u1', role));
    const patch = await request(app)
      .patch('/api/admin/titles/t1/status')
      .set(as('u1', role))
      .send({ status: 'APPROVED', updatedAt });

    for (const res of [list, patch]) {
      expect(res.status).toBe(403);
      expect(res.body.error).toBeTypeOf('string');
    }
    for (const fn of Object.values(prisma.title)) expect(fn).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/titles', () => {
  it('defaults to PENDING, page 1 and 20 rows, oldest first with an id tie-break', async () => {
    const res = await request(app).get('/api/admin/titles').set(as());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [submission()], page: 1, pageSize: 20, total: 31 });
    expect(prisma.title.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      select,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(prisma.title.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      prisma.title.findMany.mock.results[0]?.value,
      prisma.title.count.mock.results[0]?.value,
    ]);
  });

  it('paginates the filtered REJECTED queue', async () => {
    const rejected = submission({ status: 'REJECTED', rejectionReason: 'Needs detail.' });
    prisma.title.findMany.mockResolvedValue([{ ...rejected, posterUrl: '/poster.jpg', updatedAt: new Date(updatedAt) }]);

    const res = await request(app)
      .get('/api/admin/titles?status=REJECTED&page=2&pageSize=5')
      .set(as());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [{ ...rejected, posterUrl: '/poster.jpg' }],
      page: 2,
      pageSize: 5,
      total: 31,
    });
    expect(prisma.title.findMany).toHaveBeenCalledWith({
      where: { status: 'REJECTED' },
      select,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: 5,
      take: 5,
    });
    expect(prisma.title.count).toHaveBeenCalledWith({ where: { status: 'REJECTED' } });
  });

  it.each(['status=bogus', 'pageSize=500', 'page=0'])(
    'rejects invalid query %s before querying',
    async (query) => {
      const res = await request(app).get(`/api/admin/titles?${query}`).set(as());

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTypeOf('string');
      expect(prisma.title.findMany).not.toHaveBeenCalled();
      expect(prisma.title.count).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});

describe('PATCH /api/admin/titles/:id/status', () => {
  const patch = (body: unknown, id = 't1') =>
    request(app)
      .patch(`/api/admin/titles/${id}/status`)
      .set(as())
      .send(body as object);

  it('approves and clears the rejection reason even if one is sent', async () => {
    const res = await patch({ updatedAt, status: 'APPROVED', rejectionReason: 'Ignore this.' });

    expect(res.status).toBe(200);
    expect(prisma.title.findUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { id: true },
    });
    expect(prisma.title.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.title.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', updatedAt: new Date(updatedAt) },
      data: { status: 'APPROVED', rejectionReason: null },
    });
    expect(prisma.title.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.title.updateMany.mock.invocationCallOrder[0]!,
    );
    expect(prisma.title.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(prisma.title.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 't1' }, select });
    expect(prisma.title.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.title.findUniqueOrThrow.mock.invocationCallOrder[0]!,
    );
    expect(prisma.title.update).not.toHaveBeenCalled();
    expect(res.body).toEqual(submission({ status: 'APPROVED', updatedAt: savedUpdatedAt }));
  });

  it('rejects and stores the trimmed reason', async () => {
    const res = await patch({ updatedAt, status: 'REJECTED', rejectionReason: '  Needs more detail.  ' });

    expect(res.status).toBe(200);
    expect(prisma.title.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', updatedAt: new Date(updatedAt) },
      data: { status: 'REJECTED', rejectionReason: 'Needs more detail.' },
    });
    expect(prisma.title.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 't1' }, select });
    expect(res.body).toEqual(
      submission({
        status: 'REJECTED',
        updatedAt: savedUpdatedAt,
        rejectionReason: 'Needs more detail.',
      }),
    );
  });

  it('allows rejection without a reason', async () => {
    const res = await patch({ updatedAt, status: 'REJECTED' });

    expect(res.status).toBe(200);
    expect(prisma.title.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', updatedAt: new Date(updatedAt) },
      data: { status: 'REJECTED', rejectionReason: null },
    });
    expect(prisma.title.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 't1' }, select });
  });

  it.each([
    ['PENDING', { status: 'PENDING' }],
    ['an unknown status', { status: 'bogus' }],
    ['a 501-character reason', { status: 'REJECTED', rejectionReason: 'x'.repeat(501) }],
    ['an extra key', { status: 'APPROVED', name: 'Changed' }],
    ['a missing status', {}],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const res = await patch({ updatedAt, ...body });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expect(prisma.title.updateMany).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
    expect(prisma.title.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing updatedAt', { status: 'APPROVED' }],
    ['an invalid updatedAt', { status: 'APPROVED', updatedAt: 'not-a-date' }],
  ])('rejects %s with 400 and writes nothing', async (_label, body) => {
    const res = await patch(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTypeOf('string');
    for (const fn of Object.values(prisma.title)) expect(fn).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 409 when the title changed and makes no further writes', async () => {
    prisma.title.updateMany.mockResolvedValue({ count: 0 });

    const res = await patch({ status: 'APPROVED', updatedAt });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'This title changed after you opened it. Reload the queue and review it again.',
    });
    expect(prisma.title.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.title.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.title.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', updatedAt: new Date(updatedAt) },
      data: { status: 'APPROVED', rejectionReason: null },
    });
    expect(prisma.title.update).not.toHaveBeenCalled();
    expect(prisma.title.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.title.findMany).not.toHaveBeenCalled();
    expect(prisma.title.count).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing title without writing', async () => {
    prisma.title.findUnique.mockResolvedValue(null);

    const res = await patch({ updatedAt, status: 'APPROVED' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTypeOf('string');
    expect(prisma.title.findUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      select: { id: true },
    });
    expect(prisma.title.updateMany).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
    expect(prisma.title.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('rejects an invalid title id before reading or writing', async () => {
    const res = await patch({ updatedAt, status: 'APPROVED' }, 'x'.repeat(41));

    expect(res.status).toBe(400);
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expect(prisma.title.updateMany).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
    expect(prisma.title.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
