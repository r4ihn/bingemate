import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import type { Types } from 'mongoose';
import { prisma } from '../db/prisma.js';
import { ReviewBody } from '../mongo/models/reviewBody.model.js';
import { Reply } from '../mongo/models/reply.model.js';

const BATCH_SIZE = 1000;

async function missingReviewIds(ids: string[]): Promise<string[]> {
  // Let read failures propagate: only a successful lookup can establish an orphan.
  const reviews = await prisma.review.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const live = new Set(reviews.map((review) => review.id));
  return ids.filter((id) => !live.has(id));
}

/** Removes Mongo documents whose PostgreSQL review is gone, using bounded keyset pages. */
export async function cleanupOrphans(): Promise<{ reviewBodies: number; replies: number }> {
  const counts = { reviewBodies: 0, replies: 0 };
  let lastBodyId: string | undefined;
  while (true) {
    const bodies = await ReviewBody.find(
      lastBodyId === undefined ? {} : { _id: { $gt: lastBodyId } },
    )
      .select({ _id: 1 })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();
    if (bodies.length === 0) break;
    lastBodyId = bodies[bodies.length - 1]!._id;
    const missing = await missingReviewIds(bodies.map((body) => body._id));
    if (missing.length > 0) {
      const result = await ReviewBody.deleteMany({ _id: { $in: missing } });
      counts.reviewBodies += result.deletedCount;
    }
  }

  // A collection-wide distinct() is unbounded. Deduplicate only within each reply page.
  let lastReplyId: Types.ObjectId | undefined;
  while (true) {
    const replies = await Reply.find(lastReplyId === undefined ? {} : { _id: { $gt: lastReplyId } })
      .select({ _id: 1, reviewId: 1 })
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .lean();
    if (replies.length === 0) break;
    lastReplyId = replies[replies.length - 1]!._id;
    const ids = [...new Set(replies.map((reply) => reply.reviewId))];
    const missing = await missingReviewIds(ids);
    if (missing.length > 0) {
      const result = await Reply.deleteMany({ reviewId: { $in: missing } });
      counts.replies += result.deletedCount;
    }
  }

  console.info(`Orphans cleaned: ${counts.reviewBodies} review bodies, ${counts.replies} replies`);
  return counts;
}

/** Importing this module never connects to either database or runs the job. */
async function runAsScript(): Promise<void> {
  const { connectMongo, disconnectMongo } = await import('../db/mongo.js');
  try {
    await connectMongo();
    await cleanupOrphans();
  } finally {
    await disconnectMongo();
    await prisma.$disconnect();
  }
}

function isRunDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isRunDirectly()) {
  runAsScript().catch((err) => {
    console.error('cleanupOrphans failed:', err);
    process.exit(1);
  });
}
