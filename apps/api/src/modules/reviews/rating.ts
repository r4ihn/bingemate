import type { Prisma } from '@prisma/client';

/**
 * Takes a row lock on the title, so writers to one title take turns. Without it two reviews
 * saved at the same moment could each recompute without seeing the other and leave a wrong total.
 */
export async function lockTitle(tx: Prisma.TransactionClient, titleId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Title" WHERE "id" = ${titleId} FOR UPDATE`;
}

/**
 * Copies avgRating and reviewCount from the title_rating_stats view, so the stored columns use
 * the view's exact numeric ROUND. Rounding a float in JS gets .xx5 ties wrong (41/40 gives 1.02,
 * the view 1.03). Leaves updatedAt alone: a new review is not an edit of the title.
 */
export async function recomputeTitleRating(
  tx: Prisma.TransactionClient,
  titleId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Title" AS t
    SET "avgRating" = s."avg_rating", "reviewCount" = s."review_count"
    FROM "title_rating_stats" AS s
    WHERE s."title_id" = t."id" AND t."id" = ${titleId}`;
}
