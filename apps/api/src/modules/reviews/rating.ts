import type { Prisma } from '@prisma/client';

/**
 * Takes a row lock on the title, so writers to one title take turns. Without it two reviews
 * saved at the same moment could each recompute without seeing the other and leave a wrong total.
 */
export async function lockTitle(tx: Prisma.TransactionClient, titleId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Title" WHERE "id" = ${titleId} FOR UPDATE`;
}

/** Rebuilds avgRating and reviewCount from the reviews, rounded to 2 places like title_rating_stats. */
export async function recomputeTitleRating(
  tx: Prisma.TransactionClient,
  titleId: string,
): Promise<void> {
  const stats = await tx.review.aggregate({
    where: { titleId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.title.update({
    where: { id: titleId },
    data: {
      avgRating: Math.round((stats._avg.rating ?? 0) * 100) / 100,
      reviewCount: stats._count._all,
    },
  });
}
