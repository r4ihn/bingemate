import type { Paginated, SubmissionDTO, TitleStatus } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { submissionSelect, toSubmission } from '../titles/submissions.service.js';
import type { SubmissionRow } from '../titles/submissions.service.js';

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
  rejectionReason?: string,
): Promise<SubmissionDTO> {
  const title = await prisma.title.findUnique({ where: { id }, select: { id: true } });
  if (!title) throw new HttpError(404, 'Title not found');

  const row: SubmissionRow = await prisma.title.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === 'REJECTED' ? (rejectionReason?.trim() ?? null) : null,
    },
    select: submissionSelect,
  });
  return toSubmission(row);
}
