import { Prisma } from '@prisma/client';
import type { GenreOptionDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import type { GenresQuery } from './genres.schema.js';

interface GenreRow {
  genre_id: string;
  name: string;
  title_count: number | bigint;
}

/**
 * Genre filter options from the `genre_filter_options` view (genres on enough approved titles,
 * per media type). With no `type` the same genre is merged across media types by summing counts.
 * Most titles first, then name, then id so the order never wobbles on a tie.
 */
export async function listGenreOptions({ type }: GenresQuery): Promise<GenreOptionDTO[]> {
  const where = type ? Prisma.sql`WHERE "mediaType" = ${type}::"MediaType"` : Prisma.empty;
  const rows = await prisma.$queryRaw<GenreRow[]>(
    Prisma.sql`SELECT "genre_id", "name", "title_count" FROM "genre_filter_options" ${where}`,
  );

  const merged = new Map<string, GenreOptionDTO>();
  for (const r of rows) {
    const count = Number(r.title_count);
    const seen = merged.get(r.genre_id);
    if (seen) seen.titleCount += count;
    else merged.set(r.genre_id, { id: r.genre_id, name: r.name, titleCount: count });
  }
  return [...merged.values()].sort(
    (a, b) =>
      b.titleCount - a.titleCount || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}
