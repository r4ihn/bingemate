import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// Minimal env so config/env.ts validation passes when app is imported.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db?schema=public';
process.env.MONGO_URI ??= 'mongodb://localhost:27017/bingemate';
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';

// No databases in CI: both stores are replaced and the tests check what the module asks of them.
const calls: string[] = [];
const prisma = {
  title: { findFirst: vi.fn() },
  review: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
};
const mongo = {
  find: vi.fn(),
  deleteOne: vi.fn(),
  movieCreate: vi.fn(),
  movieUpdate: vi.fn(),
  bookCreate: vi.fn(),
  bookUpdate: vi.fn(),
  replyDeleteMany: vi.fn(),
};
vi.mock('../../src/db/prisma.js', () => ({ prisma }));
vi.mock('../../src/mongo/models/reviewBody.model.js', () => ({
  ReviewBody: {
    find: (q: unknown) => ({ lean: () => mongo.find(q) }),
    deleteOne: mongo.deleteOne,
  },
  MovieReviewBody: { create: mongo.movieCreate, updateOne: mongo.movieUpdate },
  BookReviewBody: { create: mongo.bookCreate, updateOne: mongo.bookUpdate },
  TvShowReviewBody: { create: vi.fn(), updateOne: vi.fn() },
}));
vi.mock('../../src/mongo/models/reply.model.js', () => ({
  Reply: { deleteMany: mongo.replyDeleteMany },
}));

const { createApp } = await import('../../src/app.js');
const { signToken } = await import('../../src/utils/jwt.js');
const app = createApp();

const as = (id = 'u1', role: 'CONSUMER' | 'CREATOR' | 'ADMIN' = 'CONSUMER') => ({
  Cookie: `token=${signToken({ id, email: `${id}@example.com`, role })}`,
});

const reviewRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  titleId: 't1',
  userId: 'u1',
  rating: 4,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  user: { id: 'u1', username: 'maya_r', role: 'CONSUMER' },
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  for (const group of [prisma.title, prisma.review]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  prisma.$queryRaw.mockReset().mockImplementation(async () => calls.push('lock'));
  prisma.$executeRaw.mockReset().mockImplementation(async () => calls.push('recompute'));
  // Interactive transactions run against the same stub; array form just awaits each query.
  prisma.$transaction
    .mockReset()
    .mockImplementation(async (arg: unknown) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg as Promise<unknown>[]),
    );
  Object.values(mongo).forEach((fn) => fn.mockReset());

  prisma.title.findFirst.mockResolvedValue({ mediaType: 'MOVIE', createdById: null });
  prisma.review.create.mockImplementation(async () => {
    calls.push('pg-insert');
    return { id: 'r1' };
  });
  prisma.review.findUnique.mockResolvedValue(null);
  mongo.movieCreate.mockImplementation(async () => calls.push('mongo-insert'));
  mongo.find.mockResolvedValue([{ _id: 'r1', body: 'Great.' }]);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

/** After create the service re-reads the review; make that read succeed. */
const reReadSucceeds = () => {
  prisma.review.findUnique
    .mockResolvedValueOnce(null) // duplicate check
    .mockResolvedValue(reviewRow());
};

describe('POST /api/titles/:titleId/reviews', () => {
  const post = (body: unknown, cookie = as()) =>
    request(app)
      .post('/api/titles/t1/reviews')
      .set(cookie)
      .send(body as object);

  it('needs a signed-in user', async () => {
    const res = await request(app).post('/api/titles/t1/reviews').send({ rating: 5, body: 'x' });

    expect(res.status).toBe(401);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('refuses admins before touching anything', async () => {
    const res = await post({ rating: 5, body: 'x' }, as('a1', 'ADMIN'));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admins cannot write reviews or replies');
    expect(prisma.title.findFirst).not.toHaveBeenCalled();
  });

  it('refuses the creator of the title, who can still reply', async () => {
    prisma.title.findFirst.mockResolvedValue({ mediaType: 'MOVIE', createdById: 'u1' });

    const res = await post({ rating: 5, body: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You cannot review a title you created');
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it('answers 404 for a title that is missing or not approved', async () => {
    prisma.title.findFirst.mockResolvedValue(null);

    const res = await post({ rating: 5, body: 'x' });

    expect(res.status).toBe(404);
    expect(prisma.title.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 't1',
      status: 'APPROVED',
    });
  });

  it('answers 409 for a second review of the same title', async () => {
    prisma.review.findUnique.mockResolvedValue({ id: 'old' });

    const res = await post({ rating: 5, body: 'x' });

    expect(res.status).toBe(409);
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a rating of 0', { rating: 0, body: 'x' }],
    ['a rating of 6', { rating: 6, body: 'x' }],
    ['a half star', { rating: 3.5, body: 'x' }],
    ['a rating sent as text', { rating: '4', body: 'x' }],
    ['an empty body', { rating: 4, body: '   ' }],
    ['no body', { rating: 4 }],
    ['an unknown field', { rating: 4, body: 'x', fields: { bogus: 1 } }],
    ['an extra top-level key', { rating: 4, body: 'x', userId: 'someone-else' }],
    ['a negative runtime', { rating: 4, body: 'x', fields: { runtimeMinutes: -5 } }],
  ])('rejects %s with 400 and writes nothing', async (_label, payload) => {
    const res = await post(payload);

    expect(res.status).toBe(400);
    expect(prisma.review.create).not.toHaveBeenCalled();
    expect(mongo.movieCreate).not.toHaveBeenCalled();
  });

  it('saves the header and the new totals, then the body, in that order', async () => {
    reReadSucceeds();

    const res = await post({ rating: 5, body: '  Great.  ', fields: { runtimeMinutes: 120 } });

    expect(res.status).toBe(201);
    expect(calls).toEqual(['lock', 'pg-insert', 'recompute', 'mongo-insert']);
    expect(prisma.review.create.mock.calls[0]?.[0].data).toEqual({
      userId: 'u1',
      titleId: 't1',
      rating: 5,
    });
    // totals are copied from the view, so they round exactly like it
    const [sql, titleId] = prisma.$executeRaw.mock.calls[0] ?? [];
    expect((sql as string[]).join('?')).toMatch(/FROM "title_rating_stats"/);
    expect(titleId).toBe('t1');
    expect(mongo.movieCreate.mock.calls[0]?.[0]).toEqual({
      _id: 'r1',
      titleId: 't1',
      userId: 'u1',
      body: 'Great.',
      runtimeMinutes: 120,
    });
    expect(res.body).toMatchObject({
      id: 'r1',
      author: { id: 'u1', name: 'maya_r', role: 'CONSUMER' },
      rating: 4,
      body: 'Great.',
    });
  });

  it('keeps only the fields the media type takes, under their MongoDB names', async () => {
    prisma.title.findFirst.mockResolvedValue({ mediaType: 'BOOK', createdById: null });
    reReadSucceeds();

    await post({ rating: 3, body: 'x', fields: { chapters: 12, runtimeMinutes: 90, season: 2 } });

    expect(mongo.bookCreate.mock.calls[0]?.[0]).toMatchObject({ chaptersRead: 12 });
    const saved = mongo.bookCreate.mock.calls[0]?.[0];
    expect(saved).not.toHaveProperty('runtimeMinutes');
    expect(saved).not.toHaveProperty('season');
  });

  it('takes the header row back out when the body cannot be saved', async () => {
    mongo.movieCreate.mockRejectedValue(new Error('mongo is down'));

    const res = await post({ rating: 5, body: 'x' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Nothing was changed/);
    expect(prisma.review.delete.mock.calls[0]?.[0]).toEqual({ where: { id: 'r1' } });
    // totals are rebuilt again after the undo
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/titles/:titleId/reviews', () => {
  it('answers 404 for a title that is not approved', async () => {
    prisma.title.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/titles/t1/reviews');

    expect(res.status).toBe(404);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it('lists newest first with the id as tie-break, joined with the bodies', async () => {
    prisma.title.findFirst.mockResolvedValue({ id: 't1' });
    prisma.review.findMany.mockResolvedValue([
      reviewRow({ id: 'r2', user: { id: 'u2', username: null, role: 'CREATOR' } }),
      reviewRow({ id: 'r1' }),
    ]);
    prisma.review.count.mockResolvedValue(12);
    mongo.find.mockResolvedValue([
      { _id: 'r2', body: 'Second.', chaptersRead: 8, details: { review_year: 1999 } },
      { _id: 'r1', body: 'First.' },
    ]);

    const res = await request(app).get('/api/titles/t1/reviews?page=2&pageSize=2');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 12 });
    expect(prisma.review.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { titleId: 't1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 2,
      take: 2,
    });
    expect(res.body.data[0]).toMatchObject({
      id: 'r2',
      body: 'Second.',
      fields: { chapters: 8 },
      // no username yet: a short name from the id, never the email
      author: { name: 'user-u2', role: 'CREATOR' },
    });
    expect(res.body.data[0]).not.toHaveProperty('details');
    expect(res.body.data[1].fields).toEqual({});
  });

  it('shows empty text when a body is missing from MongoDB', async () => {
    prisma.title.findFirst.mockResolvedValue({ id: 't1' });
    prisma.review.findMany.mockResolvedValue([reviewRow()]);
    prisma.review.count.mockResolvedValue(1);
    mongo.find.mockResolvedValue([]);

    const res = await request(app).get('/api/titles/t1/reviews');

    expect(res.body.data[0].body).toBe('');
  });

  it('refuses a page size over 50', async () => {
    const res = await request(app).get('/api/titles/t1/reviews?pageSize=51');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/titles/:titleId/reviews/mine', () => {
  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/titles/t1/reviews/mine')).status).toBe(401);
  });

  it('returns null when the user has not reviewed the title', async () => {
    prisma.review.findFirst.mockResolvedValue(null);

    const res = await request(app).get('/api/titles/t1/reviews/mine').set(as());

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(prisma.review.findFirst.mock.calls[0]?.[0].where).toEqual({
      titleId: 't1',
      userId: 'u1',
    });
  });

  it('returns the review the user wrote', async () => {
    prisma.review.findFirst.mockResolvedValue(reviewRow());

    const res = await request(app).get('/api/titles/t1/reviews/mine').set(as());

    expect(res.body).toMatchObject({ id: 'r1', rating: 4, body: 'Great.' });
  });
});

describe('PATCH /api/reviews/:id', () => {
  const stored = (over: Record<string, unknown> = {}) => ({
    userId: 'u1',
    titleId: 't1',
    rating: 4,
    title: { mediaType: 'MOVIE', createdById: null },
    ...over,
  });
  const patch = (body: unknown, cookie = as()) =>
    request(app)
      .patch('/api/reviews/r1')
      .set(cookie)
      .send(body as object);

  beforeEach(() => {
    prisma.review.findUnique
      .mockResolvedValueOnce(stored())
      .mockResolvedValue(reviewRow({ rating: 2 }));
    prisma.review.update.mockImplementation(async () => calls.push('pg-update'));
    mongo.movieUpdate.mockImplementation(async () => {
      calls.push('mongo-update');
      return { matchedCount: 1 };
    });
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).patch('/api/reviews/r1').send({ rating: 1 })).status).toBe(401);
  });

  it('answers 404 for a review that does not exist', async () => {
    prisma.review.findUnique.mockReset().mockResolvedValue(null);

    expect((await patch({ rating: 2 })).status).toBe(404);
  });

  it('lets only the author edit, not another reader and not an admin', async () => {
    const other = await patch({ rating: 2 }, as('u2'));
    prisma.review.findUnique.mockResolvedValueOnce(stored({ userId: 'a1' }));
    const admin = await patch({ rating: 2 }, as('a1', 'ADMIN'));

    expect(other.status).toBe(403);
    expect(admin.status).toBe(403);
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(mongo.movieUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty change and a rating out of range', async () => {
    expect((await patch({})).status).toBe(400);
    expect((await patch({ rating: 9 })).status).toBe(400);
    expect((await patch({ userId: 'u2', rating: 2 })).status).toBe(400);
  });

  it('changes the rating and the totals together', async () => {
    const res = await patch({ rating: 2 });

    expect(res.status).toBe(200);
    expect(calls).toEqual(['lock', 'pg-update', 'recompute']);
    expect(prisma.review.update.mock.calls[0]?.[0]).toEqual({
      where: { id: 'r1' },
      data: { rating: 2 },
    });
    expect(mongo.movieUpdate).not.toHaveBeenCalled();
  });

  it('leaves PostgreSQL alone when only the text changes', async () => {
    const res = await patch({ body: 'Edited.' });

    expect(res.status).toBe(200);
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(mongo.movieUpdate.mock.calls[0]).toEqual([{ _id: 'r1' }, { $set: { body: 'Edited.' } }]);
  });

  it('leaves PostgreSQL alone when the rating is sent unchanged', async () => {
    await patch({ rating: 4, body: 'Same stars.' });

    expect(prisma.review.update).not.toHaveBeenCalled();
  });

  it('sets the fields it is given and clears the ones the form left out', async () => {
    await patch({ fields: { runtimeMinutes: 95 } });
    mongo.movieUpdate.mockClear();
    prisma.review.findUnique.mockResolvedValueOnce(
      stored({ title: { mediaType: 'BOOK', createdById: null } }),
    );
    await patch({ fields: {} });

    expect(mongo.bookUpdate.mock.calls[0]).toEqual([
      { _id: 'r1' },
      { $unset: { chaptersRead: '' } },
    ]);
  });

  it('puts the old rating back when the body cannot be saved', async () => {
    mongo.movieUpdate.mockRejectedValue(new Error('mongo is down'));

    prisma.review.updateMany.mockResolvedValue({ count: 1 });

    const res = await patch({ rating: 2, body: 'Edited.' });

    expect(res.status).toBe(502);
    expect(prisma.review.update.mock.calls[0]?.[0].data).toEqual({ rating: 2 });
    // only while the row still holds the 2 this request wrote
    expect(prisma.review.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { id: 'r1', rating: 2 },
      data: { rating: 4 },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('keeps an edit another tab saved in between, instead of undoing over it', async () => {
    mongo.movieUpdate.mockRejectedValue(new Error('mongo is down'));
    prisma.review.updateMany.mockResolvedValue({ count: 0 }); // the row no longer holds our 2

    const res = await patch({ rating: 2, body: 'Edited.' });

    expect(res.status).toBe(502);
    // totals rebuilt once for our own write, not again for an undo that did not happen
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('treats a review with no body in MongoDB as a failed edit, not a silent success', async () => {
    mongo.movieUpdate.mockResolvedValue({ matchedCount: 0 });

    const res = await patch({ rating: 2, body: 'Edited.' });

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/Nothing was changed/);
    // the rating that was already moved goes back
    expect(prisma.review.update.mock.calls.map((c) => c[0].data.rating)).toEqual([2, 4]);
  });

  it('does not touch the rating back when it never changed', async () => {
    mongo.movieUpdate.mockRejectedValue(new Error('mongo is down'));

    const res = await patch({ body: 'Edited.' });

    expect(res.status).toBe(502);
    expect(prisma.review.update).not.toHaveBeenCalled();
    expect(prisma.review.updateMany).not.toHaveBeenCalled();
  });

  it('still refuses the creator of the title', async () => {
    prisma.review.findUnique
      .mockReset()
      .mockResolvedValue(stored({ title: { mediaType: 'MOVIE', createdById: 'u1' } }));

    expect((await patch({ rating: 2 })).status).toBe(403);
  });
});

describe('DELETE /api/reviews/:id', () => {
  const del = (cookie = as()) => request(app).delete('/api/reviews/r1').set(cookie);

  beforeEach(() => {
    prisma.review.findUnique.mockResolvedValue({ userId: 'u1', titleId: 't1' });
    prisma.review.delete.mockImplementation(async () => calls.push('pg-delete'));
    mongo.deleteOne.mockImplementation(async () => calls.push('mongo-body'));
    mongo.replyDeleteMany.mockImplementation(async () => calls.push('mongo-replies'));
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).delete('/api/reviews/r1')).status).toBe(401);
  });

  it('answers 404 for a review that does not exist', async () => {
    prisma.review.findUnique.mockResolvedValue(null);

    expect((await del()).status).toBe(404);
  });

  it('refuses another reader', async () => {
    const res = await del(as('u2'));

    expect(res.status).toBe(403);
    expect(prisma.review.delete).not.toHaveBeenCalled();
  });

  it('lets the author delete: header and totals first, then the body and replies', async () => {
    const res = await del();

    expect(res.status).toBe(204);
    expect(calls).toEqual(['lock', 'pg-delete', 'recompute', 'mongo-body', 'mongo-replies']);
    expect(mongo.deleteOne.mock.calls[0]?.[0]).toEqual({ _id: 'r1' });
    expect(mongo.replyDeleteMany.mock.calls[0]?.[0]).toEqual({ reviewId: 'r1' });
  });

  it('lets an admin delete anyone’s review', async () => {
    const res = await del(as('a1', 'ADMIN'));

    expect(res.status).toBe(204);
    expect(prisma.review.delete).toHaveBeenCalled();
  });

  it('still answers 204 when the leftovers in MongoDB cannot be cleared', async () => {
    mongo.deleteOne.mockRejectedValue(new Error('mongo is down'));

    const res = await del();

    expect(res.status).toBe(204);
    expect(prisma.review.delete).toHaveBeenCalled();
  });

  it('still clears the replies when the body delete fails', async () => {
    mongo.deleteOne.mockRejectedValue(new Error('mongo is down'));

    await del();

    expect(mongo.replyDeleteMany.mock.calls[0]?.[0]).toEqual({ reviewId: 'r1' });
  });
});
