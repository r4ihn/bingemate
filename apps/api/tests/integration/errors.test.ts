import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../../src/db/prisma.js', () => ({
  prisma: { user: { findUnique: db.findUnique } },
}));

const { createApp } = await import('../../src/app.js');
const app = createApp();
const credentials = { email: 'me@test.com', password: 'abc12345' };

beforeEach(() => {
  db.findUnique.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('error responses', () => {
  it('answers 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON' });
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it('answers 413 for JSON over the default 100 KB limit', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, padding: 'x'.repeat(200 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Request body too large' });
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['Content-Encoding', 'unsupported'],
    ['Content-Type', 'application/json; charset=iso-8859-1'],
  ])('answers 400 for unsupported %s', async (header, value) => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .set(header, value)
      .send(JSON.stringify(credentials));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Could not read the request' });
    expect(db.findUnique).not.toHaveBeenCalled();
  });

  it.each(['/api/does-not-exist', '/does-not-exist'])(
    'answers JSON 404 for unknown route %s',
    async (path) => {
      const res = await request(app).get(path);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not found' });
    },
  );

  it('still serves /health', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', ts: expect.any(String) });
  });

  it('logs unknown errors and answers 500 without exposing their message or stack', async () => {
    const error = new Error('private database failure');
    db.findUnique.mockRejectedValueOnce(error);

    const res = await request(app).post('/api/auth/login').send(credentials);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'InternalServerError' });
    expect(console.error).toHaveBeenCalledWith('Unhandled error:', error);
  });
});
