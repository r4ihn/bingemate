import type { AuthUser, Paginated, Role } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { authorSelect } from '../../utils/author.js';
import { type PageParams, toSkipTake } from '../../utils/pagination.js';
import { withBodies } from '../reviews/reviews.service.js';

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
}

export interface ModerationReview {
  id: string;
  titleId: string;
  titleName: string;
  author: { id: string; name: string };
  rating: number;
  body: string;
  createdAt: string;
}

const userSelect = { id: true, email: true, role: true } as const;

/** Newest accounts first; ties broken on id so pages stay stable. */
export async function listUsers(params: PageParams): Promise<Paginated<AdminUser>> {
  const [data, total] = await prisma.$transaction([
    prisma.user.findMany({
      select: userSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...toSkipTake(params),
    }),
    prisma.user.count(),
  ]);
  return { data, ...params, total };
}

/**
 * The new role is stored now but the user's current JWT still carries the old one,
 * so it only takes effect at their next login.
 */
export async function setUserRole(admin: AuthUser, id: string, role: Role): Promise<AdminUser> {
  if (id === admin.id) throw new HttpError(400, 'You cannot change your own role');
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new HttpError(404, 'User not found');
  return prisma.user.update({ where: { id }, data: { role }, select: userSelect });
}

/**
 * Every review across all titles (any status), newest first, with the title name so
 * moderators can see what was reviewed. Removal goes through DELETE /reviews/:id.
 */
export async function listAllReviews(params: PageParams): Promise<Paginated<ModerationReview>> {
  const [rows, total] = await prisma.$transaction([
    prisma.review.findMany({
      include: { user: { select: authorSelect }, title: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(params),
    }),
    prisma.review.count(),
  ]);
  const names = new Map(rows.map((r) => [r.id, r.title.name]));
  const reviews = await withBodies(rows);
  const data = reviews.map((r) => ({
    id: r.id,
    titleId: r.titleId,
    titleName: names.get(r.id) ?? 'Unknown title',
    author: { id: r.author.id, name: r.author.name },
    rating: r.rating,
    body: r.body,
    createdAt: r.createdAt,
  }));
  return { data, ...params, total };
}
