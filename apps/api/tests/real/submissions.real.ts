import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { ReviewBody } from '../../src/mongo/models/reviewBody.model.js';
import { Reply } from '../../src/mongo/models/reply.model.js';
import { TitlePoster } from '../../src/mongo/models/titlePoster.model.js';
import { as, createTitle, createUser, resetDatabases } from './helpers.js';

const app = createApp();
beforeEach(resetDatabases);

describe('real title submissions', () => {
  it('submission starts pending, admin approval checks updatedAt, and creator edits require moderation again', async () => {
    const creator = await createUser('CREATOR');
    const admin = await createUser('ADMIN');
    const created = await request(app)
      .post('/api/titles')
      .set(as(creator))
      .send({ name: 'Real submission', mediaType: 'BOOK', description: 'First draft.' });
    expect(created.status, 'creators must be able to submit titles').toBe(201);
    expect(created.body, 'new submissions must remain hidden until moderation').toMatchObject({
      status: 'PENDING',
      createdById: creator.id,
    });
    const id = created.body.id as string;
    // A deterministic old version avoids relying on clock resolution or a sleep.
    const stale = new Date(new Date(created.body.updatedAt).getTime() - 1000).toISOString();
    const approved = await request(app)
      .patch(`/api/admin/titles/${id}/status`)
      .set(as(admin))
      .send({ status: 'APPROVED', updatedAt: created.body.updatedAt });
    expect(approved.status, 'matching updatedAt must allow approval').toBe(200);
    expect(
      await prisma.title.findUniqueOrThrow({ where: { id } }),
      'approval must persist in PostgreSQL',
    ).toMatchObject({ status: 'APPROVED' });
    const conflict = await request(app)
      .patch(`/api/admin/titles/${id}/status`)
      .set(as(admin))
      .send({ status: 'REJECTED', rejectionReason: 'Stale moderation', updatedAt: stale });
    expect(conflict.status, 'stale moderation must not overwrite newer decisions').toBe(409);
    expect(
      await prisma.title.findUniqueOrThrow({ where: { id } }),
      'stale writes must preserve approval',
    ).toMatchObject({ status: 'APPROVED' });
    const edited = await request(app)
      .patch(`/api/titles/${id}`)
      .set(as(creator))
      .send({ description: 'Second draft.' });
    expect(edited.status, 'creator must be able to edit their approved submission').toBe(200);
    expect(
      await prisma.title.findUniqueOrThrow({ where: { id } }),
      'editing approved content must require reapproval',
    ).toMatchObject({ status: 'PENDING', description: 'Second draft.' });
  });

  it.each(['reviewed', 'listed'] as const)(
    'creator deletion preserves a title another user has %s',
    async (activity) => {
      const creator = await createUser('CREATOR');
      const consumer = await createUser();
      const title = await createTitle({ createdById: creator.id });
      const activityResponse =
        activity === 'reviewed'
          ? await request(app)
              .post(`/api/titles/${title.id}/reviews`)
              .set(as(consumer))
              .send({ rating: 4, body: 'Keep this review.' })
          : await request(app)
              .post('/api/me/lists')
              .set(as(consumer))
              .send({ titleId: title.id, status: 'PLAN_TO' });
      expect(
        activityResponse.status,
        'blocking activity must exist before attempting deletion',
      ).toBe(201);
      const deleted = await request(app).delete(`/api/titles/${title.id}`).set(as(creator));
      expect(deleted.status, 'creator deletion must protect other users activity').toBe(409);
      expect(
        await prisma.title.findUnique({ where: { id: title.id } }),
        'blocked deletion must keep the title',
      ).not.toBeNull();
      if (activity === 'reviewed') {
        expect(
          await prisma.review.count({ where: { titleId: title.id } }),
          'blocked deletion must keep review headers',
        ).toBe(1);
        expect(
          await ReviewBody.countDocuments({ titleId: title.id }),
          'blocked deletion must keep review bodies',
        ).toBe(1);
      } else {
        expect(
          await prisma.listEntry.count({ where: { titleId: title.id } }),
          'blocked deletion must keep list entries',
        ).toBe(1);
      }
    },
  );

  it('creator deletion without other activity removes the title and Mongo bodies and poster', async () => {
    const creator = await createUser('CREATOR');
    const title = await createTitle({ createdById: creator.id });
    // Mongo leftovers have no PostgreSQL review activity. They must still be cleaned up.
    const reviewId = randomUUID();
    await ReviewBody.create({
      _id: reviewId,
      titleId: title.id,
      userId: creator.id,
      mediaType: title.mediaType,
      body: 'Leftover body.',
    });
    await Reply.create({ reviewId, userId: creator.id, body: 'Leftover reply.' });
    await TitlePoster.create({
      _id: title.id,
      contentType: 'image/png',
      data: Buffer.from('poster'),
      version: 1,
    });
    expect(
      await ReviewBody.countDocuments({ titleId: title.id }),
      'cleanup fixture must contain a body',
    ).toBe(1);
    expect(await Reply.countDocuments({ reviewId }), 'cleanup fixture must contain a reply').toBe(
      1,
    );
    expect(
      await TitlePoster.countDocuments({ _id: title.id }),
      'cleanup fixture must contain a poster',
    ).toBe(1);
    const deleted = await request(app).delete(`/api/titles/${title.id}`).set(as(creator));
    expect(deleted.status, 'creator deletion without relational activity must succeed').toBe(204);
    expect(
      await prisma.title.findUnique({ where: { id: title.id } }),
      'successful deletion must remove the title',
    ).toBeNull();
    expect(
      await ReviewBody.countDocuments({ titleId: title.id }),
      'title deletion must clear leftover bodies',
    ).toBe(0);
    // Replies under leftover bodies are cleanupOrphans' job.
    expect(
      await TitlePoster.countDocuments({ _id: title.id }),
      'title deletion must clear the poster',
    ).toBe(0);
  });

  it('admin deletion of a reviewed title removes the review, its replies, its body and the poster', async () => {
    const creator = await createUser('CREATOR');
    const consumer = await createUser();
    const admin = await createUser('ADMIN');
    const title = await createTitle({ status: 'APPROVED', createdById: creator.id });
    const unrelatedTitle = await createTitle({ status: 'APPROVED', createdById: creator.id });
    const reviewIds: string[] = [];
    const replyIds: string[] = [];
    for (const reviewedTitle of [title, unrelatedTitle]) {
      const review = await request(app)
        .post(`/api/titles/${reviewedTitle.id}/reviews`)
        .set(as(consumer))
        .send({ rating: 4, body: 'A review with a reply.' });
      expect(review.status, 'consumer review must exist before attempting deletion').toBe(201);
      const reviewId = review.body.id as string;
      reviewIds.push(reviewId);
      const reply = await request(app)
        .post(`/api/reviews/${reviewId}/replies`)
        .set(as(creator))
        .send({ body: 'A reply from the creator.' });
      expect(reply.status, 'creator reply must exist before attempting deletion').toBe(201);
      replyIds.push(reply.body.id as string);
      expect(
        await ReviewBody.countDocuments({ _id: reviewId, titleId: reviewedTitle.id }),
        'review fixture must contain a body',
      ).toBe(1);
      expect(
        await Reply.countDocuments({ _id: reply.body.id, reviewId }),
        'review fixture must contain a reply',
      ).toBe(1);
    }
    await TitlePoster.create({
      _id: title.id,
      contentType: 'image/png',
      data: Buffer.from('poster'),
      version: 1,
    });
    expect(
      await TitlePoster.countDocuments({ _id: title.id }),
      'cleanup fixture must contain a poster',
    ).toBe(1);

    const deleted = await request(app).delete(`/api/titles/${title.id}`).set(as(admin));
    expect(deleted.status, 'admin deletion must succeed despite another user review').toBe(204);
    expect(
      await prisma.title.findUnique({ where: { id: title.id } }),
      'admin deletion must remove the title',
    ).toBeNull();
    expect(
      await prisma.review.findUnique({ where: { id: reviewIds[0] } }),
      'admin deletion must remove the review',
    ).toBeNull();
    expect(
      await ReviewBody.countDocuments({ titleId: title.id }),
      'admin deletion must clear review bodies',
    ).toBe(0);
    expect(
      await Reply.countDocuments({ reviewId: reviewIds[0] }),
      'admin deletion must clear the review replies',
    ).toBe(0);
    expect(
      await TitlePoster.countDocuments({ _id: title.id }),
      'admin deletion must clear the poster',
    ).toBe(0);
    expect(
      await ReviewBody.countDocuments({ _id: reviewIds[1], titleId: unrelatedTitle.id }),
      'admin deletion must preserve unrelated review bodies',
    ).toBe(1);
    expect(
      await Reply.countDocuments({ _id: replyIds[1], reviewId: reviewIds[1] }),
      'admin deletion must preserve unrelated replies',
    ).toBe(1);
  });

  it('delete versus list-add serializes on the title row across ten concurrent races', async () => {
    for (let iteration = 0; iteration < 10; iteration++) {
      const creator = await createUser('CREATOR');
      const consumer = await createUser();
      const title = await createTitle({ createdById: creator.id });
      const [listed, deleted] = await Promise.all([
        request(app)
          .post('/api/me/lists')
          .set(as(consumer))
          .send({ titleId: title.id, status: 'PLAN_TO' }),
        request(app).delete(`/api/titles/${title.id}`).set(as(creator)),
      ]);
      const outcome = [listed.status, deleted.status];
      expect(
        [
          [201, 409],
          [404, 204],
        ],
        `race ${iteration}: exactly one lock winner must determine the outcome`,
      ).toContainEqual(outcome);
      expect(
        outcome,
        `race ${iteration}: successful list creation must never coexist with successful deletion`,
      ).not.toEqual([201, 204]);
      const remaining = await prisma.title.findUnique({ where: { id: title.id } });
      const entries = await prisma.listEntry.count({ where: { titleId: title.id } });
      if (deleted.status === 204) {
        expect(
          remaining,
          `race ${iteration}: successful deletion must remove the title`,
        ).toBeNull();
        expect(entries, `race ${iteration}: a deleted title must have no list entries`).toBe(0);
      } else {
        expect(
          remaining,
          `race ${iteration}: successful list addition must preserve the title`,
        ).not.toBeNull();
        expect(
          entries,
          `race ${iteration}: successful list addition must persist exactly one entry`,
        ).toBe(1);
      }
    }
  });
});
