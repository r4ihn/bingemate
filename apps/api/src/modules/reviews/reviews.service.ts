import { assertCanWrite } from '../../utils/assertCanWrite.js';
import { toSkipTake } from '../../utils/pagination.js';
import type { Prisma } from '@prisma/client';
import { Role } from '@bingemate/shared';
import type { AuthUser, Paginated, ReviewDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { ReviewBody } from '../../mongo/models/reviewBody.model.js';
import { Reply } from '../../mongo/models/reply.model.js';
import { authorSelect, toAuthor } from '../../utils/author.js';
import { lockTitle } from './rating.js';
import type { CreateReviewInput, UpdateReviewInput } from './reviews.schema.js';

/**
 * A review is two records with one id: the header row in PostgreSQL (who, which title, the rating)
 * and the body in MongoDB. Nothing ties them together across the two stores, so every write here
 * does PostgreSQL first, then MongoDB, and undoes the PostgreSQL part if MongoDB fails.
 */

const failed = (what: string) =>
  new HttpError(502, `Could not ${what} the review. Nothing was changed, please try again.`);

type ReviewRow = Prisma.ReviewGetPayload<{
  include: { user: { select: typeof authorSelect } };
}>;

/** Joins the PostgreSQL rows with their MongoDB bodies. A body that is missing reads as empty text. */
export async function withBodies(rows: ReviewRow[]): Promise<ReviewDTO[]> {
  if (rows.length === 0) return [];
  const docs = (await ReviewBody.find({
    _id: { $in: rows.map((r) => r.id) },
  }).lean()) as unknown as (Record<string, unknown> & { _id: string; body?: string })[];
  const byId = new Map(docs.map((d) => [d._id, d]));
  return rows.map((r) => {
    const doc = byId.get(r.id);
    return {
      id: r.id,
      titleId: r.titleId,
      author: toAuthor(r.user),
      rating: r.rating,
      body: doc?.body ?? '',
      createdAt: r.createdAt.toISOString(),
    };
  });
}

const include = { user: { select: authorSelect } } satisfies Prisma.ReviewInclude;

async function oneReview(id: string): Promise<ReviewDTO> {
  const row = await prisma.review.findUnique({ where: { id }, include });
  if (!row) throw new HttpError(404, 'Review not found');
  const [dto] = await withBodies([row]);
  if (!dto) throw new HttpError(404, 'Review not found');
  return dto;
}

/** Newest first, ties broken on id so pages stay stable. Only for APPROVED titles. */
export async function listReviews(
  titleId: string,
  page: number,
  pageSize: number,
): Promise<Paginated<ReviewDTO>> {
  const title = await prisma.title.findFirst({
    where: { id: titleId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!title) throw new HttpError(404, 'Title not found');

  const [rows, total] = await prisma.$transaction([
    prisma.review.findMany({
      where: { titleId },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake({ page, pageSize }),
    }),
    prisma.review.count({ where: { titleId } }),
  ]);
  return { data: await withBodies(rows), page, pageSize, total };
}

/** The signed-in user's review of the title, or null. A hidden title counts as not reviewed. */
export async function myReview(user: AuthUser, titleId: string): Promise<ReviewDTO | null> {
  const row = await prisma.review.findFirst({
    where: { titleId, userId: user.id, title: { status: 'APPROVED' } },
    include,
  });
  if (!row) return null;
  const [dto] = await withBodies([row]);
  return dto ?? null;
}

export async function createReview(
  user: AuthUser,
  titleId: string,
  input: CreateReviewInput,
): Promise<ReviewDTO> {
  assertCanWrite(user);
  const title = await prisma.title.findFirst({
    where: { id: titleId, status: 'APPROVED' },
    select: { mediaType: true, createdById: true },
  });
  if (!title) throw new HttpError(404, 'Title not found');
  if (title.createdById === user.id) {
    throw new HttpError(403, 'You cannot review a title you created');
  }

  // 1. PostgreSQL: the header row. The review_rating_* triggers update the title's totals in the same
  //    transaction (migration 20261105120000_rating_triggers).
  const review = await prisma.$transaction(async (tx) => {
    await lockTitle(tx, titleId);
    const lockedTitle = await tx.title.findFirst({
      where: { id: titleId, status: 'APPROVED' },
      select: { createdById: true },
    });
    if (!lockedTitle) throw new HttpError(404, 'Title not found');
    if (lockedTitle.createdById === user.id) {
      throw new HttpError(403, 'You cannot review a title you created');
    }
    const existing = await tx.review.findUnique({
      where: { userId_titleId: { userId: user.id, titleId } },
      select: { id: true },
    });
    if (existing) throw new HttpError(409, 'You have already reviewed this title');
    const row = await tx.review.create({
      data: { userId: user.id, titleId, rating: input.rating },
      select: { id: true },
    });
    return row;
  });

  // 2. MongoDB: the body. If it fails, take the header row back out.
  try {
    await ReviewBody.create({
      _id: review.id,
      titleId,
      userId: user.id,
      mediaType: title.mediaType,
      body: input.body,
    });
  } catch (err) {
    console.error('Review body write failed, removing the header row:', err);
    await prisma
      .$transaction(async (tx) => {
        await lockTitle(tx, titleId);
        await tx.review.delete({ where: { id: review.id } });
      })
      .catch((undoErr: unknown) => console.error('Could not undo the review header row:', undoErr));
    throw failed('save');
  }
  return oneReview(review.id);
}

/** Owner only, admins included in "only": nobody edits someone else's words. */
export async function updateReview(
  user: AuthUser,
  id: string,
  input: UpdateReviewInput,
): Promise<ReviewDTO> {
  assertCanWrite(user);
  const review = await prisma.review.findUnique({
    where: { id },
    select: {
      userId: true,
      titleId: true,
      rating: true,
      title: { select: { mediaType: true, createdById: true, status: true } },
    },
  });
  // A hidden title's reviews look absent, the same as everywhere else.
  if (!review || review.title.status !== 'APPROVED') throw new HttpError(404, 'Review not found');
  if (review.userId !== user.id) throw new HttpError(403, 'You can only edit your own review');
  if (review.title.createdById === user.id) {
    throw new HttpError(403, 'You cannot review a title you created');
  }

  const newRating = input.rating;
  const ratingChanged = newRating !== undefined && newRating !== review.rating;
  if (ratingChanged) {
    await prisma.$transaction(async (tx) => {
      await lockTitle(tx, review.titleId);
      await tx.review.update({ where: { id }, data: { rating: newRating } });
    });
  }

  // Puts the old rating back only while the row still holds ours: an edit from another tab
  // that saved in between must not be overwritten.
  const undoRating = async () =>
    prisma.$transaction(async (tx) => {
      await lockTitle(tx, review.titleId);
      await tx.review.updateMany({
        where: { id, rating: newRating },
        data: { rating: review.rating },
      });
    });

  if (input.body !== undefined) {
    try {
      const result = await ReviewBody.updateOne({ _id: id }, { $set: { body: input.body } });
      // A review whose body is missing would otherwise answer 200 and lose the edit without a trace.
      if (result.matchedCount === 0) throw new Error(`review ${id} has no body in MongoDB`);
    } catch (err) {
      console.error('Review body update failed, restoring the rating:', err);
      if (ratingChanged) {
        await undoRating().catch((undoErr: unknown) =>
          console.error('Could not restore the rating:', undoErr),
        );
      }
      throw failed('update');
    }
  }
  return oneReview(id);
}

/** The author or an admin. Removes the header row first; the body and replies follow. */
export async function deleteReview(user: AuthUser, id: string): Promise<void> {
  const review = await prisma.review.findUnique({
    where: { id },
    select: { userId: true, titleId: true },
  });
  if (!review) throw new HttpError(404, 'Review not found');
  if (review.userId !== user.id && user.role !== Role.ADMIN) {
    throw new HttpError(403, 'You can only delete your own review');
  }

  await prisma.$transaction(async (tx) => {
    await lockTitle(tx, review.titleId);
    await tx.review.delete({ where: { id } });
  });

  // Leftovers in MongoDB are unreachable (nothing lists them), so a failure here is logged, not raised.
  // Both deletes run even if one fails, so a failed body delete still clears the replies.
  const [body, replies] = await Promise.allSettled([
    ReviewBody.deleteOne({ _id: id }),
    Reply.deleteMany({ reviewId: id }),
  ]);
  if (body.status === 'rejected') {
    console.error(`Review ${id} was deleted but its body was not:`, body.reason);
  }
  if (replies.status === 'rejected') {
    console.error(`Review ${id} was deleted but its replies were not:`, replies.reason);
  }
}
