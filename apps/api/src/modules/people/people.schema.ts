import { z } from 'zod';

export const MAX_DEPTH = 6;

const id = z.string().min(1).max(40);

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const personParamSchema = z.object({ id });

export const connectionParamSchema = z.object({ id, otherId: id });

export const connectionQuerySchema = z.object({
  maxDepth: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(MAX_DEPTH).default(MAX_DEPTH),
  ),
});
export type ConnectionQuery = z.infer<typeof connectionQuerySchema>;
