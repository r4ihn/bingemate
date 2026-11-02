import type { Prisma } from '@prisma/client';
import type { AuthUser, SubmissionDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import type { CreateSubmissionInput } from './submissions.schema.js';
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
