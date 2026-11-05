import type { PipelineStage } from 'mongoose';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { ReviewBody } from '../../mongo/models/reviewBody.model.js';
import { Reply } from '../../mongo/models/reply.model.js';
import { loadAuthors } from '../../utils/author.js';
import type { TopReviewersQuery } from './reviewStats.schema.js';

/** Only populated months, starting at the first UTC day of the month `months` ago. */
export function reviewActivityPipeline(titleId: string, months: number): PipelineStage[] {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return [
    { $match: { titleId, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' } },
        reviews: { $sum: 1 },
        avgBodyLength: { $avg: { $strLenCP: '$body' } },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        month: '$_id',
        reviews: 1,
        avgBodyLength: { $round: ['$avgBodyLength', 1] },
      },
    },
  ];
}

/** Count reviews and replies on visible titles, with a bounded reply lookup result. */
export function topReviewersPipeline(
  hiddenTitleIds: string[],
  { type, limit }: TopReviewersQuery,
  { adminIds, skip = 0 }: { adminIds?: string[]; skip?: number } = {},
): PipelineStage[] {
  return [
    {
      $match: {
        ...(type ? { mediaType: type } : {}),
        titleId: { $nin: hiddenTitleIds },
        ...(adminIds ? { userId: { $nin: adminIds } } : {}),
      },
    },
    { $group: { _id: '$userId', reviews: { $sum: 1 } } },
    { $sort: { reviews: -1, _id: 1 } },
    ...(skip > 0 ? [{ $skip: skip }] : []),
    { $limit: limit * 2 },
    {
      $lookup: {
        from: Reply.collection.name,
        let: { userId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$userId', '$$userId'] } } },
          {
            $lookup: {
              from: ReviewBody.collection.name,
              localField: 'reviewId',
              foreignField: '_id',
              as: 'review',
            },
          },
          // $nin excludes any hidden title in the joined array; $ne also rejects orphan replies.
          { $match: { review: { $ne: [] }, 'review.titleId': { $nin: hiddenTitleIds } } },
          { $count: 'count' },
        ],
        as: 'replyCounts',
      },
    },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        reviews: 1,
        replies: { $ifNull: [{ $arrayElemAt: ['$replyCounts.count', 0] }, 0] },
      },
    },
  ];
}

export function recentReviewCountsPipeline(since: Date, titleIds?: string[]): PipelineStage[] {
  return [
    { $match: { createdAt: { $gte: since }, ...(titleIds ? { titleId: { $in: titleIds } } : {}) } },
    { $group: { _id: '$titleId', reviews: { $sum: 1 } } },
  ];
}

type Activity = { month: string; reviews: number; avgBodyLength: number };
type Reviewer = { userId: string; reviews: number; replies: number };

export async function reviewActivity(
  titleId: string,
  months: number,
): Promise<{ data: Activity[] }> {
  const title = await prisma.title.findFirst({
    where: { id: titleId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!title) throw new HttpError(404, 'Title not found');
  return { data: await ReviewBody.aggregate<Activity>(reviewActivityPipeline(titleId, months)) };
}

/** Candidate pages read at most, so a run of deleted accounts cannot make one request scan forever. */
const TOP_REVIEWER_ROUNDS = 10;

export async function topReviewers(query: TopReviewersQuery) {
  const [hiddenTitles, admins] = await Promise.all([
    prisma.title.findMany({ where: { status: { not: 'APPROVED' } }, select: { id: true } }),
    prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } }),
  ]);
  const hiddenTitleIds = hiddenTitles.map((title) => title.id);
  const adminIds = admins.map((admin) => admin.id);
  const batch = query.limit * 2;
  const data: (Reviewer & { name: string })[] = [];
  // Review bodies outlive deleted accounts, so keep reading candidates until `limit` are real users.
  for (let round = 0; round < TOP_REVIEWER_ROUNDS && data.length < query.limit; round++) {
    const rows = await ReviewBody.aggregate<Reviewer>(
      topReviewersPipeline(hiddenTitleIds, query, { adminIds, skip: round * batch }),
    );
    if (rows.length === 0) break;
    const authors = await loadAuthors(rows.map((row) => row.userId));
    for (const row of rows) {
      const author = authors.get(row.userId);
      if (author && author.role !== 'ADMIN') data.push({ ...row, name: author.name });
    }
    if (rows.length < batch) break;
  }
  return { data: data.slice(0, query.limit) };
}

/** Count recent reviews, optionally restricted to the titles being refreshed. */
export async function recentReviewCounts(
  days: number,
  titleIds?: string[],
): Promise<Map<string, number>> {
  if (titleIds?.length === 0) return new Map();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await ReviewBody.aggregate<{ _id: string; reviews: number }>(
    recentReviewCountsPipeline(since, titleIds),
  );
  return new Map(rows.map((row) => [row._id, row.reviews]));
}
