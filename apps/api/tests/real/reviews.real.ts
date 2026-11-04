import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { ReviewBody } from '../../src/mongo/models/reviewBody.model.js';
import { as, createTitle, createUser, resetDatabases } from './helpers.js';

const app = createApp();
beforeEach(resetDatabases);

describe('real cross-store reviews', () => {
  it('POST shares one id across stores, updates totals, joins bodies and refuses duplicates', async () => {
    const consumer = await createUser();
    const title = await createTitle();
    const response = await request(app)
      .post(`/api/titles/${title.id}/reviews`)
      .set(as(consumer))
      .send({ rating: 4, body: 'A real review body.' });
    expect(response.status, 'consumer review creation must succeed').toBe(201);
    const row = await prisma.review.findUniqueOrThrow({ where: { id: response.body.id } });
    const body = await ReviewBody.findById(row.id).lean();
    expect(body, 'Mongo body must share the PostgreSQL review id and owner').toMatchObject({
      _id: row.id,
      titleId: title.id,
      userId: consumer.id,
      body: 'A real review body.',
    });
    expect(
      await prisma.title.findUniqueOrThrow({ where: { id: title.id } }),
      'creating a review must recompute stored title totals',
    ).toMatchObject({ avgRating: 4, reviewCount: 1 });
    const listed = await request(app).get(`/api/titles/${title.id}/reviews`);
    expect(listed.status, 'review listing must succeed against both stores').toBe(200);
    expect(listed.body.data, 'listing must join the body to its rating header').toEqual([
      expect.objectContaining({ id: row.id, rating: 4, body: 'A real review body.' }),
    ]);
    const duplicate = await request(app)
      .post(`/api/titles/${title.id}/reviews`)
      .set(as(consumer))
      .send({ rating: 1, body: 'Duplicate.' });
    expect(duplicate.status, 'one user may review a title only once').toBe(409);
    expect(await prisma.review.count(), 'duplicate creation must leave exactly one header').toBe(1);
    expect(
      await ReviewBody.countDocuments(),
      'duplicate creation must leave exactly one body',
    ).toBe(1);
    expect(
      await ReviewBody.findById(row.id).lean(),
      'duplicate attempts must preserve the original body',
    ).toMatchObject({ body: 'A real review body.' });
  });

  it('owner PATCH changes both stores and DELETE removes both and restores title totals', async () => {
    const consumer = await createUser();
    const title = await createTitle();
    const created = await request(app)
      .post(`/api/titles/${title.id}/reviews`)
      .set(as(consumer))
      .send({ rating: 5, body: 'Original.' });
    expect(created.status, 'edit fixture must be created through the real API').toBe(201);
    const id = created.body.id as string;
    const patched = await request(app)
      .patch(`/api/reviews/${id}`)
      .set(as(consumer))
      .send({ rating: 2, body: 'Changed.' });
    expect(patched.status, 'owner must be able to edit their review').toBe(200);
    expect(
      await prisma.review.findUniqueOrThrow({ where: { id } }),
      'PATCH must persist the new rating',
    ).toMatchObject({ rating: 2 });
    expect(
      await ReviewBody.findById(id).lean(),
      'PATCH must persist text under the same id',
    ).toMatchObject({ _id: id, body: 'Changed.' });
    expect(
      await prisma.title.findUniqueOrThrow({ where: { id: title.id } }),
      'PATCH must recompute aggregates',
    ).toMatchObject({ avgRating: 2, reviewCount: 1 });
    const deleted = await request(app).delete(`/api/reviews/${id}`).set(as(consumer));
    expect(deleted.status, 'owner deletion must succeed').toBe(204);
    expect(
      await prisma.review.findUnique({ where: { id } }),
      'DELETE must remove the header',
    ).toBeNull();
    expect(await ReviewBody.findById(id).lean(), 'DELETE must remove the matching body').toBeNull();
    expect(
      await prisma.title.findUniqueOrThrow({ where: { id: title.id } }),
      'DELETE must restore empty title totals',
    ).toMatchObject({ avgRating: 0, reviewCount: 0 });
  });

  it('creator self-review is forbidden without writing to either store', async () => {
    const creator = await createUser('CREATOR');
    const title = await createTitle({ createdById: creator.id });
    const response = await request(app)
      .post(`/api/titles/${title.id}/reviews`)
      .set(as(creator))
      .send({ rating: 5, body: 'My own title.' });
    expect(response.status, 'creators cannot inflate their own title ratings').toBe(403);
    expect(await prisma.review.count(), 'forbidden self-review must not create a header').toBe(0);
    expect(await ReviewBody.countDocuments(), 'forbidden self-review must not create a body').toBe(
      0,
    );
  });
});
