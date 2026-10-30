import { isValidObjectId } from 'mongoose';
import { Role } from '@bingemate/shared';
import type { AuthUser, AuthorDTO, Paginated, ReplyDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { Reply } from '../../mongo/models/reply.model.js';
import { loadAuthors } from '../../utils/author.js';

interface ReplyDoc {
  _id: unknown;
  reviewId: string;
  userId: string;
  body: string;
  createdAt: Date;
  editedAt?: Date | null;
}

function assertCanWrite(user: AuthUser): void {
  if (user.role === Role.ADMIN) throw new HttpError(403, 'Admins cannot write reviews or replies');
}

/** A writer whose account is gone still has their words shown, under a neutral name. */
const removedUser = (id: string): AuthorDTO => ({ id, name: 'Deleted user', role: Role.CONSUMER });

function toReply(doc: ReplyDoc, authors: Map<string, AuthorDTO>): ReplyDTO {
  return {
    id: String(doc._id),
    reviewId: doc.reviewId,
    author: authors.get(doc.userId) ?? removedUser(doc.userId),
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
    ...(doc.editedAt ? { editedAt: doc.editedAt.toISOString() } : {}),
  };
}

async function oneReply(doc: ReplyDoc): Promise<ReplyDTO> {
  return toReply(doc, await loadAuthors([doc.userId]));
}

async function findReply(id: string): Promise<ReplyDoc> {
  // An id that cannot be a MongoDB id cannot exist, so it is a plain 404, not a cast error.
  const doc = isValidObjectId(id) ? ((await Reply.findById(id).lean()) as ReplyDoc | null) : null;
  if (!doc) throw new HttpError(404, 'Reply not found');
  return doc;
}

/** Oldest first, ties broken on id. Only for reviews of approved titles, like the reviews themselves. */
export async function listReplies(
  reviewId: string,
  page: number,
  pageSize: number,
): Promise<Paginated<ReplyDTO>> {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, title: { status: 'APPROVED' } },
    select: { id: true },
  });
  if (!review) throw new HttpError(404, 'Review not found');

  const [docs, total] = await Promise.all([
    Reply.find({ reviewId })
      .sort({ createdAt: 1, _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean() as unknown as Promise<ReplyDoc[]>,
    Reply.countDocuments({ reviewId }),
  ]);
  const authors = await loadAuthors(docs.map((d) => d.userId));
  return { data: docs.map((d) => toReply(d, authors)), page, pageSize, total };
}

/** Anyone signed in except an admin, the review's author and the title's creator included. */
export async function createReply(
  user: AuthUser,
  reviewId: string,
  body: string,
): Promise<ReplyDTO> {
  assertCanWrite(user);
  const review = await prisma.review.findFirst({
    where: { id: reviewId, title: { status: 'APPROVED' } },
    select: { id: true },
  });
  if (!review) throw new HttpError(404, 'Review not found');
  const doc = await Reply.create({ reviewId, userId: user.id, body });
  return oneReply(doc.toObject() as unknown as ReplyDoc);
}

/** Only the writer, never an admin. createdAt stays; editedAt is set when the text really changed. */
export async function updateReply(user: AuthUser, id: string, body: string): Promise<ReplyDTO> {
  assertCanWrite(user);
  const existing = await findReply(id);
  if (existing.userId !== user.id) throw new HttpError(403, 'You can only edit your own reply');
  if (existing.body === body) return oneReply(existing);

  // The writer is part of the filter, so the edit cannot land on someone else's reply.
  const updated = (await Reply.findOneAndUpdate(
    { _id: id, userId: user.id },
    { $set: { body, editedAt: new Date() } },
    { new: true },
  ).lean()) as ReplyDoc | null;
  if (!updated) throw new HttpError(404, 'Reply not found');
  return oneReply(updated);
}

/** The writer or an admin. */
export async function deleteReply(user: AuthUser, id: string): Promise<void> {
  const existing = await findReply(id);
  if (existing.userId !== user.id && user.role !== Role.ADMIN) {
    throw new HttpError(403, 'You can only delete your own reply');
  }
  await Reply.deleteOne({ _id: id });
}
