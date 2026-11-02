import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No databases in CI: both stores are replaced and the tests check what the module asks of them.
const prisma = { review: { findFirst: vi.fn() }, user: { findMany: vi.fn() } };
const reply = {
  find: vi.fn(),
  countDocuments: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findOneAndUpdate: vi.fn(),
  deleteOne: vi.fn(),
};
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/reply.model.js', () => ({ Reply: reply }));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

const as = (id = 'u1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'CONSUMER') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

const ID = '64b7f0f2a1b2c3d4e5f60718'; // a well-formed MongoDB id
const doc = (over: Record<string, unknown> = {}) => ({
  _id: ID,
  reviewId: 'r1',
  userId: 'u1',
  body: 'Thanks!',
  createdAt: new Date('2026-10-02T10:00:00Z'),
  editedAt: null,
  ...over,
});

/** find().sort().skip().limit().lean(), remembering what it was asked. */
const finder = (docs: unknown[]) => {
  const asked: Record<string, unknown> = {};
  const chain = {
    sort: (v: unknown) => ((asked['sort'] = v), chain),
    skip: (v: unknown) => ((asked['skip'] = v), chain),
    limit: (v: unknown) => ((asked['limit'] = v), chain),
    lean: async () => docs,
  };
  reply.find.mockImplementation((filter: unknown) => ((asked['filter'] = filter), chain));
  return asked;
};
const leaning = (value: unknown) => ({ lean: async () => value });

beforeEach(() => {
  prisma.review.findFirst.mockReset().mockResolvedValue({ id: 'r1' });
  prisma.user.findMany
    .mockReset()
    .mockResolvedValue([{ id: 'u1', username: 'maya_r', role: 'CONSUMER' }]);
  Object.values(reply).forEach((fn) => fn.mockReset());
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('GET /api/reviews/:reviewId/replies', () => {
  it('answers 404 for a review that does not exist', async () => {
    prisma.review.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/reviews/nope/replies');

    expect(res.status).toBe(404);
    expect(reply.find).not.toHaveBeenCalled();
  });

  it('only finds reviews of approved titles, like the reviews themselves', async () => {
    prisma.review.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/reviews/r1/replies');

    expect(res.status).toBe(404);
    expect(prisma.review.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'r1',
      title: { status: 'APPROVED' },
    });
  });

  it('lists oldest first with the id as tie-break, one page at a time', async () => {
    const asked = finder([doc()]);
    reply.countDocuments.mockResolvedValue(7);

    const res = await request(app).get('/api/reviews/r1/replies?page=3&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 3, pageSize: 2, total: 7 });
    expect(asked).toMatchObject({
      filter: { reviewId: 'r1' },
      sort: { createdAt: 1, _id: 1 },
      skip: 4,
      limit: 2,
    });
  });

  it('shows the author, and "edited" only when the text was changed', async () => {
    finder([doc(), doc({ _id: 'b', userId: 'u2', editedAt: new Date('2026-10-03T10:00:00Z') })]);
    reply.countDocuments.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', username: 'maya_r', role: 'CONSUMER' },
      { id: 'u2', username: null, role: 'CREATOR' },
    ]);

    const res = await request(app).get('/api/reviews/r1/replies');

    expect(res.body.data[0]).toMatchObject({
      id: ID,
      reviewId: 'r1',
      body: 'Thanks!',
      author: { id: 'u1', name: 'maya_r', role: 'CONSUMER' },
      createdAt: '2026-10-02T10:00:00.000Z',
    });
    expect(res.body.data[0]).not.toHaveProperty('editedAt');
    expect(res.body.data[1].editedAt).toBe('2026-10-03T10:00:00.000Z');
    expect(res.body.data[1].author.name).toBe('user-u2');
  });

  it('asks for the authors of the whole page in one query', async () => {
    finder([doc(), doc({ _id: 'b' }), doc({ _id: 'c', userId: 'u2' })]);
    reply.countDocuments.mockResolvedValue(3);

    await request(app).get('/api/reviews/r1/replies');

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany.mock.calls[0]?.[0].where.id.in).toEqual(['u1', 'u2']);
  });

  it('keeps the words of a writer whose account is gone', async () => {
    finder([doc({ userId: 'gone' })]);
    reply.countDocuments.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/reviews/r1/replies');

    expect(res.body.data[0].author).toMatchObject({ id: 'gone', name: 'Deleted user' });
  });

  it('refuses a page size over 200', async () => {
    expect((await request(app).get('/api/reviews/r1/replies?pageSize=201')).status).toBe(400);
  });
});

describe('POST /api/reviews/:reviewId/replies', () => {
  const post = (body: unknown, cookie = as()) =>
    request(app)
      .post('/api/reviews/r1/replies')
      .set(cookie)
      .send(body as object);

  beforeEach(() => {
    reply.create.mockImplementation(async (v: Record<string, unknown>) => ({
      toObject: () => doc({ body: v['body'], userId: v['userId'] }),
    }));
  });

  it('needs a signed-in user', async () => {
    const res = await request(app).post('/api/reviews/r1/replies').send({ body: 'x' });

    expect(res.status).toBe(401);
    expect(reply.create).not.toHaveBeenCalled();
  });

  it('refuses admins, who only delete', async () => {
    const res = await post({ body: 'x' }, as('a1', 'ADMIN'));

    expect(res.status).toBe(403);
    expect(reply.create).not.toHaveBeenCalled();
  });

  it('answers 404 for a review that does not exist', async () => {
    prisma.review.findFirst.mockResolvedValue(null);

    expect((await post({ body: 'x' })).status).toBe(404);
    expect(reply.create).not.toHaveBeenCalled();
  });

  it('refuses a reply under a review of a title that is not approved', async () => {
    prisma.review.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/reviews/r1/replies')
      .set(as())
      .send({ body: 'Hello' });

    expect(res.status).toBe(404);
    expect(prisma.review.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'r1',
      title: { status: 'APPROVED' },
    });
    expect(reply.create).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty reply', { body: '   ' }],
    ['no body', {}],
    ['text over 2000 characters', { body: 'a'.repeat(2001) }],
    ['a body that is not text', { body: 5 }],
    ['an extra key', { body: 'x', userId: 'someone-else' }],
  ])('rejects %s with 400', async (_label, payload) => {
    const res = await post(payload);

    expect(res.status).toBe(400);
    expect(reply.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a reader', 'u9', as('u9')],
    ['the review’s own author', 'u1', as('u1')],
    ['a creator', 'c1', as('c1', 'CREATOR')],
  ])('lets %s reply, as themselves and with trimmed text', async (_who, userId, cookie) => {
    const res = await post({ body: '  Nice one  ' }, cookie);

    expect(res.status).toBe(201);
    expect(reply.create.mock.calls[0]?.[0]).toEqual({
      reviewId: 'r1',
      userId,
      body: 'Nice one',
    });
    expect(res.body).toMatchObject({ reviewId: 'r1', body: 'Nice one' });
  });
});

describe('PATCH /api/replies/:id', () => {
  const patch = (body: unknown, cookie = as(), id = ID) =>
    request(app)
      .patch(`/api/replies/${id}`)
      .set(cookie)
      .send(body as object);

  beforeEach(() => {
    reply.findById.mockReturnValue(leaning(doc()));
    reply.findOneAndUpdate.mockReturnValue(
      leaning(doc({ body: 'Thanks a lot!', editedAt: new Date('2026-10-03T10:00:00Z') })),
    );
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).patch(`/api/replies/${ID}`).send({ body: 'x' })).status).toBe(401);
  });

  it('refuses admins, even for their own account', async () => {
    const res = await patch({ body: 'x' }, as('u1', 'ADMIN'));

    expect(res.status).toBe(403);
    expect(reply.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('answers 404 for an id that cannot exist, without asking MongoDB', async () => {
    const res = await patch({ body: 'x' }, as(), 'not-an-id');

    expect(res.status).toBe(404);
    expect(reply.findById).not.toHaveBeenCalled();
  });

  it('answers 404 for a reply that does not exist', async () => {
    reply.findById.mockReturnValue(leaning(null));

    expect((await patch({ body: 'x' })).status).toBe(404);
  });

  it('lets only the writer edit', async () => {
    const res = await patch({ body: 'hijack' }, as('u2'));

    expect(res.status).toBe(403);
    expect(reply.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty edit', async () => {
    expect((await patch({ body: '  ' })).status).toBe(400);
  });

  it('keeps createdAt, sets editedAt, and ties the write to the writer', async () => {
    const res = await patch({ body: ' Thanks a lot! ' });

    expect(res.status).toBe(200);
    const [filter, update, options] = reply.findOneAndUpdate.mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: ID, userId: 'u1' });
    expect(update.$set.body).toBe('Thanks a lot!');
    expect(update.$set.editedAt).toBeInstanceOf(Date);
    expect(update.$set).not.toHaveProperty('createdAt');
    expect(options).toEqual({ new: true });
    expect(res.body).toMatchObject({
      body: 'Thanks a lot!',
      createdAt: '2026-10-02T10:00:00.000Z',
      editedAt: '2026-10-03T10:00:00.000Z',
    });
  });

  it('does not mark a reply as edited when the text is the same', async () => {
    const res = await patch({ body: 'Thanks!' });

    expect(res.status).toBe(200);
    expect(reply.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.body).not.toHaveProperty('editedAt');
  });

  it('answers 404 if the reply was deleted while being edited', async () => {
    reply.findOneAndUpdate.mockReturnValue(leaning(null));

    expect((await patch({ body: 'Thanks a lot!' })).status).toBe(404);
  });
});

describe('DELETE /api/replies/:id', () => {
  const del = (cookie = as(), id = ID) => request(app).delete(`/api/replies/${id}`).set(cookie);

  beforeEach(() => {
    reply.findById.mockReturnValue(leaning(doc()));
    reply.deleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).delete(`/api/replies/${ID}`)).status).toBe(401);
  });

  it('answers 404 for a bad id and for a reply that does not exist', async () => {
    expect((await del(as(), 'not-an-id')).status).toBe(404);
    reply.findById.mockReturnValue(leaning(null));
    expect((await del()).status).toBe(404);
    expect(reply.deleteOne).not.toHaveBeenCalled();
  });

  it('refuses another reader', async () => {
    const res = await del(as('u2'));

    expect(res.status).toBe(403);
    expect(reply.deleteOne).not.toHaveBeenCalled();
  });

  it('lets the writer delete', async () => {
    const res = await del();

    expect(res.status).toBe(204);
    expect(reply.deleteOne.mock.calls[0]?.[0]).toEqual({ _id: ID });
  });

  it('lets an admin delete anyone’s reply to moderate', async () => {
    const res = await del(as('a1', 'ADMIN'));

    expect(res.status).toBe(204);
    expect(reply.deleteOne).toHaveBeenCalled();
  });
});
