import { z } from 'zod';
import { MediaType } from '@bingemate/shared';

/** Empty strings count as "not given" so `?type=` is harmless. */
export const genresQuerySchema = z.object({
  type: z.preprocess((v) => (v === '' ? undefined : v), z.nativeEnum(MediaType).optional()),
});

export type GenresQuery = z.infer<typeof genresQuerySchema>;
