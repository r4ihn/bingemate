import { Prisma } from '@prisma/client';
import type { AuthUser, CreatorTitleStatsDTO, TitleStatus } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';

interface StatsRow {
  title_id: string;
  name: string;
  status: TitleStatus;
  review_count: number | bigint;
  avg_rating: number | string;
  list_adds: number | bigint;
}

/**
 * One row per title the signed-in creator owns, from the `creator_title_stats` view.
 * The creator id is always the signed-in user's id and is bound as a parameter, so one creator can
 * never read another's rows. Titles of every status are included: a creator sees their own
 * pending and rejected titles too.
 */
export async function statsForCreator(user: AuthUser): Promise<CreatorTitleStatsDTO[]> {
  const rows = await prisma.$queryRaw<StatsRow[]>(
    Prisma.sql`SELECT "title_id", "name", "status", "review_count", "avg_rating", "list_adds"
      FROM "creator_title_stats"
      WHERE "creator_id" = ${user.id}
      ORDER BY "name" ASC, "title_id" ASC`,
  );
  return rows.map((r) => ({
    titleId: r.title_id,
    name: r.name,
    status: r.status,
    reviewCount: Number(r.review_count),
    avgRating: Number(r.avg_rating),
    listAdds: Number(r.list_adds),
  }));
}
