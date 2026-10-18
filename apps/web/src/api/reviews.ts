import type { Paginated } from '@bingemate/shared';
import { db, getMockActor, newId } from '../mocks/db.js';
import { MAX_RATING } from '../rating.js';
import type { Comment, Review, ReviewInput } from '../types/review.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

const PAGE_SIZE = 5;

/**
 * Moves a title's running average and count by one review (`sign` +1 adds, -1 removes), like the real
 * aggregates will. Works from the stored values so the seeded averages are not rebuilt from a few reviews.
 */
function applyToAggregates(titleId: string, rating: number, sign: 1 | -1) {
  const title = db.titles.find((t) => t.id === titleId);
  if (!title) return;
  const count = Math.max(0, title.reviewCount + sign);
  title.avgRating = count === 0 ? 0 : (title.avgRating * title.reviewCount + sign * rating) / count;
  title.reviewCount = count;
}

export const reviewsApi = {
  async listByTitle(titleId: string, page: number): Promise<Paginated<Review>> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
    const all = db.reviews
      .filter((r) => r.titleId === titleId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * PAGE_SIZE;
    return clone({
      data: all.slice(start, start + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total: all.length,
    });
  },

  /** The signed-in user's review of this title, or null. Lets the form know before the user writes one. */
  async mine(titleId: string): Promise<Review | null> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
    const review = db.reviews.find(
      (r) => r.titleId === titleId && r.author.id === getMockActor().id,
    );
    return review ? clone(review) : null;
  },

  async create(titleId: string, input: ReviewInput): Promise<Review> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > MAX_RATING) {
      throw new ApiError(400, `Rating must be a whole number from 1 to ${MAX_RATING}`);
    }
    if (!db.titles.some((t) => t.id === titleId)) throw new ApiError(404, 'Title not found');
    if (db.reviews.some((r) => r.titleId === titleId && r.author.id === getMockActor().id)) {
      throw new ApiError(409, 'You have already reviewed this title');
    }
    const review: Review = {
      id: newId('r'),
      titleId,
      author: { ...getMockActor() },
      rating: input.rating,
      body: input.body,
      fields: input.fields,
      createdAt: new Date().toISOString(),
    };
    db.reviews.push(review);
    applyToAggregates(titleId, review.rating, 1);
    return clone(review);
  },

  async remove(id: string): Promise<void> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
    const review = db.reviews.find((r) => r.id === id);
    if (review) applyToAggregates(review.titleId, review.rating, -1);
    db.reviews = db.reviews.filter((r) => r.id !== id);
    db.comments = db.comments.filter((c) => c.reviewId !== id);
  },
};

export const commentsApi = {
  /** Official replies first, then oldest first. */
  async list(reviewId: string): Promise<Comment[]> {
    if (!useMock) notWired('comment endpoints (HS)');
    await delay();
    return clone(
      db.comments
        .filter((c) => c.reviewId === reviewId)
        .sort(
          (a, b) =>
            Number(b.isOfficial) - Number(a.isOfficial) || a.createdAt.localeCompare(b.createdAt),
        ),
    );
  },

  async reply(reviewId: string, parentId: string | null, body: string): Promise<Comment> {
    if (!useMock) notWired('comment endpoints (HS)');
    await delay();
    const parent = parentId
      ? db.comments.find((c) => c.id === parentId && c.reviewId === reviewId)
      : undefined;
    if (parentId && !parent) throw new ApiError(404, 'Comment not found');
    if (parent?.parentId) throw new ApiError(400, 'Replies are limited to one level');
    const comment: Comment = {
      id: newId('c'),
      reviewId,
      parentId,
      author: { ...getMockActor() },
      body,
      isOfficial: false,
      createdAt: new Date().toISOString(),
    };
    db.comments.push(comment);
    return clone(comment);
  },

  async remove(id: string): Promise<void> {
    if (!useMock) notWired('comment endpoints (HS)');
    await delay();
    db.comments = db.comments.filter((c) => c.id !== id && c.parentId !== id);
  },
};
