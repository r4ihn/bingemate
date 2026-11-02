import type { Prisma } from '@prisma/client';
import type { Paginated, TitleDetailDTO, TitleSummary } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import type { ListQuery, TitleSort } from './titles.schema.js';

export const summarySelect = {
  id: true,
  name: true,
  mediaType: true,
  status: true,
  avgRating: true,
  reviewCount: true,
  posterUrl: true,
  createdById: true,
} satisfies Prisma.TitleSelect;

type SummaryRow = Prisma.TitleGetPayload<{ select: typeof summarySelect }>;

export function toSummary(t: SummaryRow): TitleSummary {
  return {
    id: t.id,
    name: t.name,
    mediaType: t.mediaType,
    status: t.status,
    avgRating: t.avgRating,
    reviewCount: t.reviewCount,
    ...(t.posterUrl ? { posterUrl: t.posterUrl } : {}),
    createdById: t.createdById,
  };
}

/** Every order ends on id, so pages never repeat or skip a row when the sort key ties. */
const ORDER: Record<TitleSort, Prisma.TitleOrderByWithRelationInput[]> = {
  name: [{ name: 'asc' }, { id: 'asc' }],
  rating: [{ avgRating: 'desc' }, { reviewCount: 'desc' }, { id: 'asc' }],
  year: [{ releaseYear: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
  reviews: [{ reviewCount: 'desc' }, { id: 'asc' }],
};

/** Public browse and search: only APPROVED titles are ever returned. */
export async function listTitles(query: ListQuery): Promise<Paginated<TitleSummary>> {
  const { q, type, genre, minRating, year, sort, page, pageSize } = query;
  const where: Prisma.TitleWhereInput = {
    status: 'APPROVED',
    ...(type && { mediaType: type }),
    ...(q && { name: { contains: q, mode: 'insensitive' } }),
    ...(genre && { genres: { some: { genre: { name: { equals: genre, mode: 'insensitive' } } } } }),
    ...(minRating !== undefined && { avgRating: { gte: minRating } }),
    ...(year !== undefined && { releaseYear: year }),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.title.findMany({
      where,
      select: summarySelect,
      orderBy: ORDER[sort],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.title.count({ where }),
  ]);
  return { data: rows.map(toSummary), page, pageSize, total };
}

/**
 * One APPROVED title. Pending and rejected ones answer 404, the same as a missing id, so the
 * endpoint does not reveal which hidden titles exist. (A creator seeing their own pending title
 * comes with the creator endpoints.)
 */
export async function getTitle(id: string): Promise<TitleDetailDTO> {
  const t = await prisma.title.findFirst({
    where: { id, status: 'APPROVED' },
    select: {
      ...summarySelect,
      description: true,
      releaseYear: true,
      genres: { select: { genre: { select: { name: true } } } },
      people: { select: { role: true, person: { select: { id: true, name: true } } } },
    },
  });
  if (!t) throw new HttpError(404, 'Title not found');
  return {
    ...toSummary(t),
    description: t.description,
    releaseYear: t.releaseYear,
    genres: t.genres.map((g) => g.genre.name).sort(),
    people: t.people.map((p) => ({ id: p.person.id, name: p.person.name, role: p.role })),
  };
}
