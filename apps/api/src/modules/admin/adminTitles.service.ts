import type { Paginated, SubmissionDTO, TitleStatus } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { submissionSelect, toSubmission } from '../titles/submissions.service.js';

export async function listTitlesForReview(query: {
  status?: TitleStatus;
  page: number;
  pageSize: number;
}): Promise<Paginated<SubmissionDTO>> {
  const { status = 'PENDING', page, pageSize } = query;
  const where = { status };
  const [rows, total] = await prisma.$transaction([
    prisma.title.findMany({
      where,
      select: submissionSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.title.count({ where }),
  ]);
  return { data: rows.map(toSubmission), page, pageSize, total };
}

export async function setTitleStatus(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  updatedAt: Date,
  rejectionReason?: string,
): Promise<SubmissionDTO> {
  const title = await prisma.title.findUnique({ where: { id }, select: { id: true } });
  if (!title) throw new HttpError(404, 'Title not found');

  const { count } = await prisma.title.updateMany({
    where: { id, updatedAt },
    data: {
      status,
      rejectionReason: status === 'REJECTED' ? (rejectionReason?.trim() || null) : null,
    },
  });
  if (count === 0) {
    throw new HttpError(
      409,
      'This title changed after you opened it. Reload the queue and review it again.',
    );
  }
  return toSubmission(
    await prisma.title.findUniqueOrThrow({ where: { id }, select: submissionSelect }),
  );
}
