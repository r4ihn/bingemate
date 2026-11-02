import type { Prisma } from '@prisma/client';
import { Role } from '@bingemate/shared';
import type { AuthUser, SubmissionDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { ReviewBody } from '../../mongo/models/reviewBody.model.js';
import { Reply } from '../../mongo/models/reply.model.js';
import { TitlePoster } from '../../mongo/models/titlePoster.model.js';
import type { CreateSubmissionInput, UpdateSubmissionInput } from './submissions.schema.js';
import { summarySelect, toSummary } from './titles.service.js';

export const submissionSelect = {
  ...summarySelect,
  description: true,
  rejectionReason: true,
  updatedAt: true,
} satisfies Prisma.TitleSelect;

export type SubmissionRow = Prisma.TitleGetPayload<{ select: typeof submissionSelect }>;

export function toSubmission(row: SubmissionRow): SubmissionDTO {
  return {
    ...toSummary(row),
    description: row.description,
    rejectionReason: row.rejectionReason,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listOwnSubmissions(user: AuthUser): Promise<SubmissionDTO[]> {
  const rows = await prisma.title.findMany({
    where: { createdById: user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: submissionSelect,
  });
  return rows.map(toSubmission);
}

export async function createSubmission(
  user: AuthUser,
  input: CreateSubmissionInput,
): Promise<SubmissionDTO> {
  const row = await prisma.title.create({
    data: {
      name: input.name,
      mediaType: input.mediaType,
      description: input.description || null,
      createdById: user.id,
      status: 'PENDING',
    },
    select: submissionSelect,
  });
  return toSubmission(row);
}

export async function updateSubmission(
  user: AuthUser,
  id: string,
  input: UpdateSubmissionInput,
): Promise<SubmissionDTO> {
  const title = await prisma.title.findUnique({
    where: { id },
    select: { createdById: true, status: true },
  });
  if (!title) throw new HttpError(404, 'Title not found');
  if (user.role !== Role.CREATOR || title.createdById !== user.id) {
    throw new HttpError(403, 'You can only edit your own submission');
  }

  const row = await prisma.title.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      status: 'PENDING',
      rejectionReason: null,
    },
    select: submissionSelect,
  });
  return toSubmission(row);
}

export async function deleteTitle(user: AuthUser, id: string): Promise<void> {
  const title = await prisma.title.findUnique({
    where: { id },
    select: { createdById: true },
  });
  if (!title) throw new HttpError(404, 'Title not found');
  if (
    user.role !== Role.ADMIN &&
    (user.role !== Role.CREATOR || title.createdById !== user.id)
  ) {
    throw new HttpError(403, 'You can only delete your own submission');
  }

  if (user.role !== Role.ADMIN) {
    const [reviewCount, listEntryCount] = await Promise.all([
      prisma.review.count({ where: { titleId: id } }),
      prisma.listEntry.count({ where: { titleId: id, userId: { not: user.id } } }),
    ]);
    if (reviewCount > 0 || listEntryCount > 0) {
      throw new HttpError(
        409,
        'Other users have reviewed or listed this title, so it cannot be deleted by its creator. Ask an admin to remove it.',
      );
    }
  }

  // Capture reply parent ids before PostgreSQL cascades the reviews away.
  const reviews = await prisma.review.findMany({
    where: { titleId: id },
    select: { id: true },
  });
  const ids = reviews.map((review) => review.id);
  await prisma.title.delete({ where: { id } });

  try {
    await ReviewBody.deleteMany({ titleId: id });
  } catch (err) {
    console.error(`Title ${id} was deleted but its review bodies were not:`, err);
  }
  try {
    if (ids.length > 0) await Reply.deleteMany({ reviewId: { $in: ids } });
  } catch (err) {
    console.error(`Title ${id} was deleted but its replies were not:`, err);
  }
  try {
    await TitlePoster.deleteOne({ _id: id });
  } catch (err) {
    console.error(`Title ${id} was deleted but its poster was not:`, err);
  }
}
