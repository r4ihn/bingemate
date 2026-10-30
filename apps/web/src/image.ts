/** Types the poster upload accepts. The API checks the file's real bytes and accepts the same three. */
export const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Largest file a creator may pick. It is shrunk before upload, so this only stops absurd files. */
const PICK_LIMIT = 8 * 1024 * 1024;
/** What the API accepts (1 MB). */
const UPLOAD_LIMIT = 1024 * 1024;
const POSTER_MAX_WIDTH = 600;
const QUALITIES = [0.85, 0.7, 0.5];

/** A message for the creator when the chosen file cannot be used, otherwise null. */
export function checkPosterFile(file: { type: string; size: number }): string | null {
  if (!POSTER_TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP image';
  if (file.size > PICK_LIMIT) return 'Choose an image under 8 MB';
  return null;
}

/** Scales down to `maxWidth` keeping the shape; never scales up. */
export function fitWithin(width: number, height: number, maxWidth: number) {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/**
 * Redraws the image at poster size as a JPEG small enough to upload (a few hundred KB at most).
 * Transparent areas are filled white, since JPEG has no transparency. Throws an Error whose message
 * can be shown as is.
 */
export async function shrinkPoster(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That image could not be read');
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, POSTER_MAX_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the image');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    for (const quality of QUALITIES) {
      const blob = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done, 'image/jpeg', quality),
      );
      if (blob && blob.size <= UPLOAD_LIMIT) return blob;
    }
    throw new Error('That image is too large, even after shrinking');
  } finally {
    bitmap.close?.();
  }
}
