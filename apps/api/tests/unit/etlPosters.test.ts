import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// data/etl has no test runner and sits outside this package's rootDir, so it is imported at run time.
const file = fileURLToPath(new URL('../../../../data/etl/lib/posters.ts', import.meta.url));
type Show = {
  show: { name: string; premiered: string | null; image: { original: string } | null };
};
type Doc = { title: string; cover_i?: number; first_publish_year?: number };
type Movie = {
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path: string | null;
};
const {
  bookCoverFromSearch,
  googleCoverUrl,
  hasMoviePoster,
  imdbPosterUrl,
  titleVisibility,
  movieSearchName,
  normalise,
  tvSearchName,
  tmdbAuth,
  tmdbPosterFromSearch,
  tvPosterFromSearch,
} = (await import(/* @vite-ignore */ file)) as {
  titleVisibility: (
    mediaType: string,
    posterUrl: string | null,
    postersLoaded: boolean,
  ) => { status: string; rejectionReason: string | null };
  hasMoviePoster: (titles: Record<string, string>[], posters: Map<string, string>) => boolean;
  imdbPosterUrl: (url: string) => string;
  googleCoverUrl: (url: string) => string;
  tvPosterFromSearch: (results: Show[], name: string, year: number | null) => string | null;
  bookCoverFromSearch: (docs: Doc[], name: string, year: number | null) => string | null;
  tmdbPosterFromSearch: (results: Movie[], name: string, year: number | null) => string | null;
  tmdbAuth: (key: string) => { query: string; headers: Record<string, string> };
  movieSearchName: (name: string) => string;
  tvSearchName: (name: string) => string;
  normalise: (name: string) => string;
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

describe('hasMoviePoster', () => {
  const titles = [
    { title_id: '1', media_type: 'MOVIE' },
    { title_id: '2', media_type: 'TV_SHOW' },
  ];

  it('is true when a movie has a poster', () => {
    expect(hasMoviePoster(titles, new Map([['1', 'https://x/p.jpg']]))).toBe(true);
  });

  it('ignores posters that belong to other media', () => {
    expect(hasMoviePoster(titles, new Map([['2', 'https://x/p.jpg']]))).toBe(false);
  });
});

describe('source URL fixes', () => {
  it('asks IMDb for a 300px poster instead of the 67px thumbnail', () => {
    expect(
      imdbPosterUrl('https://m.media-amazon.com/images/M/MV5Bx@._V1_UY98_CR2,0,67,98_AL_.jpg'),
    ).toBe('https://m.media-amazon.com/images/M/MV5Bx@._V1_SX300.jpg');
  });

  it('makes a Google cover https and larger, with no page curl', () => {
    expect(
      googleCoverUrl(
        'http://books.google.com/books/content?id=a&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api',
      ),
    ).toBe(
      'https://books.google.com/books/content?id=a&printsec=frontcover&img=1&zoom=2&source=gbs_api',
    );
  });
});

describe('tvPosterFromSearch', () => {
  const show = (name: string, premiered: string | null, image = 'https://t/p.jpg'): Show => ({
    show: { name, premiered, image: { original: image } },
  });

  it('takes the show with the same name and year', () => {
    const results = [
      show('Atlanta', '2009-01-01', 'https://t/old.jpg'),
      show('Atlanta', '2016-09-06'),
    ];
    expect(tvPosterFromSearch(results, 'Atlanta', 2016)).toBe('https://t/p.jpg');
  });

  it('accepts a longer local name for the same show and year', () => {
    expect(
      tvPosterFromSearch(
        [show('Blue Planet II', '2017-10-29')],
        'Planet Earth: Blue Planet II',
        2017,
      ),
    ).toBe('https://t/p.jpg');
  });

  it('ignores a (year) suffix in our name', () => {
    expect(
      tvPosterFromSearch([show('Search Party', '2016-11-21')], 'Search Party (2016)', 2016),
    ).toBe('https://t/p.jpg');
  });

  it('refuses the right name in the wrong year', () => {
    expect(tvPosterFromSearch([show('Atlanta', '2009-01-01')], 'Atlanta', 2016)).toBeNull();
  });

  it('refuses the right year with a different name', () => {
    expect(tvPosterFromSearch([show('Ozark', '2016-09-06')], 'Atlanta', 2016)).toBeNull();
  });

  it('needs an exact name when we have no year', () => {
    expect(
      tvPosterFromSearch(
        [show('Blue Planet II', '2017-10-29')],
        'Planet Earth: Blue Planet II',
        null,
      ),
    ).toBeNull();
    expect(tvPosterFromSearch([show('Atlanta', '2016-09-06')], 'Atlanta', null)).toBe(
      'https://t/p.jpg',
    );
  });

  it('skips a show with no image', () => {
    const noImage: Show = { show: { name: 'Atlanta', premiered: '2016-09-06', image: null } };
    expect(tvPosterFromSearch([noImage], 'Atlanta', 2016)).toBeNull();
  });
});

describe('bookCoverFromSearch', () => {
  const cover = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

  it('matches on the title before any subtitle', () => {
    const docs = [{ title: 'Struts in Action', cover_i: 7 }];
    expect(bookCoverFromSearch(docs, 'Struts in Action: Building Web Applications', 2002)).toBe(
      cover(7),
    );
  });

  it('prefers the edition from the same year', () => {
    const docs = [
      { title: 'Heat', cover_i: 1, first_publish_year: 1990 },
      { title: 'Heat', cover_i: 2, first_publish_year: 2002 },
    ];
    expect(bookCoverFromSearch(docs, 'Heat', 2002)).toBe(cover(2));
  });

  it('refuses a different title', () => {
    expect(
      bookCoverFromSearch([{ title: 'Struts Fundamentals', cover_i: 7 }], 'Struts in Action', 2002),
    ).toBeNull();
  });

  it('skips a result with no cover', () => {
    expect(bookCoverFromSearch([{ title: 'Heat' }], 'Heat', 2002)).toBeNull();
  });
});

describe('tmdbPosterFromSearch', () => {
  const movie = (title: string, release_date: string, poster_path: string | null = '/p.jpg') => ({
    title,
    release_date,
    poster_path,
  });
  const url = (path: string) => `https://image.tmdb.org/t/p/w500${path}`;

  it('takes the same title from the same year', () => {
    const results = [movie('1492: Conquest of Paradise', '1992-10-09', '/1492.jpg')];
    expect(tmdbPosterFromSearch(results, '1492: Conquest of Paradise', 1992)).toBe(
      url('/1492.jpg'),
    );
  });

  it('prefers the exact year over a remake or a neighbouring year', () => {
    const results = [
      movie('Fresh', '2022-03-03', '/remake.jpg'),
      movie('Fresh', '1993-09-01', '/near.jpg'),
      movie('Fresh', '1994-04-08', '/ours.jpg'),
    ];
    expect(tmdbPosterFromSearch(results, 'Fresh', 1994)).toBe(url('/ours.jpg'));
    expect(tmdbPosterFromSearch(results.slice(0, 2), 'Fresh', 1994)).toBe(url('/near.jpg'));
  });

  it('refuses another year, another title, or a result with no poster', () => {
    expect(tmdbPosterFromSearch([movie('Split', '2010-01-01')], 'Split', 2016)).toBeNull();
    expect(tmdbPosterFromSearch([movie('Split Second', '2016-01-01')], 'Split', 2016)).toBeNull();
    expect(tmdbPosterFromSearch([movie('Split', '2016-09-26', null)], 'Split', 2016)).toBeNull();
  });

  it('matches the original title, ignoring case, accents and a leading article', () => {
    const results = [
      {
        title: 'The City of Lost Children',
        original_title: 'La Cité des enfants perdus',
        release_date: '1995-05-17',
        poster_path: '/c.jpg',
      },
    ];
    expect(tmdbPosterFromSearch(results, 'City of Lost Children', 1995)).toBe(url('/c.jpg'));
  });
});

describe('tmdbAuth', () => {
  it('sends a v3 key as api_key and a v4 token as a Bearer header', () => {
    expect(tmdbAuth('abc123')).toEqual({ query: '&api_key=abc123', headers: {} });
    expect(tmdbAuth('eyJhbGciOi.x.y')).toEqual({
      query: '',
      headers: { Authorization: 'Bearer eyJhbGciOi.x.y' },
    });
  });
});

describe('search names', () => {
  it('drops a year or a country tag from a TV name', () => {
    expect(tvSearchName('All The Way (2016)')).toBe('All The Way');
    expect(tvSearchName('Episodes (US)')).toBe('Episodes');
    expect(tvSearchName('The Traitors [UK]')).toBe('The Traitors');
    expect(tvSearchName('M*A*S*H')).toBe('M*A*S*H');
  });

  it('drops a trailing "The Movie" from a movie name', () => {
    expect(movieSearchName('Left Behind: The Movie')).toBe('Left Behind');
    expect(movieSearchName('The Movie Critic')).toBe('The Movie Critic');
  });

  it('reads & as and', () => {
    expect(normalise('Rick & Morty')).toBe(normalise('Rick and Morty'));
  });
});
