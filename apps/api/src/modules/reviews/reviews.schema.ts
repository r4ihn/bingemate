import { z } from 'zod';
import { RATING_MAX, RATING_MIN } from '@bingemate/shared';

const rating = z.number().int().min(RATING_MIN).max(RATING_MAX);
const body = z.string().trim().min(1, 'Write something about this title').max(10_000);

/** A review is a star rating and text, the same for every media type. */
export const createReviewSchema = z.object({ rating, body }).strict();

export const updateReviewSchema = z
  .object({ rating: rating.optional(), body: body.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });

export const reviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const titleIdParamSchema = z.object({ titleId: z.string().min(1).max(40) });
export const reviewIdParamSchema = z.object({ id: z.string().min(1).max(40) });

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
