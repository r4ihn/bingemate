import { beforeEach, describe, expect, it } from 'vitest';
import { ListStatus, MediaType, Role, TitleStatus } from '@bingemate/shared';
import { db, resetDb, setMockActor } from '../mocks/db.js';
import { adminApi } from './admin.js';
import { creatorApi } from './creator.js';
import { listsApi } from './lists.js';
import { reviewsApi, commentsApi } from './reviews.js';
import { titlesApi } from './titles.js';

beforeEach(() => resetDb());

describe('creatorApi', () => {
  it('update on an APPROVED title returns status PENDING', async () => {
    const own = db.titles.find(
      (t) => t.createdBy === 'mock-user' && t.status === TitleStatus.APPROVED,
    );
    expect(own).toBeDefined();
    const updated = await creatorApi.update(own!.id, { name: 'Renamed' });
    expect(updated.title.name).toBe('Renamed');
    expect(updated.title.status).toBe(TitleStatus.PENDING);
  });

  it('editing a REJECTED title resubmits it as PENDING and clears the reason', async () => {
    const rejected = db.titles.find(
      (t) => t.status === TitleStatus.REJECTED && t.createdBy === 'mock-user',
    );
    expect(rejected).toBeDefined();
    const updated = await creatorApi.update(rejected!.id, { name: 'Fixed poster' });
    expect(updated.title.status).toBe(TitleStatus.PENDING);
    expect(updated.rejectionReason).toBeUndefined();
  });

  it('submit saves a new title as PENDING', async () => {
    const s = await creatorApi.submit({
      name: 'New One',
      mediaType: MediaType.BOOK,
      synopsis: 'x',
    });
    expect(s.title.status).toBe(TitleStatus.PENDING);
    expect((await creatorApi.submissions()).some((x) => x.title.id === s.title.id)).toBe(true);
  });
});

describe('reviewsApi', () => {
  it.each([0, 6, 4.5, Number.NaN])('create rejects rating %s', async (rating) => {
    await expect(
      reviewsApi.create('mock-1', { rating, body: 'ok', fields: { runtimeMinutes: 100 } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('create accepts the top rating, 5', async () => {
    const review = await reviewsApi.create('mock-1', {
      rating: 5,
      body: 'ok',
      fields: { runtimeMinutes: 100 },
    });
    expect(review.rating).toBe(5);
  });

  it('create rejects a second review by the same user on the same title (409)', async () => {
    const input = { rating: 4, body: 'ok', fields: { runtimeMinutes: 100 } };
    await reviewsApi.create('mock-20', input);
    await expect(reviewsApi.create('mock-20', input)).rejects.toMatchObject({ status: 409 });
  });

  it('listByTitle returns an empty page for a title with no reviews', async () => {
    const page = await reviewsApi.listByTitle('mock-20', 1);
    expect(page.data).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('listByTitle paginates (page 2 of a busy title is shorter than page 1)', async () => {
    const p1 = await reviewsApi.listByTitle('mock-1', 1);
    const p2 = await reviewsApi.listByTitle('mock-1', 2);
    expect(p1.data.length).toBe(p1.pageSize);
    expect(p2.data.length).toBeGreaterThan(0);
    expect(p2.data.length).toBeLessThanOrEqual(p1.pageSize);
  });
});

describe('commentsApi', () => {
  it('reply rejects a reply to a reply (one level only)', async () => {
    const reply = db.comments.find((c) => c.parentId !== null)!;
    await expect(commentsApi.reply(reply.reviewId, reply.id, 'nested')).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('listsApi', () => {
  it('list filters by status and media type', async () => {
    const all = await listsApi.list({ page: 1 });
    const done = await listsApi.list({ status: ListStatus.COMPLETED, page: 1 });
    expect(done.data.length).toBeGreaterThan(0);
    expect(done.data.every((e) => e.status === ListStatus.COMPLETED)).toBe(true);
    expect(done.total).toBeLessThan(all.total);

    const books = await listsApi.list({ mediaType: MediaType.BOOK, page: 1 });
    expect(books.data.every((e) => e.title.mediaType === MediaType.BOOK)).toBe(true);
  });

  it('forTitle returns the entry for a listed title and null otherwise', async () => {
    expect((await listsApi.forTitle('mock-1'))?.id).toBe('l-1');
    expect(await listsApi.forTitle('mock-20')).toBeNull();
  });

  it('add puts a title on the list with the chosen status', async () => {
    const entry = await listsApi.add('mock-20', ListStatus.PLAN_TO);
    expect(entry).toMatchObject({ titleId: 'mock-20', status: ListStatus.PLAN_TO });
    expect((await listsApi.forTitle('mock-20'))?.id).toBe(entry.id);
  });

  it('add rejects a title that is already listed (409) or unknown (404)', async () => {
    await expect(listsApi.add('mock-1', ListStatus.PLAN_TO)).rejects.toMatchObject({ status: 409 });
    await expect(listsApi.add('nope', ListStatus.PLAN_TO)).rejects.toMatchObject({ status: 404 });
  });
});

describe('titlesApi and adminApi', () => {
  it('titlesApi.get rejects with 404 for an unknown id', async () => {
    await expect(titlesApi.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('adminApi.setTitleStatus moves a title out of the pending queue', async () => {
    const [first] = await adminApi.pendingTitles();
    await adminApi.setTitleStatus(first!.id, TitleStatus.REJECTED, 'Poster missing');
    expect((await adminApi.pendingTitles()).some((t) => t.id === first!.id)).toBe(false);
    expect(db.titles.find((t) => t.id === first!.id)?.rejectionReason).toBe('Poster missing');
  });

  it('adminApi.reviews pages newest first with title names', async () => {
    const p1 = await adminApi.reviews(1);
    expect(p1.data).toHaveLength(p1.pageSize);
    expect(p1.total).toBe(db.reviews.length);
    expect(p1.data[0]?.titleName).toBe(db.titles.find((t) => t.id === p1.data[0]?.titleId)?.name);
    expect(p1.data[0]!.createdAt >= p1.data[1]!.createdAt).toBe(true);
  });

  it('adminApi.removeReview also removes the review comments', async () => {
    expect(db.comments.some((c) => c.reviewId === 'r-mock-1-0')).toBe(true);
    await adminApi.removeReview('r-mock-1-0');
    expect(db.reviews.some((r) => r.id === 'r-mock-1-0')).toBe(false);
    expect(db.comments.some((c) => c.reviewId === 'r-mock-1-0')).toBe(false);
  });

  it('adminApi.setRole changes a user role', async () => {
    const page = await adminApi.users(1);
    const target = page.data.find((u) => u.role === Role.CONSUMER)!;
    await adminApi.setRole(target.id, Role.CREATOR);
    expect(db.users.find((u) => u.id === target.id)?.role).toBe(Role.CREATOR);
  });
});

describe('titlesApi.search', () => {
  it('matches the name case-insensitively and returns only APPROVED titles', async () => {
    const page = await titlesApi.search({ q: 'SALT' });
    expect(page.items.map((t) => t.name)).toContain('Salt Archive');
    expect(page.items.every((t) => t.status === TitleStatus.APPROVED)).toBe(true);
    db.titles.push({
      ...db.titles[0]!,
      id: 'p',
      name: 'Salt Pending',
      status: TitleStatus.PENDING,
    });
    const again = await titlesApi.search({ q: 'salt' });
    expect(again.items.map((t) => t.name)).not.toContain('Salt Pending');
  });

  it('narrows by media type', async () => {
    const page = await titlesApi.search({ type: MediaType.BOOK });
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.every((t) => t.mediaType === MediaType.BOOK)).toBe(true);
  });

  it('paginates and reports the full total', async () => {
    const all = await titlesApi.search({});
    const first = await titlesApi.search({ page: 1, pageSize: 5 });
    const second = await titlesApi.search({ page: 2, pageSize: 5 });
    expect(first.items).toHaveLength(5);
    expect(first.total).toBe(all.total);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });

  it('treats a blank query as no filter', async () => {
    const all = await titlesApi.search({});
    expect((await titlesApi.search({ q: '   ' })).total).toBe(all.total);
  });
});

describe('mock writes follow the signed-in user', () => {
  const alex = { id: 'user-alex', email: 'alex@example.com', role: Role.CONSUMER };
  const studio = { id: 'user-studio', email: 'studio@example.com', role: Role.CREATOR };
  const input = { rating: 4, body: 'ok', fields: { runtimeMinutes: 100 } };

  it('a review is stored under the signed-in user, with their role', async () => {
    setMockActor(alex);
    const review = await reviewsApi.create('mock-20', input);
    expect(review.author).toEqual({ id: 'user-alex', name: 'alex', role: Role.CONSUMER });
  });

  it('two users can each review the same title', async () => {
    setMockActor(alex);
    await reviewsApi.create('mock-20', input);
    setMockActor({ ...alex, id: 'user-sam', email: 'sam@example.com' });
    await expect(reviewsApi.create('mock-20', input)).resolves.toBeDefined();
  });

  it('a creator comment carries the CREATOR role', async () => {
    setMockActor(studio);
    const [review] = db.reviews;
    const comment = await commentsApi.reply((review as { id: string }).id, null, 'Thanks!');
    expect(comment.author).toMatchObject({ id: 'user-studio', role: Role.CREATOR });
  });

  it("a creator sees their own submissions and the demo titles, not another creator's", async () => {
    setMockActor(studio);
    const mine = await creatorApi.submit({
      name: 'Mine',
      mediaType: MediaType.MOVIE,
      synopsis: 'x',
    });
    setMockActor({ ...studio, id: 'user-other', email: 'other@example.com' });
    const theirs = await creatorApi.submissions();
    expect(theirs.some((s) => s.title.id === mine.title.id)).toBe(false);
    expect(theirs.length).toBeGreaterThan(0); // the seeded demo titles still show
  });

  it('with nobody signed in the writes fall back to the demo user', async () => {
    setMockActor(null);
    const review = await reviewsApi.create('mock-20', input);
    expect(review.author.id).toBe('mock-user');
  });
});
