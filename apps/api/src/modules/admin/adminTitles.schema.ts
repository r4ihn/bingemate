import { z } from 'zod';
import { TitleStatus } from '@bingemate/shared';

export const adminTitlesQuerySchema = z.object({
  status: z.preprocess((v) => (v === '' ? undefined : v), z.nativeEnum(TitleStatus).optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const setTitleStatusSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    rejectionReason: z.string().trim().max(500).optional(),
  })
  .strict();

export type AdminTitlesQuery = z.infer<typeof adminTitlesQuerySchema>;
