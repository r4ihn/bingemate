import { z } from 'zod';
import { MediaType } from '@bingemate/shared';

export const titleIdParamSchema = z.object({ titleId: z.string().min(1).max(40) });
export const reviewActivityQuerySchema = z.object({
  months: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(240).default(120),
  ),
});
export const topReviewersQuerySchema = z.object({
  type: z.preprocess((v) => (v === '' ? undefined : v), z.nativeEnum(MediaType).optional()),
  limit: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(50).default(10),
  ),
});

export type ReviewActivityQuery = z.infer<typeof reviewActivityQuerySchema>;
export type TopReviewersQuery = z.infer<typeof topReviewersQuerySchema>;
