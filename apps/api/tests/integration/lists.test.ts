import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Prisma } from '@prisma/client';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No database in CI: Prisma is replaced and the tests check what the module asks of it.
const prisma = {
  title: { findFirst: vi.fn() },
  listEntry: {
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
};
vi.mock('../../src/db/prisma.js', () => ({ prisma }));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

const as = (id = 'u1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'CONSUMER') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  titleId: 't1',
  status: 'PLAN_TO',
  title: {
    id: 't1',
    name: 'Dune',
    mediaType: 'BOOK',
    status: 'APPROVED',
    avgRating: 4,
    reviewCount: 2,
    posterUrl: null,
    createdById: null,
  },
  ...over,
});

const firstArgs = (fn: typeof prisma.listEntry.findMany) => {
  const call = fn.mock.calls[0];
  if (!call) throw new Error('expected a Prisma call, got none');
  return call[0];
};

beforeEach(() => {
  for (const group of [prisma.title, prisma.listEntry]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  prisma.$transaction
    .mockReset()
    .mockImplementation(async (arg: unknown) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
    );
});

describe('every list route', () => {
  it.each([
    ['get', '/api/me/lists'],
    ['get', '/api/me/lists/by-title/t1'],
    ['post', '/api/me/lists'],
    ['patch', '/api/me/lists/e1'],
    ['delete', '/api/me/lists/e1'],
  ] as const)('needs a signed-in user: %s %s', async (method, path) => {
    const res = await request(app)[method](path).send({});

    expect(res.status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/me/lists', () => {
  beforeEach(() => {
    prisma.listEntry.findMany.mockResolvedValue([entry()]);
    prisma.listEntry.count.mockResolvedValue(30);
  });

  it('returns only the signed-in user’s approved entries, newest first, one page at a time', async () => {
    const res = await request(app).get('/api/me/lists?page=2&pageSize=5').set(as('u7'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 5, total: 30 });
    expect(firstArgs(prisma.listEntry.findMany)).toMatchObject({
      where: { userId: 'u7', title: { status: 'APPROVED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 5,
      take: 5,
    });
    expect(firstArgs(prisma.listEntry.count).where).toEqual({
      userId: 'u7',
      title: { status: 'APPROVED' },
    });
  });

  it('maps each entry to the id, status and a title summary', async () => {
    const res = await request(app).get('/api/me/lists').set(as());

    expect(res.body.data[0]).toEqual({
      id: 'e1',
      titleId: 't1',
      status: 'PLAN_TO',
      title: {
        id: 't1',
        name: 'Dune',
        mediaType: 'BOOK',
        status: 'APPROVED',
        avgRating: 4,
        reviewCount: 2,
        createdById: null,
      },
    });
  });

  it('filters by status and by the title’s media type', async () => {
    await request(app).get('/api/me/lists?status=COMPLETED&mediaType=MOVIE').set(as());

    expect(firstArgs(prisma.listEntry.findMany).where).toEqual({
      userId: 'u1',
      status: 'COMPLETED',
      title: { status: 'APPROVED', mediaType: 'MOVIE' },
    });
  });

  it('treats empty filters as not given and defaults to 12 per page', async () => {
    const res = await request(app).get('/api/me/lists?status=&mediaType=').set(as());

    expect(res.status).toBe(200);
    expect(firstArgs(prisma.listEntry.findMany)).toMatchObject({
      where: { userId: 'u1', title: { status: 'APPROVED' } },
      skip: 0,
      take: 12,
    });
  });

  it.each([
    ['an unknown status', 'status=DONE'],
    ['an unknown media type', 'mediaType=GAME'],
    ['a page size over 50', 'pageSize=51'],
    ['page 0', 'page=0'],
  ])('rejects %s with 400', async (_label, qs) => {
    const res = await request(app).get(`/api/me/lists?${qs}`).set(as());

    expect(res.status).toBe(400);
    expect(prisma.listEntry.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/me/lists/by-title/:titleId', () => {
  it('returns null when the title is not on the user’s list', async () => {
    prisma.listEntry.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/me/lists/by-title/t1').set(as('u3'));

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(firstArgs(prisma.listEntry.findFirst).where).toEqual({
      userId: 'u3',
      titleId: 't1',
      title: { status: 'APPROVED' },
    });
  });

  it('returns the entry when it is', async () => {
    prisma.listEntry.findFirst.mockResolvedValue(entry());

    const res = await request(app).get('/api/me/lists/by-title/t1').set(as());

    expect(res.body).toMatchObject({ id: 'e1', status: 'PLAN_TO' });
  });
});

describe('POST /api/me/lists', () => {
  const post = (body: unknown, cookie = as()) =>
    request(app)
      .post('/api/me/lists')
      .set(cookie)
      .send(body as object);

  beforeEach(() => {
    prisma.title.findFirst.mockResolvedValue({ id: 't1' });
    prisma.listEntry.findUnique.mockResolvedValue(null);
    prisma.listEntry.create.mockResolvedValue(entry());
  });

  it.each([
    ['an unknown status', { titleId: 't1', status: 'DONE' }],
    ['no status', { titleId: 't1' }],
    ['no title', { status: 'PLAN_TO' }],
    ['an extra key', { titleId: 't1', status: 'PLAN_TO', userId: 'someone-else' }],
  ])('rejects %s with 400', async (_label, payload) => {
    const res = await post(payload);

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 404 for a title that is missing or not approved', async () => {
    prisma.title.findFirst.mockResolvedValue(null);

    const res = await post({ titleId: 't1', status: 'PLAN_TO' });

    expect(res.status).toBe(404);
    expect(firstArgs(prisma.title.findFirst).where).toEqual({ id: 't1', status: 'APPROVED' });
    expect(prisma.listEntry.create).not.toHaveBeenCalled();
  });

  it('answers 409 when the title is already on the list', async () => {
    prisma.listEntry.findUnique.mockResolvedValue({ id: 'e1' });

    const res = await post({ titleId: 't1', status: 'PLAN_TO' });

    expect(res.status).toBe(409);
    expect(prisma.listEntry.create).not.toHaveBeenCalled();
  });

  it('answers 409, not 500, when a second tap races past the check', async () => {
    prisma.listEntry.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const res = await post({ titleId: 't1', status: 'PLAN_TO' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This title is already on your list');
  });

  it('adds the entry for the signed-in user, in one transaction', async () => {
    const res = await post({ titleId: 't1', status: 'IN_PROGRESS' }, as('u9'));

    expect(res.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(firstArgs(prisma.listEntry.create).data).toEqual({
      userId: 'u9',
      titleId: 't1',
      status: 'IN_PROGRESS',
    });
    expect(res.body).toMatchObject({ id: 'e1', titleId: 't1' });
  });

  it.each([
    ['an admin', as('a1', 'ADMIN')],
    ['a creator', as('c1', 'CREATOR')],
  ])('lets %s keep a list too', async (_who, cookie) => {
    expect((await post({ titleId: 't1', status: 'PLAN_TO' }, cookie)).status).toBe(201);
  });
});

describe('PATCH /api/me/lists/:id', () => {
  const patch = (body: unknown, cookie = as()) =>
    request(app)
      .patch('/api/me/lists/e1')
      .set(cookie)
      .send(body as object);

  beforeEach(() => {
    prisma.listEntry.findFirst.mockResolvedValue({ id: 'e1' });
    prisma.listEntry.update.mockResolvedValue(entry({ status: 'COMPLETED' }));
  });

  it('rejects a bad status and extra keys with 400', async () => {
    expect((await patch({ status: 'DONE' })).status).toBe(400);
    expect((await patch({ status: 'COMPLETED', titleId: 't2' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 404 for an entry that is not the user’s, the same as one that does not exist', async () => {
    prisma.listEntry.findFirst.mockResolvedValue(null);

    const res = await patch({ status: 'COMPLETED' }, as('u2'));

    expect(res.status).toBe(404);
    expect(firstArgs(prisma.listEntry.findFirst).where).toEqual({ id: 'e1', userId: 'u2' });
    expect(prisma.listEntry.update).not.toHaveBeenCalled();
  });

  it('changes the status in one transaction', async () => {
    const res = await patch({ status: 'COMPLETED' });

    expect(res.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(firstArgs(prisma.listEntry.update)).toMatchObject({
      where: { id: 'e1' },
      data: { status: 'COMPLETED' },
    });
    expect(res.body.status).toBe('COMPLETED');
  });
});

describe('DELETE /api/me/lists/:id', () => {
  const del = (cookie = as()) => request(app).delete('/api/me/lists/e1').set(cookie);

  it('removes only the user’s own entry', async () => {
    prisma.listEntry.deleteMany.mockResolvedValue({ count: 1 });

    const res = await del(as('u5'));

    expect(res.status).toBe(204);
    expect(firstArgs(prisma.listEntry.deleteMany).where).toEqual({ id: 'e1', userId: 'u5' });
  });

  it('answers 404 when nothing of theirs matched', async () => {
    prisma.listEntry.deleteMany.mockResolvedValue({ count: 0 });

    expect((await del()).status).toBe(404);
  });
});
