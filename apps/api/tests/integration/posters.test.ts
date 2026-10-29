import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No databases in CI: both stores are replaced and the tests check what the module asks of them.
const calls: string[] = [];
const prisma = { title: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() } };
const poster = { findOneAndUpdate: vi.fn(), findById: vi.fn(), deleteOne: vi.fn() };
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/titlePoster.model.js', () => ({ TitlePoster: poster }));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const { sniffImage } = await import('../../src/modules/posters/image.js');
const app = createApp();

const as = (id = 'c1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'CREATOR') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

// Only the first bytes matter: the server never decodes the image.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x20, 0, 0, 0]),
  Buffer.from('WEBP'),
  Buffer.from([1, 2, 3]),
]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WAVE')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

beforeEach(() => {
  calls.length = 0;
  Object.values(prisma.title).forEach((fn) => fn.mockReset());
  Object.values(poster).forEach((fn) => fn.mockReset());
  prisma.title.findUnique.mockResolvedValue({ createdById: 'c1' });
  prisma.title.update.mockImplementation(async () => calls.push('pg-update'));
  poster.findOneAndUpdate.mockImplementation(async () => calls.push('mongo-save'));
  poster.deleteOne.mockImplementation(async () => calls.push('mongo-delete'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('sniffImage', () => {
  it('recognises JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(WEBP)).toBe('image/webp');
  });

  it.each([
    ['text', Buffer.from('not an image')],
    ['an SVG, which can carry scripts', SVG],
    ['a RIFF file that is not WebP', WAV],
    ['an empty file', Buffer.alloc(0)],
    ['a file cut off inside the signature', Buffer.from([0x89, 0x50])],
  ])('refuses %s', (_label, bytes) => {
    expect(sniffImage(bytes)).toBeNull();
  });
});

describe('PUT /api/titles/:titleId/poster', () => {
  const put = (bytes: Buffer | object, cookie = as(), type = 'image/png') =>
    request(app).put('/api/titles/t1/poster').set(cookie).set('Content-Type', type).send(bytes);

  it('needs a signed-in user and reads nothing before that', async () => {
    const res = await request(app)
      .put('/api/titles/t1/poster')
      .set('Content-Type', 'image/png')
      .send(PNG);

    expect(res.status).toBe(401);
    expect(prisma.title.findUnique).not.toHaveBeenCalled();
    expect(poster.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('answers 404 for a title that does not exist', async () => {
    prisma.title.findUnique.mockResolvedValue(null);

    expect((await put(PNG)).status).toBe(404);
  });

  it.each([
    ['a reader', as('c1', 'CONSUMER')],
    ['a creator who did not make the title', as('c2')],
  ])('refuses %s', async (_who, cookie) => {
    const res = await put(PNG, cookie);

    expect(res.status).toBe(403);
    expect(poster.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('keeps imported titles, which have no owner, to admins', async () => {
    prisma.title.findUnique.mockResolvedValue({ createdById: null });

    expect((await put(PNG)).status).toBe(403);
    expect((await put(PNG, as('a1', 'ADMIN'))).status).toBe(200);
  });

  it('does not let a user with someone else’s id in the title pass as its owner', async () => {
    prisma.title.findUnique.mockResolvedValue({ createdById: 'c1' });

    expect((await put(PNG, as('c1', 'CONSUMER'))).status).toBe(403);
  });

  it('saves the image first, then points the title at it', async () => {
    const res = await put(PNG);

    expect(res.status).toBe(200);
    expect(calls).toEqual(['mongo-save', 'pg-update']);
    const [filter, update, options] = poster.findOneAndUpdate.mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: 't1' });
    expect(update.$set.data.equals(PNG)).toBe(true);
    expect(options).toEqual({ upsert: true });
    const version = update.$set.version;
    expect(res.body).toEqual({ posterUrl: `/api/titles/t1/poster?v=${version}` });
    expect(prisma.title.update.mock.calls[0]?.[0]).toEqual({
      where: { id: 't1' },
      data: { posterUrl: res.body.posterUrl },
    });
  });

  it('goes by the bytes, not by the Content-Type the sender typed', async () => {
    const res = await put(JPEG, as(), 'image/png');

    expect(res.status).toBe(200);
    expect(poster.findOneAndUpdate.mock.calls[0]?.[1].$set.contentType).toBe('image/jpeg');
  });

  it('accepts a WebP image', async () => {
    expect((await put(WEBP, as(), 'image/webp')).status).toBe(200);
  });

  it.each([
    ['text', Buffer.from('not an image')],
    ['an SVG that claims to be a PNG', SVG],
    ['a WAV file', WAV],
  ])('rejects %s with 415 and saves nothing', async (_label, bytes) => {
    const res = await put(bytes);

    expect(res.status).toBe(415);
    expect(res.body.error).toBe('Use a JPEG, PNG or WebP image');
    expect(poster.findOneAndUpdate).not.toHaveBeenCalled();
    expect(prisma.title.update).not.toHaveBeenCalled();
  });

  it('rejects an empty body with 400', async () => {
    const res = await put(Buffer.alloc(0));

    expect(res.status).toBe(400);
    expect(poster.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an image over 1 MB with 413', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(1024 * 1024)]);

    const res = await put(big, as(), 'image/jpeg');

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('The image must be 1 MB or smaller');
    expect(poster.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a JSON body: the image has to be sent as the file itself', async () => {
    const res = await put({ image: 'abc' }, as(), 'application/json');

    expect(res.status).toBe(400);
    expect(poster.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('GET /api/titles/:titleId/poster', () => {
  it('answers 404 for a title that is not approved, without asking MongoDB', async () => {
    prisma.title.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/titles/t1/poster');

    expect(res.status).toBe(404);
    expect(prisma.title.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 't1',
      status: 'APPROVED',
    });
    expect(poster.findById).not.toHaveBeenCalled();
  });

  it('answers 404 for a title without an image', async () => {
    prisma.title.findFirst.mockResolvedValue({ id: 't1' });
    poster.findById.mockReturnValue({ lean: async () => null });

    expect((await request(app).get('/api/titles/t1/poster')).status).toBe(404);
  });

  it('serves the bytes with their real type, a long cache and no sniffing', async () => {
    prisma.title.findFirst.mockResolvedValue({ id: 't1' });
    poster.findById.mockReturnValue({
      lean: async () => ({ contentType: 'image/png', data: PNG }),
    });

    const res = await request(app).get('/api/titles/t1/poster').buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);
  });

  it('copes with the driver handing back its Binary wrapper', async () => {
    prisma.title.findFirst.mockResolvedValue({ id: 't1' });
    poster.findById.mockReturnValue({
      lean: async () => ({ contentType: 'image/jpeg', data: { buffer: new Uint8Array(JPEG) } }),
    });

    const res = await request(app).get('/api/titles/t1/poster').buffer(true);

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).equals(JPEG)).toBe(true);
  });
});

describe('DELETE /api/titles/:titleId/poster', () => {
  const del = (cookie = as()) => request(app).delete('/api/titles/t1/poster').set(cookie);

  it('needs a signed-in user', async () => {
    expect((await request(app).delete('/api/titles/t1/poster')).status).toBe(401);
  });

  it('refuses someone who does not own the title', async () => {
    const res = await del(as('c2'));

    expect(res.status).toBe(403);
    expect(prisma.title.update).not.toHaveBeenCalled();
  });

  it('clears the link first, then removes the bytes', async () => {
    const res = await del();

    expect(res.status).toBe(204);
    expect(calls).toEqual(['pg-update', 'mongo-delete']);
    expect(prisma.title.update.mock.calls[0]?.[0]).toEqual({
      where: { id: 't1' },
      data: { posterUrl: null },
    });
    expect(poster.deleteOne.mock.calls[0]?.[0]).toEqual({ _id: 't1' });
  });

  it('still answers 204 when the bytes cannot be removed, since nothing points at them', async () => {
    poster.deleteOne.mockRejectedValue(new Error('mongo is down'));

    expect((await del()).status).toBe(204);
  });
});
