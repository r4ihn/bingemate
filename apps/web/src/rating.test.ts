import { describe, expect, it } from 'vitest';
import { RATING_MAX as SHARED_MAX, RATING_MIN as SHARED_MIN } from '@bingemate/shared';
import { RATING_MAX, RATING_MIN, RATING_WORDS } from './rating.js';

describe('rating scale', () => {
  it('is the one shared with the API and the ETL, not a copy', () => {
    expect(RATING_MIN).toBe(SHARED_MIN);
    expect(RATING_MAX).toBe(SHARED_MAX);
  });

  it('has a word for every star count, and none for zero', () => {
    expect(RATING_WORDS).toHaveLength(RATING_MAX + 1);
    expect(RATING_WORDS[0]).toBe('');
    for (let n = RATING_MIN; n <= RATING_MAX; n++) expect(RATING_WORDS[n]).toBeTruthy();
  });
});
