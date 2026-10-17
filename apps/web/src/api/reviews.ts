import { Role } from '@bingemate/shared';
import type { Paginated } from '@bingemate/shared';
import { MOCK_USER, db, newId } from '../mocks/db.js';
import type { Comment, Review, ReviewInput } from '../types/review.js';
import { ApiError } from './client.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

const PAGE_SIZE = 5;

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

  async create(titleId: string, input: ReviewInput): Promise<Review> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 10) {
      throw new ApiError(400, 'Rating must be a whole number from 1 to 10');
    }
    if (!db.titles.some((t) => t.id === titleId)) throw new ApiError(404, 'Title not found');
    if (db.reviews.some((r) => r.titleId === titleId && r.author.id === MOCK_USER)) {
      throw new ApiError(409, 'You have already reviewed this title');
    }
    const review: Review = {
      id: newId('r'),
      titleId,
      author: { id: MOCK_USER, name: 'You', role: Role.CONSUMER },
      rating: input.rating,
      body: input.body,
      fields: input.fields,
      createdAt: new Date().toISOString(),
    };
    db.reviews.push(review);
    return clone(review);
  },

  async remove(id: string): Promise<void> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
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
    const parent = parentId ? db.comments.find((c) => c.id === parentId) : undefined;
    if (parentId && !parent) throw new ApiError(404, 'Comment not found');
    if (parent?.parentId) throw new ApiError(400, 'Replies are limited to one level');
    const comment: Comment = {
      id: newId('c'),
      reviewId,
      parentId,
      author: { id: MOCK_USER, name: 'You', role: Role.CONSUMER },
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
