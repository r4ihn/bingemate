import { Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { TitlePoster } from '../../mongo/models/titlePoster.model.js';
import { sniffImage } from './image.js';
import type { ImageType } from './image.js';

/** The title's owner (a creator who made it) or an admin. Imported titles have no owner. */
async function assertCanChangeImage(user: AuthUser, titleId: string): Promise<void> {
  const title = await prisma.title.findUnique({
    where: { id: titleId },
    select: { createdById: true },
  });
  if (!title) throw new HttpError(404, 'Title not found');
  const owner = user.role === Role.CREATOR && title.createdById === user.id;
  if (!owner && user.role !== Role.ADMIN) {
    throw new HttpError(403, 'You can only change the image of a title you created');
  }
}

/**
 * Saves the image in MongoDB first, then points the title at it. If the second step fails the
 * image is simply not shown yet and the next upload overwrites it; the other order could leave a
 * title pointing at an image that does not exist.
 */
export async function putPoster(
  user: AuthUser,
  titleId: string,
  image: unknown,
): Promise<{ posterUrl: string }> {
  await assertCanChangeImage(user, titleId);
  if (!Buffer.isBuffer(image) || image.length === 0) {
    throw new HttpError(400, 'Send the image file as the request body');
  }
  const contentType = sniffImage(image);
  if (!contentType) throw new HttpError(415, 'Use a JPEG, PNG or WebP image');

  // Hide the title before overwriting bytes available at its old public URL. If either store
  // fails afterwards, leave it pending: restoring approval could publish an unreviewed image.
  if (user.role === Role.CREATOR) {
    await prisma.title.updateMany({
      where: { id: titleId, createdById: user.id, status: 'APPROVED' },
      data: { status: 'PENDING' },
    });
  }

  // Two uploads at once both end up pointing at whichever bytes MongoDB kept, because the URL
  // takes its version from the stored document, not from this request's own clock.
  const stored = (await TitlePoster.findOneAndUpdate(
    { _id: titleId },
    { $set: { contentType, data: image, version: Date.now() } },
    { upsert: true, new: true },
  ).lean()) as { version: number } | null;
  if (!stored) throw new HttpError(502, 'Could not save the image, please try again');
  const posterUrl = `/api/titles/${titleId}/poster?v=${stored.version}`;
  await prisma.title.update({ where: { id: titleId }, data: { posterUrl } });
  return { posterUrl };
}

/** Public for approved titles; private previews for the owner and admins. */
export async function getPoster(
  titleId: string,
  user?: AuthUser,
): Promise<{ contentType: ImageType; data: Buffer; version: number; isPublic: boolean }> {
  const title = await prisma.title.findFirst({
    where: {
      id: titleId,
      ...(user?.role === Role.ADMIN ? {} : { OR: [
        { status: 'APPROVED' },
        ...(user?.role === Role.CREATOR ? [{ createdById: user.id }] : []),
      ] }),
    },
    select: { id: true, status: true },
  });
  const doc = title
    ? ((await TitlePoster.findById(titleId).lean()) as {
        contentType: ImageType;
        data: Buffer | { buffer: Uint8Array };
        version: number;
      } | null)
    : null;
  if (!doc) throw new HttpError(404, 'No image for this title');
  // lean() can hand back the driver's Binary wrapper instead of a Buffer
  const data = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data.buffer);
  return { contentType: doc.contentType, data, version: doc.version, isPublic: title?.status === 'APPROVED' };
}

/** Clears the link first so nothing points at the image, then removes the bytes. */
export async function deletePoster(user: AuthUser, titleId: string): Promise<void> {
  await assertCanChangeImage(user, titleId);
  await prisma.title.update({ where: { id: titleId }, data: { posterUrl: null } });
  try {
    await TitlePoster.deleteOne({ _id: titleId });
  } catch (err) {
    console.error(
      `Title ${titleId} no longer shows its image but the bytes were not removed:`,
      err,
    );
  }
}
