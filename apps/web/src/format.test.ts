import { describe, expect, it } from 'vitest';
import { formatRating, timeAgo } from './format.js';

describe('formatRating', () => {
  it('formats to one decimal', () => expect(formatRating(8)).toBe('8.0'));
  it.each([null, undefined, Number.NaN])('shows a dash for %s (an unreviewed title)', (v) => {
    expect(formatRating(v as number | null | undefined)).toBe('—');
  });
});

describe('timeAgo', () => {
  const now = Date.UTC(2026, 9, 27, 12, 0, 0);
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();
  it.each([
    [10, 'just now'],
    [59, 'just now'],
    [60, '1 minute ago'],
    [5 * 60, '5 minutes ago'],
    [3 * 3600, '3 hours ago'],
    [86_400, 'yesterday'],
    [2 * 86_400, '2 days ago'],
    [14 * 86_400, '2 weeks ago'],
    [400 * 86_400, 'last year'],
  ])('%i seconds ago reads %s', (seconds, text) => expect(timeAgo(ago(seconds), now)).toBe(text));

  it('treats a time slightly in the future as just now', () => {
    expect(timeAgo(new Date(now + 30_000).toISOString(), now)).toBe('just now');
  });

  it('returns an empty string for a date it cannot read', () => {
    expect(timeAgo('not a date', now)).toBe('');
  });
});
