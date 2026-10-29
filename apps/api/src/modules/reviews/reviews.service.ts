import type { Prisma } from '@prisma/client';
import { Role } from '@bingemate/shared';
import type { AuthUser, MediaType, Paginated, ReviewDTO, ReviewFieldsDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import {
  BookReviewBody,
  MovieReviewBody,
  ReviewBody,
  TvShowReviewBody,
} from '../../mongo/models/reviewBody.model.js';
import { Reply } from '../../mongo/models/reply.model.js';
import { authorSelect, toAuthor } from '../../utils/author.js';
import { lockTitle, recomputeTitleRating } from './rating.js';
import type { CreateReviewInput, UpdateReviewInput } from './reviews.schema.js';

/**
 * A review is two records with one id: the header row in PostgreSQL (who, which title, the rating)
 * and the body in MongoDB. Nothing ties them together across the two stores, so every write here
 * does PostgreSQL first, then MongoDB, and undoes the PostgreSQL part if MongoDB fails.
 */

type BodyModel = typeof ReviewBody;
const BODY_MODEL: Record<MediaType, BodyModel> = {
  MOVIE: MovieReviewBody as unknown as BodyModel,
  BOOK: BookReviewBody as unknown as BodyModel,
  TV_SHOW: TvShowReviewBody as unknown as BodyModel,
};

/** API field name -> the name in MongoDB, for the fields each media type takes. */
const FIELD_KEYS: Record<MediaType, [keyof ReviewFieldsDTO, string][]> = {
  MOVIE: [['runtimeMinutes', 'runtimeMinutes']],
  BOOK: [['chapters', 'chaptersRead']],
  TV_SHOW: [
    ['season', 'season'],
    ['episodes', 'episodes'],
  ],
};

const failed = (what: string) =>
  new HttpError(502, `Could not ${what} the review. Nothing was changed, please try again.`);

function assertCanWrite(user: AuthUser): void {
  if (user.role === Role.ADMIN) throw new HttpError(403, 'Admins cannot write reviews or replies');
}

/** Keeps only the fields this media type takes, under their MongoDB names. */
function mongoFields(type: MediaType, fields: ReviewFieldsDTO = {}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [apiKey, mongoKey] of FIELD_KEYS[type]) {
    const value = fields[apiKey];
    if (value !== undefined) out[mongoKey] = value;
  }
  return out;
}

function apiFields(doc: Record<string, unknown> | undefined): ReviewFieldsDTO {
  const out: ReviewFieldsDTO = {};
  if (!doc) return out;
  if (typeof doc['runtimeMinutes'] === 'number') out.runtimeMinutes = doc['runtimeMinutes'];
  if (typeof doc['chaptersRead'] === 'number') out.chapters = doc['chaptersRead'];
  if (typeof doc['season'] === 'number') out.season = doc['season'];
  if (typeof doc['episodes'] === 'number') out.episodes = doc['episodes'];
  return out;
}

type ReviewRow = Prisma.ReviewGetPayload<{
  include: { user: { select: typeof authorSelect } };
}>;

/** Joins the PostgreSQL rows with their MongoDB bodies. A body that is missing reads as empty text. */
async function withBodies(rows: ReviewRow[]): Promise<ReviewDTO[]> {
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
      fields: apiFields(doc),
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
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.review.count({ where: { titleId } }),
  ]);
  return { data: await withBodies(rows), page, pageSize, total };
}

/** The signed-in user's review of the title, or null. */
export async function myReview(user: AuthUser, titleId: string): Promise<ReviewDTO | null> {
  const row = await prisma.review.findFirst({ where: { titleId, userId: user.id }, include });
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

  // 1. PostgreSQL: the header row and the new totals commit together.
  const review = await prisma.$transaction(async (tx) => {
    await lockTitle(tx, titleId);
    const existing = await tx.review.findUnique({
      where: { userId_titleId: { userId: user.id, titleId } },
      select: { id: true },
    });
    if (existing) throw new HttpError(409, 'You have already reviewed this title');
    const row = await tx.review.create({
      data: { userId: user.id, titleId, rating: input.rating },
      select: { id: true },
    });
    await recomputeTitleRating(tx, titleId);
    return row;
  });

  // 2. MongoDB: the body. If it fails, take the header row back out.
  try {
    await BODY_MODEL[title.mediaType].create({
      _id: review.id,
      titleId,
      userId: user.id,
      body: input.body,
      ...mongoFields(title.mediaType, input.fields),
    });
  } catch (err) {
    console.error('Review body write failed, removing the header row:', err);
    await prisma
      .$transaction(async (tx) => {
        await lockTitle(tx, titleId);
        await tx.review.delete({ where: { id: review.id } });
        await recomputeTitleRating(tx, titleId);
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
      title: { select: { mediaType: true, createdById: true } },
    },
  });
  if (!review) throw new HttpError(404, 'Review not found');
  if (review.userId !== user.id) throw new HttpError(403, 'You can only edit your own review');
  if (review.title.createdById === user.id) {
    throw new HttpError(403, 'You cannot review a title you created');
  }

  const setRating = async (rating: number) =>
    prisma.$transaction(async (tx) => {
      await lockTitle(tx, review.titleId);
      await tx.review.update({ where: { id }, data: { rating } });
      await recomputeTitleRating(tx, review.titleId);
    });

  const ratingChanged = input.rating !== undefined && input.rating !== review.rating;
  if (ratingChanged) await setRating(input.rating as number);

  if (input.body !== undefined || input.fields !== undefined) {
    const type = review.title.mediaType;
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    if (input.body !== undefined) $set['body'] = input.body;
    if (input.fields !== undefined) {
      // The form sends the whole set, so a field left out is cleared.
      const given = mongoFields(type, input.fields);
      for (const [, mongoKey] of FIELD_KEYS[type]) {
        if (mongoKey in given) $set[mongoKey] = given[mongoKey];
        else $unset[mongoKey] = '';
      }
    }
    try {
      await BODY_MODEL[type].updateOne(
        { _id: id },
        {
          ...(Object.keys($set).length ? { $set } : {}),
          ...(Object.keys($unset).length ? { $unset } : {}),
        },
      );
    } catch (err) {
      console.error('Review body update failed, restoring the rating:', err);
      if (ratingChanged) {
        await setRating(review.rating).catch((undoErr: unknown) =>
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
    await recomputeTitleRating(tx, review.titleId);
  });

  // Leftovers in MongoDB are unreachable (nothing lists them), so a failure here is logged, not raised.
  try {
    await ReviewBody.deleteOne({ _id: id });
    await Reply.deleteMany({ reviewId: id });
  } catch (err) {
    console.error(`Review ${id} was deleted but its body or replies were not:`, err);
  }
}
