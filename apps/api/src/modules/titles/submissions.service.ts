import type { Prisma } from '@prisma/client';
import { Role } from '@bingemate/shared';
import type { AuthUser, SubmissionDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import type { CreateSubmissionInput, UpdateSubmissionInput } from './submissions.schema.js';
import { summarySelect, toSummary } from './titles.service.js';

const submissionSelect = {
  ...summarySelect,
  description: true,
  rejectionReason: true,
} satisfies Prisma.TitleSelect;

export type SubmissionRow = Prisma.TitleGetPayload<{ select: typeof submissionSelect }>;

export function toSubmission(row: SubmissionRow): SubmissionDTO {
  return {
    ...toSummary(row),
    description: row.description,
    rejectionReason: row.rejectionReason,
  };
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
