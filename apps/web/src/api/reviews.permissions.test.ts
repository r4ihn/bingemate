import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '@bingemate/shared';
import { db, resetDb, setMockActor } from '../mocks/db.js';
import { ApiError } from './client.js';
import { commentsApi, reviewsApi } from './reviews.js';

const input = { rating: 4, body: 'Fine', fields: { runtimeMinutes: 90 } };
const asRole = (role: Role, id = 'actor-1') =>
  setMockActor({ id, email: `${role.toLowerCase()}@test.dev`, role });
const refused = (p: Promise<unknown>, status: number) =>
  expect(p).rejects.toMatchObject({ status, name: ApiError.name });

const REVIEW = 'r-mock-2-0';

beforeEach(() => resetDb());

describe('admins read and moderate but do not write', () => {
  beforeEach(() => asRole(Role.ADMIN));

  it('cannot create or edit a review', async () => {
    await refused(reviewsApi.create('mock-20', input), 403);
    await refused(reviewsApi.update(REVIEW, input), 403);
  });

  it('cannot post a comment or a reply', async () => {
    await refused(commentsApi.reply(REVIEW, null, 'hello'), 403);
  });

  it('can still delete a review and a comment', async () => {
    await commentsApi.reply(REVIEW, null, 'x').catch(() => undefined);
    await expect(reviewsApi.remove(REVIEW)).resolves.toBeUndefined();
    await expect(commentsApi.remove('c1')).resolves.toBeUndefined();
  });
});

describe('the creator of a title', () => {
  beforeEach(() => {
    asRole(Role.CREATOR, 'creator-1');
    db.titles.find((t) => t.id === 'mock-2')!.createdBy = 'creator-1';
  });

  it('cannot review their own title', async () => {
    await refused(reviewsApi.create('mock-2', input), 403);
  });

  it('cannot edit a review on their own title', async () => {
    db.reviews.push({
      ...db.reviews.find((r) => r.id === REVIEW)!,
      id: 'r-self',
      author: { id: 'creator-1', name: 'creator', role: Role.CREATOR },
    });
    await refused(reviewsApi.update('r-self', input), 403);
  });

  it('can reply to a review on their own title', async () => {
    const c = await commentsApi.reply(REVIEW, null, 'Thanks for watching');
    expect(c.author.id).toBe('creator-1');
  });

  it('can review a title someone else created', async () => {
    await expect(reviewsApi.create('mock-20', input)).resolves.toMatchObject({ rating: 4 });
  });
});
