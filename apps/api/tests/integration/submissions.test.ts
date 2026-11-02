import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No database: check the create arguments and return the selected title fields.
const prisma = { title: { create: vi.fn() } };
vi.mock('../../src/db/prisma.js', () => ({ prisma }));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

const as = (id = 'c1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'CREATOR') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

beforeEach(() => {
  prisma.title.create.mockReset().mockImplementation(async ({ data }) => ({
    id: 't1',
    status: 'PENDING',
    avgRating: 0,
    reviewCount: 0,
    posterUrl: null,
    rejectionReason: null,
    ...data,
  }));
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
