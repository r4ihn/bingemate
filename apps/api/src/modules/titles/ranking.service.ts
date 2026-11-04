import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';

interface RankRow {
  rankInType: bigint;
  topPercent: number;
}

export async function getTitleRank(
  id: string,
): Promise<{ rankInType: number; topPercent: number } | null> {
  const rows = await prisma.$queryRaw<RankRow[]>(
    Prisma.sql`SELECT rank_in_type AS "rankInType",
      GREATEST(1, CEIL(pct_rank * 100)) AS "topPercent"
      FROM "title_rank_in_type" WHERE title_id = ${id}`,
  );
  const row = rows[0];
  return row ? { rankInType: Number(row.rankInType), topPercent: Number(row.topPercent) } : null;
}

/** Run directly, outside a transaction, so PostgreSQL can refresh concurrently. */
export async function refreshTitleRanks(): Promise<void> {
  await prisma.$executeRawUnsafe('REFRESH MATERIALIZED VIEW CONCURRENTLY "title_rank_in_type"');
}
