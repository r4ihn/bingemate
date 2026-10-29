import { beforeEach, describe, expect, it } from 'vitest';
import { Role } from '@bingemate/shared';
import { db, resetDb, setMockActor } from '../mocks/db.js';
import { ApiError } from './client.js';
import { repliesApi, reviewsApi } from './reviews.js';

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

  it('cannot reply to a review', async () => {
    await refused(repliesApi.create(REVIEW, 'hello'), 403);
  });

  it('cannot edit a reply', async () => {
    await refused(repliesApi.update('rp1', 'changed'), 403);
  });

  it('can still delete a review and a reply', async () => {
    await expect(repliesApi.remove('rp1')).resolves.toBeUndefined();
    await expect(reviewsApi.remove(REVIEW)).resolves.toBeUndefined();
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
    const reply = await repliesApi.create(REVIEW, 'Thanks for watching');
    expect(reply.author.id).toBe('creator-1');
  });

  it('can review a title someone else created', async () => {
    await expect(reviewsApi.create('mock-20', input)).resolves.toMatchObject({ rating: 4 });
  });
});

describe('editing a reply', () => {
  // rp1 was written by AUTHORS[0] ('u-maya')
  const asWriter = () => asRole(Role.CONSUMER, 'u-maya');

  it('lets the writer change the text, keeps the date and marks it edited', async () => {
    asWriter();
    const before = db.replies.find((r) => r.id === 'rp1')!.createdAt;
    const edited = await repliesApi.update('rp1', '  better words  ');
    expect(edited).toMatchObject({ id: 'rp1', body: 'better words', createdAt: before });
    expect(edited.editedAt).toBeDefined();
    expect(db.replies.find((r) => r.id === 'rp1')?.body).toBe('better words');
  });

  it('refuses everyone else, including a creator and the title creator', async () => {
    asRole(Role.CONSUMER, 'someone-else');
    await refused(repliesApi.update('rp1', 'hijack'), 403);
    asRole(Role.CREATOR, 'creator-1');
    await refused(repliesApi.update('rp1', 'hijack'), 403);
    expect(db.replies.find((r) => r.id === 'rp1')?.body).toBe('Great pacing in the second half.');
  });

  it('refuses an empty text and an unknown reply', async () => {
    asWriter();
    await refused(repliesApi.update('rp1', '   '), 400);
    await refused(repliesApi.update('rp-nope', 'x'), 404);
  });
});
