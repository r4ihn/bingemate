import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { createTitle, createUser, resetDatabases } from './helpers.js';

// The review_rating_* triggers (migration 20261105120000_rating_triggers) keep Title.avgRating and
// reviewCount in sync with no application code. These tests write reviews straight through Prisma,
// bypassing the API, so only the database can be keeping the totals right.

beforeEach(resetDatabases);

const totals = (id: string) =>
  prisma.title.findUniqueOrThrow({
    where: { id },
    select: { avgRating: true, reviewCount: true, updatedAt: true },
  });

describe('real rating triggers', () => {
  it('insert, update and delete each recompute the title totals', async () => {
    const title = await createTitle();
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const before = await totals(title.id);

    const ra = await prisma.review.create({ data: { userId: a.id, titleId: title.id, rating: 5 } });
    await prisma.review.create({ data: { userId: b.id, titleId: title.id, rating: 2 } });
    expect(await totals(title.id), 'insert trigger').toMatchObject({
      reviewCount: 2,
      avgRating: 3.5,
    });

    await prisma.review.update({ where: { id: ra.id }, data: { rating: 3 } });
    expect(await totals(title.id), 'update trigger').toMatchObject({
      reviewCount: 2,
      avgRating: 2.5,
    });

    await prisma.review.deleteMany({ where: { titleId: title.id } });
    const after = await totals(title.id);
    expect(after, 'delete trigger').toMatchObject({ reviewCount: 0, avgRating: 0 });
    expect(after.updatedAt, 'a review is not an edit of the title').toEqual(before.updatedAt);
  });

  it('rounds exactly like title_rating_stats (numeric ROUND, not float)', async () => {
    // 41 / 40 = 1.025: a float rounds this tie down to 1.02, numeric ROUND gives 1.03.
    const title = await createTitle();
    const users = await Promise.all(Array.from({ length: 40 }, () => createUser()));
    await prisma.review.createMany({
      data: users.map((u, i) => ({ userId: u.id, titleId: title.id, rating: i === 0 ? 2 : 1 })),
    });
    expect(await totals(title.id)).toMatchObject({ reviewCount: 40, avgRating: 1.03 });
  });

  it('one bulk insert over several titles updates every one of them', async () => {
    const [t1, t2, untouched] = await Promise.all([createTitle(), createTitle(), createTitle()]);
    const users = await Promise.all(Array.from({ length: 3 }, () => createUser()));
    await prisma.review.createMany({
      data: [
        { userId: users[0]!.id, titleId: t1.id, rating: 4 },
        { userId: users[1]!.id, titleId: t1.id, rating: 5 },
        { userId: users[2]!.id, titleId: t2.id, rating: 1 },
      ],
    });
    expect(await totals(t1.id)).toMatchObject({ reviewCount: 2, avgRating: 4.5 });
    expect(await totals(t2.id)).toMatchObject({ reviewCount: 1, avgRating: 1 });
    expect(await totals(untouched.id)).toMatchObject({ reviewCount: 0, avgRating: 0 });
  });

  it('deleting a user updates the titles their reviews cascaded away from', async () => {
    const [t1, t2] = await Promise.all([createTitle(), createTitle()]);
    const [leaver, stayer] = await Promise.all([createUser(), createUser()]);
    await prisma.review.createMany({
      data: [
        { userId: leaver.id, titleId: t1.id, rating: 1 },
        { userId: leaver.id, titleId: t2.id, rating: 1 },
        { userId: stayer.id, titleId: t1.id, rating: 5 },
      ],
    });
    expect(await totals(t1.id)).toMatchObject({ reviewCount: 2, avgRating: 3 });

    // ON DELETE CASCADE removes the reviews; no application code runs for them.
    await prisma.user.delete({ where: { id: leaver.id } });

    expect(await totals(t1.id)).toMatchObject({ reviewCount: 1, avgRating: 5 });
    expect(await totals(t2.id)).toMatchObject({ reviewCount: 0, avgRating: 0 });
  });

  it('moving a review to another title updates both the old and the new title', async () => {
    const [from, to] = await Promise.all([createTitle(), createTitle()]);
    const user = await createUser();
    const review = await prisma.review.create({
      data: { userId: user.id, titleId: from.id, rating: 4 },
    });

    await prisma.review.update({ where: { id: review.id }, data: { titleId: to.id } });

    expect(await totals(from.id)).toMatchObject({ reviewCount: 0, avgRating: 0 });
    expect(await totals(to.id)).toMatchObject({ reviewCount: 1, avgRating: 4 });
  });

  it('stored totals equal the view for every title after mixed writes', async () => {
    const titles = await Promise.all(Array.from({ length: 4 }, () => createTitle()));
    const users = await Promise.all(Array.from({ length: 6 }, () => createUser()));
    await prisma.review.createMany({
      data: users.flatMap((u, i) =>
        titles.slice(0, (i % 4) + 1).map((t, j) => ({
          userId: u.id,
          titleId: t.id,
          rating: ((i + j) % 5) + 1,
        })),
      ),
    });
    await prisma.review.updateMany({ where: { rating: 1 }, data: { rating: 2 } });
    await prisma.review.deleteMany({ where: { rating: 5 } });

    const drift = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS "n" FROM "Title" t
      JOIN "title_rating_stats" s ON s."title_id" = t."id"
      WHERE t."reviewCount" <> s."review_count" OR t."avgRating" <> s."avg_rating"`;
    expect(drift[0]?.n).toBe(0);
  });
});
