import { z } from 'zod';
import { MediaType, RATING_MAX, RATING_MIN } from '@bingemate/shared';

export const SORTS = ['name', 'rating', 'year', 'reviews'] as const;
export type TitleSort = (typeof SORTS)[number];

/** Query string of GET /titles. Empty strings count as "not given" so `?q=&type=` is harmless. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const listQuerySchema = z.object({
  q: optional(z.string().trim().max(100)),
  type: optional(z.nativeEnum(MediaType)),
  genre: optional(z.string().trim().max(60)),
  minRating: optional(z.coerce.number().min(RATING_MIN).max(RATING_MAX)),
  year: optional(z.coerce.number().int().min(1000).max(9999)),
  sort: z.preprocess((v) => (v === '' ? undefined : v), z.enum(SORTS).default('name')),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: z.string().min(1).max(40) });
