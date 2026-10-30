import type { Paginated, ReplyDTO, ReviewDTO } from '@bingemate/shared';
import { Role } from '@bingemate/shared';
import { db, getMockActor, newId, ownerId } from '../mocks/db.js';
import { RATING_MAX, RATING_MIN } from '../rating.js';
import type { Reply, Review, ReviewInput } from '../types/review.js';
import { ApiError, apiFetch } from './client.js';
import { mapReply, mapReview } from './mappers.js';
import { clone, delay, notWired, useMock } from './mockMode.js';

const PAGE_SIZE = 5;

/** Admins read and moderate (delete); they never write reviews or replies. */
function assertCanWrite(): void {
  if (getMockActor().role === Role.ADMIN) {
    throw new ApiError(403, 'Admins cannot write reviews or replies');
  }
}

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

/** A creator replies to reviews of their own title but does not review it. */
function assertNotOwnTitle(titleId: string): void {
  const title = db.titles.find((t) => t.id === titleId);
  if (title && ownerId(title) === getMockActor().id) {
    throw new ApiError(403, 'You cannot review a title you created');
  }
}

export const reviewsApi = {
  async listByTitle(titleId: string, page: number): Promise<Paginated<Review>> {
    if (!useMock) {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      const res = await apiFetch<Paginated<ReviewDTO>>(
        `/titles/${encodeURIComponent(titleId)}/reviews?${params}`,
      );
      return { ...res, data: res.data.map(mapReview) };
    }
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
    assertCanWrite();
    if (!Number.isInteger(input.rating) || input.rating < RATING_MIN || input.rating > RATING_MAX) {
      throw new ApiError(400, `Rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}`);
    }
    if (!db.titles.some((t) => t.id === titleId)) throw new ApiError(404, 'Title not found');
    assertNotOwnTitle(titleId);
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

  /** Owner only. Keeps the original date and moves the title's average by the change in rating. */
  async update(id: string, input: ReviewInput): Promise<Review> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
    assertCanWrite();
    if (!Number.isInteger(input.rating) || input.rating < RATING_MIN || input.rating > RATING_MAX) {
      throw new ApiError(400, `Rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}`);
    }
    const review = db.reviews.find((r) => r.id === id);
    if (!review) throw new ApiError(404, 'Review not found');
    if (review.author.id !== getMockActor().id) {
      throw new ApiError(403, 'You can only edit your own review');
    }
    assertNotOwnTitle(review.titleId);
    applyToAggregates(review.titleId, review.rating, -1);
    review.rating = input.rating;
    review.body = input.body;
    review.fields = input.fields;
    applyToAggregates(review.titleId, review.rating, 1);
    return clone(review);
  },

  async remove(id: string): Promise<void> {
    if (!useMock) notWired('review endpoints (HS)');
    await delay();
    const review = db.reviews.find((r) => r.id === id);
    if (review) applyToAggregates(review.titleId, review.rating, -1);
    db.reviews = db.reviews.filter((r) => r.id !== id);
    db.replies = db.replies.filter((r) => r.reviewId !== id);
  },
};

export const repliesApi = {
  /** Oldest first. */
  async list(reviewId: string): Promise<Reply[]> {
    if (!useMock) {
      // 200 is the most the API gives per page; keep asking until every reply is in, so a long
      // thread is never cut off without a word (the mock always returned all of them).
      const all: ReplyDTO[] = [];
      for (let page = 1; ; page++) {
        const res = await apiFetch<Paginated<ReplyDTO>>(
          `/reviews/${encodeURIComponent(reviewId)}/replies?page=${page}&pageSize=200`,
        );
        all.push(...res.data);
        if (res.data.length === 0 || all.length >= res.total) break;
      }
      return all.map(mapReply);
    }
    await delay();
    return clone(
      db.replies
        .filter((r) => r.reviewId === reviewId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  },

  /** Any signed-in user except an admin may reply to a review, including its author. */
  async create(reviewId: string, body: string): Promise<Reply> {
    if (!useMock) notWired('reply endpoints (HS)');
    await delay();
    assertCanWrite();
    if (!db.reviews.some((r) => r.id === reviewId)) throw new ApiError(404, 'Review not found');
    const reply: Reply = {
      id: newId('rp'),
      reviewId,
      author: { ...getMockActor() },
      body,
      createdAt: new Date().toISOString(),
    };
    db.replies.push(reply);
    return clone(reply);
  },

  /** Writer only: an admin never edits, and nobody edits another user's reply. */
  async update(id: string, body: string): Promise<Reply> {
    if (!useMock) notWired('reply endpoints (HS)');
    await delay();
    assertCanWrite();
    const reply = db.replies.find((r) => r.id === id);
    if (!reply) throw new ApiError(404, 'Reply not found');
    if (reply.author.id !== getMockActor().id) {
      throw new ApiError(403, 'You can only edit your own reply');
    }
    if (!body.trim()) throw new ApiError(400, 'Write something before saving');
    reply.body = body.trim();
    reply.editedAt = new Date().toISOString();
    return clone(reply);
  },

  async remove(id: string): Promise<void> {
    if (!useMock) notWired('reply endpoints (HS)');
    await delay();
    db.replies = db.replies.filter((r) => r.id !== id);
  },
};
