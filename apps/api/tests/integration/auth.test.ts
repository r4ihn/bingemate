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
  username: string | null;
}

const db = vi.hoisted(() => ({
  users: [] as FakeUser[],
  target: undefined as unknown,
  omitMeta: false,
}));

vi.mock('../../src/db/prisma.js', async () => {
  const { Prisma } = await import('@prisma/client');
  return {
    prisma: {
      user: {
        findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
          db.users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
        create: async ({
          data,
        }: {
          data: { email: string; passwordHash: string; username: string };
        }) => {
          if (db.target !== undefined || db.omitMeta) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: 'test',
              ...(db.omitMeta ? {} : { meta: { modelName: 'User', target: db.target } }),
            });
          }
          // Like the real unique email column
          if (db.users.some((u) => u.email === data.email)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: 'test',
              meta: { target: ['email'] },
            });
          }
          const user = { id: `user_${db.users.length + 1}`, role: 'MEMBER', ...data };
          db.users.push(user);
          return user;
        },
      },
    },
  };
});

vi.mock('../../src/middleware/rateLimit.js', () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { createApp } = await import('../../src/app.js');

// These tests exercise auth; isolate the production limiter's shared request counter.
const app = createApp();
const credentials = { email: 'me@test.com', password: 'abc12345', username: 'Casey Lee' };

beforeEach(() => {
  db.users.length = 0;
  db.target = undefined;
  db.omitMeta = false;
});

describe('POST /api/auth/register', () => {
  it('creates a MEMBER, sets an httpOnly cookie and never returns the hash', async () => {
    const res = await request(app).post('/api/auth/register').send(credentials);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: credentials.email,
      role: 'MEMBER',
      username: credentials.username,
    });
    expect(res.body.passwordHash).toBeUndefined();

    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('token=');
    expect(cookie).toContain('HttpOnly');
  });

  it('stores the normalised username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, username: '  Casey  Lee ' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('Casey Lee');
    expect(db.users[0]?.username).toBe('Casey Lee');
  });

  it.each(
    [
      'User_username_lower_key',
      ['User_username_lower_key'],
      ['username'],
      ['lower(username)'],
      ['LOWER(USERNAME)'],
    ].map((target) => [target]),
  )('returns username conflict for target %j', async (target) => {
    db.target = target;
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Username already taken' });
  });

  it.each(
    [['email'], 'User_email_key', ['User_email_key'], ['EMAIL'], ['username', 'email']].map(
      (target) => [target],
    ),
  )('returns email conflict for target %j', async (target) => {
    db.target = target;
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email already in use' });
  });

  it('returns 500 for an unknown unique constraint', async () => {
    db.target = ['something_else'];
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'InternalServerError' });
  });

  it('returns 500 for a unique constraint error without meta', async () => {
    db.omitMeta = true;
    const res = await request(app).post('/api/auth/register').send(credentials);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'InternalServerError' });
  });

  it('returns the shared username validation message in a 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, username: 'AdMiN' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'ValidationError',
      details: { formErrors: [], fieldErrors: { username: ['This username is reserved'] } },
    });
    expect(db.users).toHaveLength(0);
  });

  it.each([
    ['аdmin', 'Username cannot mix letters from different alphabets'],
    ['a.d.m.i.n', 'This username is reserved'],
    ['Suppօrt', 'Username contains letters from an unsupported alphabet'],
    ['adm1n', 'This username is reserved'],
    ['admㅤin', 'Username cannot contain invisible characters'],
    ['ᴀᴅᴍɪɴ', 'This username is reserved'],
  ])('refuses impersonating username %s with a 400', async (username, message) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, username });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'ValidationError',
      details: { formErrors: [], fieldErrors: { username: [message] } },
    });
    expect(db.users).toHaveLength(0);
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
    expect(res.body).toEqual({ error: 'Email already in use' });
  });

  it('returns 409, not 500, when two registers for one email arrive together', async () => {
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/register').send(credentials),
      request(app).post('/api/auth/register').send(credentials),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('treats emails as case-insensitive', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...credentials, email: '  Me@Test.COM ' });

    expect(res.body.email).toBe('me@test.com');
    const again = await request(app).post('/api/auth/register').send(credentials);
    expect(again.status).toBe(409);
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
    expect(res.body.username).toBe(credentials.username);
    expect(String(res.headers['set-cookie'])).toContain('token=');
  });

  it('returns null username for a legacy user on login and me', async () => {
    db.users[0]!.username = null;
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send(credentials);
    expect(login.status).toBe(200);
    expect(login.body.username).toBeNull();
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.username).toBeNull();
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
    expect(res.body).toEqual({
      id: expect.any(String),
      email: credentials.email,
      role: 'MEMBER',
      username: credentials.username,
    });
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

  it('still clears an expired or broken cookie', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', 'token=junk');

    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/token=;.*Expires=Thu, 01 Jan 1970/);
  });
});
