import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// CI has no database, so Prisma is replaced by stubs. Zod, bcrypt, JWT, cookies and the rate
// limiter run for real.
const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('../../src/db/prisma.js', () => ({ prisma }));

const { Prisma } = await import('@prisma/client');
const { createApp } = await import('../../src/app.js');
const { signToken, verifyToken } = await import('../../src/utils/jwt.js');
const app = createApp();

type Role = 'MEMBER' | 'ADMIN';
const as = (id = 'u1', role: Role = 'MEMBER') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role, username: 'maya_r' })}`,
});

const CURRENT = 'abc12345';
const NEW = 'newpass99';
let currentHash = '';

const profileRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'u1@example.com',
  username: 'maya_r',
  role: 'MEMBER',
  createdAt: new Date('2026-10-12T00:00:00Z'),
  ...over,
});

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: 'User_username_lower_key' },
  });

const tokenOf = (res: { headers: Record<string, unknown> }) =>
  /token=([^;]+)/.exec(String(res.headers['set-cookie']))?.[1] ?? '';

beforeAll(async () => {
  // Low cost keeps the suite quick; bcrypt.compare reads the cost from the hash itself
  currentHash = await bcrypt.hash(CURRENT, 4);
});

beforeEach(() => {
  for (const fn of Object.values(prisma.user)) fn.mockReset();
  prisma.user.findUnique.mockResolvedValue(profileRow());
  prisma.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    profileRow(data),
  );
});

describe('GET /api/users/me', () => {
  it('needs a signed-in user', async () => {
    const res = await request(app).get('/api/users/me');

    expect(res.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns the profile of the person in the token, without the password hash', async () => {
    const res = await request(app).get('/api/users/me').set(as('u1'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 'u1',
      email: 'u1@example.com',
      username: 'maya_r',
      role: 'MEMBER',
      createdAt: '2026-10-12T00:00:00.000Z',
    });
    const query = prisma.user.findUnique.mock.calls[0]?.[0];
    expect(query.where).toEqual({ id: 'u1' });
    expect(query.select.passwordHash).toBeUndefined();
  });

  it('returns a null username for a legacy account that never had one', async () => {
    prisma.user.findUnique.mockResolvedValue(profileRow({ username: null }));

    const res = await request(app).get('/api/users/me').set(as('u1'));

    expect(res.body.username).toBeNull();
  });

  it('answers 401 when the account was deleted but the token is still valid', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/users/me').set(as('u1'));

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/users/me', () => {
  const patch = (body: unknown, cookie = as()) =>
    request(app)
      .patch('/api/users/me')
      .set(cookie)
      .send(body as object);

  it('needs a signed-in user', async () => {
    const res = await request(app).patch('/api/users/me').send({ username: 'new_name' });

    expect(res.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(31)],
    ['not allowed characters', 'bad<name>'],
    ['starting with a symbol', '.hidden'],
    ['blank', '   '],
    ['a reserved name', 'Admin'],
  ])('rejects a username that is %s', async (_label, username) => {
    const res = await patch({ username });

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses extra fields, so a body cannot set the role', async () => {
    const res = await patch({ username: 'new_name', role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers 409 when somebody else has the name, as the unique index decides', async () => {
    prisma.user.update.mockRejectedValue(uniqueViolation());

    const res = await patch({ username: 'Studio_North' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Username already taken');
  });

  it('saves the normalised name for the person in the token and returns the profile', async () => {
    const res = await patch({ username: '  new   name  ' });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('new name');
    expect(prisma.user.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'u1' },
      data: { username: 'new name' },
    });
  });

  it('sets a fresh cookie so the token carries the new username', async () => {
    const res = await patch({ username: 'new_name' });

    expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
    expect(verifyToken(tokenOf(res))).toEqual({
      id: 'u1',
      email: 'u1@example.com',
      role: 'MEMBER',
      username: 'new_name',
    });
  });

  it('does nothing when the name is unchanged', async () => {
    const res = await patch({ username: 'maya_r' });

    expect(res.status).toBe(200);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each(['MEMBER', 'ADMIN'] as const)('is open to a %s', async (role) => {
    const res = await patch({ username: 'new_name' }, as('u1', role));

    expect(res.status).toBe(200);
  });
});

// passwordLimiter allows 10 requests per 15 minutes and every signed-in request in this block
// counts, failures included. This block makes 9, so a new test here needs a limiter reset or its
// own app.
describe('PATCH /api/users/me/password', () => {
  const change = (body: unknown, cookie = as()) =>
    request(app)
      .patch('/api/users/me/password')
      .set(cookie)
      .send(body as object);

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(profileRow({ passwordHash: currentHash }));
  });

  it('needs a signed-in user', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: CURRENT, newPassword: NEW });

    expect(res.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers 400, not 401, for a wrong current password', async () => {
    // A 401 would make the web client sign the person out as if the session had expired
    const res = await change({ currentPassword: 'wrong-pass1', newPassword: NEW });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Current password is incorrect');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a new password that is the same as the current one', async () => {
    const res = await change({ currentPassword: CURRENT, newPassword: CURRENT });

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['too short', 'ab1'],
    ['without a number', 'onlyletters'],
    ['without a letter', '12345678'],
  ])('rejects a new password that is %s', async (_label, newPassword) => {
    const res = await change({ currentPassword: CURRENT, newPassword });

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('stores a bcrypt hash of the new password, never the password itself', async () => {
    const res = await change({ currentPassword: CURRENT, newPassword: NEW });

    expect(res.status).toBe(204);
    const call = prisma.user.update.mock.calls[0]?.[0];
    expect(call.where).toEqual({ id: 'u1' });
    expect(call.data.passwordHash).not.toBe(NEW);
    expect(call.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare(NEW, call.data.passwordHash)).toBe(true);
  });

  it('sets a fresh httpOnly cookie carrying the role and username as they are in the database', async () => {
    prisma.user.findUnique.mockResolvedValue(
      profileRow({ role: 'ADMIN', username: 'real_name', passwordHash: currentHash }),
    );

    // The old token still says MEMBER and maya_r
    const res = await change({ currentPassword: CURRENT, newPassword: NEW });

    expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
    expect(verifyToken(tokenOf(res))).toEqual({
      id: 'u1',
      email: 'u1@example.com',
      role: 'ADMIN',
      username: 'real_name',
    });
  });

  it('refuses unknown fields', async () => {
    const res = await change({ currentPassword: CURRENT, newPassword: NEW, role: 'ADMIN' });

    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('answers 401 when the account was deleted but the token is still valid', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await change({ currentPassword: CURRENT, newPassword: NEW });

    expect(res.status).toBe(401);
  });
});
