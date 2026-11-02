import { z } from 'zod';
import { ListStatus, MediaType } from '@bingemate/shared';

/** Empty strings count as "not given" so `?status=&mediaType=` is harmless. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const listQuerySchema = z.object({
  status: optional(z.nativeEnum(ListStatus)),
  mediaType: optional(z.nativeEnum(MediaType)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const addEntrySchema = z
  .object({ titleId: z.string().min(1).max(40), status: z.nativeEnum(ListStatus) })
  .strict();

export const setStatusSchema = z.object({ status: z.nativeEnum(ListStatus) }).strict();

export const entryIdParamSchema = z.object({ id: z.string().min(1).max(40) });
export const titleIdParamSchema = z.object({ titleId: z.string().min(1).max(40) });

export type ListQuery = z.infer<typeof listQuerySchema>;
