import { Prisma } from '@prisma/client';
import type { AuthUser, ListItemDTO, ListStatus, Paginated } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { summarySelect, toSummary } from '../titles/titles.service.js';
import type { ListQuery } from './lists.schema.js';

const include = { title: { select: summarySelect } } satisfies Prisma.ListEntryInclude;
type EntryRow = Prisma.ListEntryGetPayload<{ include: typeof include }>;

function toItem(e: EntryRow): ListItemDTO {
  return { id: e.id, titleId: e.titleId, status: e.status, title: toSummary(e.title) };
}

/**
 * Every query is scoped to the signed-in user's id, so one user can never read or change another's
 * list, and an entry that is not theirs looks the same as one that does not exist.
 * A title that is no longer APPROVED (for example a creator edited it and it went back to review)
 * is left out until it is approved again.
 */
export async function listMine(user: AuthUser, query: ListQuery): Promise<Paginated<ListItemDTO>> {
  const { status, mediaType, page, pageSize } = query;
  const where: Prisma.ListEntryWhereInput = {
    userId: user.id,
    ...(status && { status }),
    title: { status: 'APPROVED', ...(mediaType && { mediaType }) },
  };
  const [rows, total] = await prisma.$transaction([
    prisma.listEntry.findMany({
      where,
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.listEntry.count({ where }),
  ]);
  return { data: rows.map(toItem), page, pageSize, total };
}

/** The user's entry for one title, or null when it is not on their list. */
export async function entryForTitle(user: AuthUser, titleId: string): Promise<ListItemDTO | null> {
  const row = await prisma.listEntry.findFirst({
    where: { userId: user.id, titleId, title: { status: 'APPROVED' } },
    include,
  });
  return row ? toItem(row) : null;
}

export async function addEntry(
  user: AuthUser,
  titleId: string,
  status: ListStatus,
): Promise<ListItemDTO> {
  const already = new HttpError(409, 'This title is already on your list');
  try {
    return await prisma.$transaction(async (tx) => {
      const title = await tx.title.findFirst({
        where: { id: titleId, status: 'APPROVED' },
        select: { id: true },
      });
      if (!title) throw new HttpError(404, 'Title not found');
      const existing = await tx.listEntry.findUnique({
        where: { userId_titleId: { userId: user.id, titleId } },
        select: { id: true },
      });
      if (existing) throw already;
      return toItem(
        await tx.listEntry.create({ data: { userId: user.id, titleId, status }, include }),
      );
    });
  } catch (err) {
    // Two taps of "Add" at once: the second hits the unique (user, title) rule.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw already;
    throw err;
  }
}

export async function setEntryStatus(
  user: AuthUser,
  id: string,
  status: ListStatus,
): Promise<ListItemDTO> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.listEntry.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!entry) throw new HttpError(404, 'List entry not found');
    return toItem(await tx.listEntry.update({ where: { id }, data: { status }, include }));
  });
}

export async function removeEntry(user: AuthUser, id: string): Promise<void> {
  const { count } = await prisma.listEntry.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) throw new HttpError(404, 'List entry not found');
}
