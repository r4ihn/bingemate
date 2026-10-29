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
const app = createApp();

const row = (mediaType: string, genre_id: string, name: string, title_count: number) => ({
  mediaType,
  genre_id,
  name,
  title_count,
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

describe('GET /api/genres', () => {
  it('is public and reads the genre_filter_options view without a type filter', async () => {
    const res = await request(app).get('/api/genres');

    expect(res.status).toBe(200);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const { text, values } = sentSql();
    expect(text).toContain('"genre_filter_options"');
    expect(text).not.toContain('WHERE');
    expect(values).toEqual([]);
  });

  it('answers an empty list when no genre qualifies', async () => {
    const res = await request(app).get('/api/genres');

    expect(res.body).toEqual([]);
  });

  it('filters by media type with a bound parameter, not string concatenation', async () => {
    prisma.$queryRaw.mockResolvedValue([row('BOOK', 'g1', 'Fantasy', 7)]);

    const res = await request(app).get('/api/genres?type=BOOK');

    expect(res.status).toBe(200);
    const { text, values } = sentSql();
    expect(text).toContain('WHERE "mediaType" = ?');
    expect(values).toEqual(['BOOK']);
    expect(res.body).toEqual([{ id: 'g1', name: 'Fantasy', titleCount: 7 }]);
  });

  it.each(['MOVIE', 'BOOK', 'TV_SHOW'])('accepts type=%s', async (type) => {
    const res = await request(app).get(`/api/genres?type=${type}`);

    expect(res.status).toBe(200);
    expect(sentSql().values).toEqual([type]);
  });

  it('treats an empty type as not given', async () => {
    const res = await request(app).get('/api/genres?type=');

    expect(res.status).toBe(200);
    expect(sentSql().values).toEqual([]);
  });

  it('rejects an unknown type with 400 without querying', async () => {
    const res = await request(app).get('/api/genres?type=PODCAST');

    expect(res.status).toBe(400);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a lower-case type, the enum is exact', async () => {
    const res = await request(app).get('/api/genres?type=movie');

    expect(res.status).toBe(400);
  });

  it('merges the same genre across media types by summing counts', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('MOVIE', 'g1', 'Drama', 10),
      row('BOOK', 'g1', 'Drama', 5),
      row('TV_SHOW', 'g1', 'Drama', 2),
      row('MOVIE', 'g2', 'Comedy', 3),
    ]);

    const res = await request(app).get('/api/genres');

    expect(res.body).toEqual([
      { id: 'g1', name: 'Drama', titleCount: 17 },
      { id: 'g2', name: 'Comedy', titleCount: 3 },
    ]);
  });

  it('orders most titles first, then by name', async () => {
    prisma.$queryRaw.mockResolvedValue([
      row('MOVIE', 'g3', 'Thriller', 5),
      row('MOVIE', 'g1', 'Action', 5),
      row('MOVIE', 'g2', 'Zombie', 9),
      row('MOVIE', 'g4', 'Comedy', 5),
    ]);

    const res = await request(app).get('/api/genres?type=MOVIE');

    expect(res.body.map((g: { name: string }) => g.name)).toEqual([
      'Zombie',
      'Action',
      'Comedy',
      'Thriller',
    ]);
  });

  it('turns bigint counts from the driver into plain numbers', async () => {
    prisma.$queryRaw.mockResolvedValue([row('MOVIE', 'g1', 'Drama', 6n as unknown as number)]);

    const res = await request(app).get('/api/genres');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'g1', name: 'Drama', titleCount: 6 }]);
  });
});
