import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { ReviewBody } from '../../src/mongo/models/reviewBody.model.js';
import { as, createTitle, createUser, resetDatabases } from './helpers.js';

const app = createApp();
beforeEach(resetDatabases);

describe('real admin users and roles', () => {
  it('lists every account newest first and pages with a stable total', async () => {
    const admin = await createUser('ADMIN');
    const older = await createUser();
    const newer = await createUser();
    await prisma.user.update({
      where: { id: older.id },
      data: { createdAt: new Date('2026-01-01') },
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { createdAt: new Date('2026-02-01') },
    });
    await prisma.user.update({
      where: { id: newer.id },
      data: { createdAt: new Date('2026-03-01') },
    });

    const first = await request(app).get('/api/admin/users?pageSize=2').set(as(admin));
    expect(first.status, 'an admin must be able to list users').toBe(200);
    expect(first.body, 'page 1 must hold the two newest accounts').toEqual({
      data: [
        { id: newer.id, email: newer.email, role: 'MEMBER' },
        { id: admin.id, email: admin.email, role: 'ADMIN' },
      ],
      page: 1,
      pageSize: 2,
      total: 3,
    });
    const second = await request(app).get('/api/admin/users?pageSize=2&page=2').set(as(admin));
    expect(second.body.data, 'page 2 must hold the oldest account only').toEqual([
      { id: older.id, email: older.email, role: 'MEMBER' },
    ]);
    expect(first.body.data[0], 'a password hash must never leave the API').not.toHaveProperty(
      'passwordHash',
    );
  });

  it('stores a new role, refuses your own and 404s an unknown id', async () => {
    const admin = await createUser('ADMIN');
    const member = await createUser();

    const promoted = await request(app)
      .patch(`/api/admin/users/${member.id}/role`)
      .set(as(admin))
      .send({ role: 'ADMIN' });
    expect(promoted.status, 'an admin must be able to change another user’s role').toBe(200);
    expect(promoted.body).toEqual({ id: member.id, email: member.email, role: 'ADMIN' });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).role,
      'the new role must be persisted',
    ).toBe('ADMIN');

    const self = await request(app)
      .patch(`/api/admin/users/${admin.id}/role`)
      .set(as(admin))
      .send({ role: 'MEMBER' });
    expect(self.status, 'an admin cannot change their own role').toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe('ADMIN');

    const unknown = await request(app)
      .patch('/api/admin/users/no-such-user/role')
      .set(as(admin))
      .send({ role: 'MEMBER' });
    expect(unknown.status, 'an unknown id must be a 404').toBe(404);
  });

  it('refuses a member on every admin route', async () => {
    const member = await createUser();
    const other = await createUser();
    for (const [method, path] of [
      ['get', '/api/admin/users'],
      ['patch', `/api/admin/users/${other.id}/role`],
      ['get', '/api/admin/reviews'],
    ] as const) {
      const res = await request(app)[method](path).set(as(member)).send({ role: 'ADMIN' });
      expect(res.status, `${method.toUpperCase()} ${path} must refuse a member`).toBe(403);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe('MEMBER');
  });
});

describe('real admin review moderation', () => {
  it('lists reviews across titles with names and MongoDB bodies, and an admin delete removes both', async () => {
    const admin = await createUser('ADMIN');
    const ann = await createUser();
    const ben = await createUser();
    const dune = await createTitle();
    const arrival = await createTitle();

    const first = await request(app)
      .post(`/api/titles/${dune.id}/reviews`)
      .set(as(ann))
      .send({ rating: 4, body: 'Great sand.' });
    const second = await request(app)
      .post(`/api/titles/${arrival.id}/reviews`)
      .set(as(ben))
      .send({ rating: 2, body: 'Too slow.' });
    expect([first.status, second.status], 'fixtures must be created through the real API').toEqual([
      201, 201,
    ]);
    await prisma.review.update({
      where: { id: first.body.id },
      data: { createdAt: new Date('2026-01-01') },
    });

    const listed = await request(app).get('/api/admin/reviews').set(as(admin));
    expect(listed.status, 'an admin must be able to list every review').toBe(200);
    expect(listed.body.total).toBe(2);
    expect(listed.body.data, 'newest first, joined to title names and bodies').toEqual([
      expect.objectContaining({
        id: second.body.id,
        titleId: arrival.id,
        titleName: arrival.name,
        rating: 2,
        body: 'Too slow.',
        author: { id: ben.id, name: expect.any(String) },
      }),
      expect.objectContaining({
        id: first.body.id,
        titleId: dune.id,
        titleName: dune.name,
        rating: 4,
        body: 'Great sand.',
      }),
    ]);

    const removed = await request(app).delete(`/api/reviews/${first.body.id}`).set(as(admin));
    expect(removed.status, 'the Moderation page deletes through DELETE /reviews/:id').toBe(204);
    expect(await prisma.review.findUnique({ where: { id: first.body.id } })).toBeNull();
    expect(await ReviewBody.findById(first.body.id).lean(), 'the body must go too').toBeNull();
    const after = await request(app).get('/api/admin/reviews').set(as(admin));
    expect(after.body.data.map((r: { id: string }) => r.id)).toEqual([second.body.id]);
  });
});
