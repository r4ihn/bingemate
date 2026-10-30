import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// data/etl has no test runner and sits outside this package's rootDir, so it is imported at run time.
const file = fileURLToPath(new URL('../../../../data/etl/lib/posters.ts', import.meta.url));
const { titleVisibility } = (await import(/* @vite-ignore */ file)) as {
  titleVisibility: (
    mediaType: string,
    posterUrl: string | null,
    postersLoaded: boolean,
  ) => { status: string; rejectionReason: string | null };
};

const shown = { status: 'APPROVED', rejectionReason: null };

describe('titleVisibility', () => {
  it('shows a movie with a poster', () => {
    expect(titleVisibility('MOVIE', 'https://x/p.jpg', true)).toEqual(shown);
  });

  it('hides a movie with no poster when posters were loaded', () => {
    expect(titleVisibility('MOVIE', null, true)).toEqual({
      status: 'REJECTED',
      rejectionReason: 'Imported movie without a poster',
    });
  });

  it('shows every movie when no poster source was available', () => {
    expect(titleVisibility('MOVIE', null, false)).toEqual(shown);
  });

  it('never hides TV shows or books for a missing poster', () => {
    expect(titleVisibility('TV_SHOW', null, true)).toEqual(shown);
    expect(titleVisibility('BOOK', null, true)).toEqual(shown);
  });
});
