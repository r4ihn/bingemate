import type { Prisma } from '@prisma/client';

/**
 * Takes a row lock on the title, so writers to one title take turns.
 *
 * Title.avgRating / reviewCount are kept up to date by the review_rating_* triggers in PostgreSQL
 * (migration 20261105120000_rating_triggers). The lock is still needed: the trigger aggregates from
 * its transaction's snapshot, so two reviews saved at the same moment could each recompute without
 * seeing the other and leave a wrong total. Taking the lock before writing the review makes the
 * second writer wait and then see the first one's row.
 */
export async function lockTitle(tx: Prisma.TransactionClient, titleId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Title" WHERE "id" = ${titleId} FOR UPDATE`;
}
