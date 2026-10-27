/** One-decimal rating, or a dash when there is none (an unreviewed title has a NULL average). */
export function formatRating(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—';
}

const AGO: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "2 days ago", "yesterday", "just now"; an empty string for a date that cannot be read. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((then - now) / 1000);
  if (seconds > -60) return 'just now'; // under a minute, or a clock slightly ahead
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of AGO) {
    if (-seconds >= size) return rtf.format(Math.trunc(seconds / size), unit);
  }
  return 'just now';
}
