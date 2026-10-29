/**
 * Stand-in date for reviews the dataset has no date for (947 TV reviews). It is older than every
 * real review (the earliest is from 1938), so undated ones sort to the end of a newest-first list
 * instead of showing up as written on the day of the load. Both loaders use it, so the two
 * stores agree.
 */
export const UNDATED_REVIEW_DATE = '1900-01-01';

/** The createdAt of a review from its cleaned `created_at` (YYYY-MM-DD, or empty when undated). */
export function reviewCreatedAt(date: string | null | undefined): Date {
  return new Date(`${date || UNDATED_REVIEW_DATE}T00:00:00Z`);
}
