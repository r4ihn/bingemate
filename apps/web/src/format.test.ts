import { describe, expect, it } from 'vitest';
import { formatRating } from './format.js';

describe('formatRating', () => {
  it('formats to one decimal', () => expect(formatRating(8)).toBe('8.0'));
  it.each([null, undefined, Number.NaN])('shows a dash for %s (an unreviewed title)', (v) => {
    expect(formatRating(v as number | null | undefined)).toBe('—');
  });
});
