const DAY_MS = 86_400_000;
const FIRST_DAY = Date.UTC(2022, 0, 1);
/** 1 Jan 2022 to 31 Dec 2025 inclusive (2024 is a leap year). */
const DAYS_IN_RANGE = 365 * 3 + 366;

/** 32-bit FNV-1a: a stable number for a string, with no dependency. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * A made-up date from 2022 to 2025 for a review the dataset has no date for (947 TV reviews). It is
 * picked from the dataset review id, not from Math.random, so both loaders get the same day for the
 * same review and a reload gives the same dates again.
 */
export function undatedReviewDate(reviewId: string): Date {
  return new Date(FIRST_DAY + (hash(reviewId) % DAYS_IN_RANGE) * DAY_MS);
}

/** The createdAt of a review from its cleaned `created_at` (YYYY-MM-DD, or empty when undated). */
export function reviewCreatedAt(date: string | null | undefined, reviewId: string): Date {
  return date ? new Date(`${date}T00:00:00Z`) : undatedReviewDate(reviewId);
}
