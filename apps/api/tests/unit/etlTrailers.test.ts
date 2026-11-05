import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// data/etl has no test runner and sits outside this package's rootDir, so it is imported at run time.
const file = fileURLToPath(new URL('../../../../data/etl/lib/trailers.ts', import.meta.url));
type Video = { site: string; type: string; key: string; official?: boolean; iso_639_1?: string };
const { pickTrailer, YOUTUBE_KEY } = (await import(/* @vite-ignore */ file)) as {
  pickTrailer: (videos: Video[]) => string | null;
  YOUTUBE_KEY: RegExp;
};

const video = (over: Partial<Video>): Video => ({
  site: 'YouTube',
  type: 'Trailer',
  key: 'aaaaaaaaaaa',
  official: true,
  iso_639_1: 'en',
  ...over,
});

describe('pickTrailer', () => {
  it('prefers an official English trailer over teasers, fan uploads and other languages', () => {
    const videos = [
      video({ type: 'Teaser', key: 'teaser00000' }),
      video({ official: false, key: 'fanupload00' }),
      video({ iso_639_1: 'fr', key: 'french00000' }),
      video({ key: 'official000' }),
    ];
    expect(pickTrailer(videos)).toBe('official000');
  });

  it('falls back to a teaser when there is no trailer', () => {
    expect(
      pickTrailer([video({ type: 'Featurette' }), video({ type: 'Teaser', key: 'teaser00000' })]),
    ).toBe('teaser00000');
  });

  it('ignores other sites, other kinds of video, and keys that are not YouTube ids', () => {
    expect(
      pickTrailer([
        video({ site: 'Vimeo' }),
        video({ type: 'Clip' }),
        video({ key: 'not a key' }),
        video({ key: '"><script>' }),
      ]),
    ).toBeNull();
    expect(pickTrailer([])).toBeNull();
  });

  it('keeps TMDB order between equally good trailers', () => {
    expect(pickTrailer([video({ key: 'first000000' }), video({ key: 'second00000' })])).toBe(
      'first000000',
    );
  });

  it('YOUTUBE_KEY matches the same format as the database CHECK', () => {
    expect(YOUTUBE_KEY.test('dQw4w9WgXcQ')).toBe(true);
    expect(YOUTUBE_KEY.test('dQw4w9WgXc')).toBe(false);
    expect(YOUTUBE_KEY.test('dQw4w9WgXcQ?')).toBe(false);
  });
});
