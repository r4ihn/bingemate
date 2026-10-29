import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No database in CI: Prisma is replaced and the tests check what the module asks of it.
const prisma = { $queryRaw: vi.fn() };
vi.mock('../../src/db/prisma.js', () => ({ prisma }));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

const as = (id = 'c1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'CREATOR') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

const row = (over: Record<string, unknown> = {}) => ({
  creator_id: 'c1',
  title_id: 't1',
  name: 'Dune',
  status: 'APPROVED',
  review_count: 3,
  avg_rating: 4.5,
  list_adds: 8,
  ...over,
});

/** The Prisma.Sql the service handed to $queryRaw: its text and bound parameters. */
const sentSql = () => {
  const call = prisma.$queryRaw.mock.calls[0];
  if (!call) throw new Error('expected a $queryRaw call, got none');
  const sql = call[0] as { sql: string; values: unknown[] };
  return { text: sql.sql, values: sql.values };
};

beforeEach(() => {
  prisma.$queryRaw.mockReset().mockResolvedValue([]);
});

describe('GET /api/creator/stats access', () => {
  it('needs a signed-in user', async () => {
    const res = await request(app).get('/api/creator/stats');

    expect(res.status).toBe(401);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each(['CONSUMER', 'ADMIN'] as const)('refuses a %s with 403', async (role) => {
    const res = await request(app).get('/api/creator/stats').set(as('u1', role));

    expect(res.status).toBe(403);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('GET /api/creator/stats', () => {
  it('reads the creator_title_stats view scoped to the signed-in creator by a bound parameter', async () => {
    const res = await request(app).get('/api/creator/stats').set(as('c42'));

    expect(res.status).toBe(200);
    const { text, values } = sentSql();
    expect(text).toContain('"creator_title_stats"');
    expect(text).toContain('WHERE "creator_id" = ?');
    expect(values).toEqual(['c42']);
  });

  it('cannot be pointed at another creator through the query string', async () => {
    await request(app).get('/api/creator/stats?creatorId=c99&creator_id=c99').set(as('c1'));

    expect(sentSql().values).toEqual(['c1']);
  });

  it('asks for rows sorted by name, then title id', async () => {
    await request(app).get('/api/creator/stats').set(as());

    expect(sentSql().text).toContain('ORDER BY "name" ASC, "title_id" ASC');
  });

  it('answers an empty list for a creator with no titles', async () => {
    const res = await request(app).get('/api/creator/stats').set(as());

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('maps view columns to the response shape, in the order the database gave', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row({ title_id: 't1', name: 'Alien' }),
      row({
        title_id: 't2',
        name: 'Dune',
        status: 'PENDING',
        review_count: 0,
        avg_rating: 0,
        list_adds: 0,
      }),
    ]);

    const res = await request(app).get('/api/creator/stats').set(as());

    expect(res.body).toEqual([
      {
        titleId: 't1',
        name: 'Alien',
        status: 'APPROVED',
        reviewCount: 3,
        avgRating: 4.5,
        listAdds: 8,
      },
      { titleId: 't2', name: 'Dune', status: 'PENDING', reviewCount: 0, avgRating: 0, listAdds: 0 },
    ]);
  });

  it('never leaks the creator id column', async () => {
    prisma.$queryRaw.mockResolvedValue([row()]);

    const res = await request(app).get('/api/creator/stats').set(as());

    expect(Object.keys(res.body[0]).sort()).toEqual([
      'avgRating',
      'listAdds',
      'name',
      'reviewCount',
      'status',
      'titleId',
    ]);
  });

  it('turns bigint and numeric-string values from the driver into plain numbers', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row({ review_count: 3n, list_adds: 8n, avg_rating: '4.25' }),
    ]);

    const res = await request(app).get('/api/creator/stats').set(as());

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ reviewCount: 3, listAdds: 8, avgRating: 4.25 });
  });
});
