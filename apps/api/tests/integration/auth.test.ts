import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// CI has no database, so Prisma is replaced with an in-memory users table.
// Everything else (Zod, bcrypt, JWT, cookies, errorHandler) runs for real.
interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
}

const db = vi.hoisted(() => ({ users: [] as FakeUser[] }));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    user = {
      findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
        db.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      create: async ({ data }: { data: { email: string; passwordHash: string } }) => {
        const user = { id: `user_${db.users.length + 1}`, role: 'CONSUMER', ...data };
        db.users.push(user);
        return user;
      },
    };
  },
}));

const { createApp } = await import('../../src/app.js');

// One app for the whole file: authLimiter allows 20 register/login calls per
// 15 minutes, and this file stays under that.
const app = createApp();
const credentials = { email: 'me@test.com', password: 'abc12345' };

beforeEach(() => {
  db.users.length = 0;
});

describe('POST /api/auth/register', () => {
  it('creates a CONSUMER, sets an httpOnly cookie and never returns the hash', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), email: credentials.email, role: 'CONSUMER' });
    expect(res.body.passwordHash).toBeUndefined();

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('token=');
    expect(cookie).toContain('HttpOnly');
  });

  it('stores a bcrypt hash, not the plain password', async () => {
    await request(app).post('/api/auth/register').send(credentials);

    expect(db.users[0]?.passwordHash).not.toBe(credentials.password);
    expect(db.users[0]?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('returns 409 when the email is already registered', async () => {
    await request(app).post('/api/auth/register').send(credentials);
    const res = await request(app).post('/api/auth/register').send(credentials);

    expect(res.status).toBe(409);
  });

  it('returns 400 for a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@test.com', password: 'abc' });

    expect(res.status).toBe(400);
    expect(db.users).toHaveLength(0);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(credentials);
  });

  it('returns the user and sets the cookie for the right password', async () => {
    const res = await request(app).post('/api/auth/login').send(credentials);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(credentials.email);
    expect(String(res.headers['set-cookie'])).toContain('token=');
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, password: 'wrong1234' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, email: 'nobody@test.com' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a cookie', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('returns 401 (not 500) for an invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'token=junk');

    expect(res.status).toBe(401);
  });

  it('returns the signed-in user', async () => {
    // agent() keeps cookies between requests, like a browser or Postman does
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(credentials);

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: expect.any(String), email: credentials.email, role: 'CONSUMER' });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie so /me returns 401 afterwards', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(credentials);

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(204);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});
