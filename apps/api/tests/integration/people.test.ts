import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No database here: the graph query itself is covered by tests/real/people.real.ts.
const prisma = {
  $queryRaw: vi.fn(),
  person: { count: vi.fn(), findUnique: vi.fn() },
};
vi.mock('../../src/db/prisma.js', () => ({ prisma }));

const { createApp } = await import('../../src/app.js');
const app = createApp();

beforeEach(() => {
  prisma.$queryRaw.mockReset().mockResolvedValue([]);
  prisma.person.count.mockReset().mockResolvedValue(2);
  prisma.person.findUnique.mockReset().mockResolvedValue(null);
});

describe('GET /api/people', () => {
  it('needs at least 2 characters to search', async () => {
    expect((await request(app).get('/api/people')).status).toBe(400);
    expect((await request(app).get('/api/people?q=a')).status).toBe(400);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('escapes LIKE wildcards in the search text', async () => {
    await request(app).get('/api/people?q=50%25_off');
    const sql = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...unknown[]];
    expect(sql.slice(1)).toContain('%50\\%\\_off%');
  });
});

describe('GET /api/people/:id', () => {
  it('404 when the person does not exist', async () => {
    expect((await request(app).get('/api/people/nope')).status).toBe(404);
  });

  it('merges roles on the same title and sorts credits newest first', async () => {
    const t = (id: string, releaseYear: number | null) => ({
      id,
      name: id,
      mediaType: 'MOVIE',
      releaseYear,
      posterUrl: null,
    });
    prisma.person.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Greta',
      titles: [
        { role: 'WRITER', title: t('old', 2001) },
        { role: 'DIRECTOR', title: t('new', 2019) },
        { role: 'ACTOR', title: t('new', 2019) },
        { role: 'ACTOR', title: t('undated', null) },
      ],
    });

    const res = await request(app).get('/api/people/p1');

    expect(res.status).toBe(200);
    expect(res.body.credits.map((c: { id: string }) => c.id)).toEqual(['new', 'old', 'undated']);
    expect(res.body.credits[0].roles).toEqual(['ACTOR', 'DIRECTOR']);
    expect(res.body.credits[0]).not.toHaveProperty('posterUrl');
  });
});

describe('GET /api/people/:id/connection/:otherId', () => {
  it('rejects a maxDepth outside 1..6', async () => {
    for (const d of ['0', '7', 'x']) {
      expect((await request(app).get(`/api/people/a/connection/b?maxDepth=${d}`)).status).toBe(400);
    }
  });

  it('404 when either person is missing, without running the search', async () => {
    prisma.person.count.mockResolvedValue(1);
    expect((await request(app).get('/api/people/a/connection/b')).status).toBe(404);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('turns the traced rows into a path with the linking titles', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { depth: 0, person_id: 'a', person_name: 'A', via_id: null, via_name: null, via_type: null },
      {
        depth: 1,
        person_id: 'b',
        person_name: 'B',
        via_id: 't1',
        via_name: 'T1',
        via_type: 'TV_SHOW',
      },
    ]);

    const res = await request(app).get('/api/people/a/connection/b?maxDepth=3');

    expect(res.body).toEqual({
      degrees: 1,
      maxDepth: 3,
      path: [
        { person: { id: 'a', name: 'A' }, via: null },
        { person: { id: 'b', name: 'B' }, via: { id: 't1', name: 'T1', mediaType: 'TV_SHOW' } },
      ],
    });
  });

  it('answers a null path, not 404, when they are not connected', async () => {
    const res = await request(app).get('/api/people/a/connection/b');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ degrees: null, maxDepth: 6, path: null });
  });
});
