export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Largest accepted upload. The web app shrinks images to roughly 100 KB before sending. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

const startsWith = (buf: Buffer, bytes: number[], at = 0) =>
  buf.length >= at + bytes.length && bytes.every((b, i) => buf[at + i] === b);

/**
 * Tells what an upload really is from its first bytes. The Content-Type header and the file name
 * are whatever the sender typed, so they are never trusted. SVG is not accepted on purpose: it can
 * carry scripts.
 */
export function sniffImage(buf: Buffer): ImageType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // WebP is a RIFF file: "RIFF", four size bytes, then "WEBP"
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}
