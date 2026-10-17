/** One-decimal rating, or a dash when there is none (an unreviewed title has a NULL average). */
export function formatRating(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—';
}
