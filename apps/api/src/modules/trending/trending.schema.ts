import { z } from 'zod';
import { MediaType } from '@bingemate/shared';

/** Empty strings count as "not given" so `?type=&limit=` is harmless. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const trendingQuerySchema = z.object({
  type: optional(z.nativeEnum(MediaType)),
  limit: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(50).default(20),
  ),
});

export type TrendingQuery = z.infer<typeof trendingQuerySchema>;
