import { z } from 'zod';
import { Role } from '@bingemate/shared';

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const userIdParamSchema = z.object({ id: z.string().min(1).max(40) });

/** Only ADMIN or MEMBER; anything else is a 400. */
export const setRoleSchema = z.object({ role: z.nativeEnum(Role) }).strict();
