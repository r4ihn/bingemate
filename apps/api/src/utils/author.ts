import type { Prisma } from '@prisma/client';
import type { AuthorDTO } from '@bingemate/shared';
import { prisma } from '../db/prisma.js';

export const authorSelect = {
  id: true,
  username: true,
  role: true,
} satisfies Prisma.UserSelect;

type AuthorRow = Prisma.UserGetPayload<{ select: typeof authorSelect }>;

/**
 * Legacy users may have no username. Keep their email private with a stable fallback from their id.
 */
export function toAuthor(u: AuthorRow): AuthorDTO {
  return { id: u.id, name: u.username ?? `user-${u.id.slice(0, 6)}`, role: u.role };
}

/** Authors for a set of user ids, keyed by id. A missing user is simply absent. */
export async function loadAuthors(ids: string[]): Promise<Map<string, AuthorDTO>> {
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: authorSelect,
  });
  return new Map(users.map((u) => [u.id, toAuthor(u)]));
}
