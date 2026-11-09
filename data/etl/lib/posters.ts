import type { Row } from './csv.js';

export const NO_POSTER_REASON = 'Imported movie without a poster';

/** Comparable form of a title: no accents, "&" read as "and", no leading article, letters and digits only. */
export function normalise(name: string): string {
  const folded = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^(the|a|an) /, '');
  return folded.replace(/[^a-z0-9]/g, '');
}

/** Our TV names can carry a year or a country to tell versions apart: "Search Party (2016)", "The Traitors [UK]". */
export function tvSearchName(name: string): string {
  return name.replace(/\s*[([](\d{4}|UK|US|AU|NZ|CA|IE)[)\]]\s*$/i, '');
}

/** A movie title without a trailing "The Movie": "Left Behind: The Movie" -> "Left Behind". */
export function movieSearchName(name: string): string {
  return name.replace(/\s*[:-]\s*the movie\s*$/i, '');
}

/** A book title without its subtitle or series: "Struts in Action: Building ..." */
export function bookSearchName(name: string): string {
  return (name.split(/[:([]/)[0] ?? '').trim();
}

/**
 * A movie must have a poster to be shown. REJECTED keeps the row (and its reviews) but the API treats
 * anything not APPROVED as absent; approve it once a poster exists. With no poster source at all
 * (raw files are not committed) nothing is hidden, so every movie keeps the gradient.
 */
export function titleVisibility(
  mediaType: string,
  posterUrl: string | null,
  postersLoaded: boolean,
): { status: 'APPROVED' | 'REJECTED'; rejectionReason: string | null } {
  return postersLoaded && mediaType === 'MOVIE' && posterUrl === null
    ? { status: 'REJECTED', rejectionReason: NO_POSTER_REASON }
    : { status: 'APPROVED', rejectionReason: null };
}

/** Whether any movie has a poster. TV and book posters say nothing about the movie sources. */
export function hasMoviePoster(titles: Row[], posters: Map<string, string>): boolean {
  return titles.some((t) => t['media_type'] === 'MOVIE' && posters.has(t['title_id'] ?? ''));
}

/** The dataset's links are 67px thumbnails; the same image is served at any size. */
export function imdbPosterUrl(url: string): string {
  return url.replace(/\._V1_.*$/, '._V1_SX300.jpg');
}

/** Https (an http image is blocked on an https page), larger, and without the page-curl effect. */
export function googleCoverUrl(url: string): string {
  return url
    .replace(/^http:/, 'https:')
    .replace('zoom=1', 'zoom=2')
    .replace('&edge=curl', '');
}

type TvMazeResult = {
  show: { name: string; premiered: string | null; image: { original: string } | null };
};

/** Same show only: the year must agree when we have one, and a name alone must match exactly. */
export function tvPosterFromSearch(
  results: TvMazeResult[],
  name: string,
  year: number | null,
): string | null {
  const ours = normalise(tvSearchName(name));
  const hit = results.find(({ show }) => {
    const theirs = normalise(show.name);
    if (show.image === null) return false;
    if (year === null) return theirs === ours;
    const related = theirs.length >= 6 && (ours.includes(theirs) || theirs.includes(ours));
    return show.premiered?.slice(0, 4) === String(year) && (theirs === ours || related);
  });
  return hit?.show.image?.original ?? null;
}

type OpenLibraryDoc = { title: string; cover_i?: number; first_publish_year?: number };

/** Same title once subtitles are dropped, preferring the edition from the same year. */
export function bookCoverFromSearch(
  docs: OpenLibraryDoc[],
  name: string,
  year: number | null,
): string | null {
  const ours = normalise(bookSearchName(name));
  const same = docs.filter(
    (d) => d.cover_i !== undefined && normalise(bookSearchName(d.title)) === ours,
  );
  const hit = same.find((d) => d.first_publish_year === year) ?? same[0];
  return hit ? `https://covers.openlibrary.org/b/id/${hit.cover_i}-L.jpg` : null;
}

/** A TMDB search result, in the movie shape (TV results are mapped to it). */
export type TmdbResult = {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  poster_path: string | null;
};

/**
 * The same film or show: the title (or original title) must match once normalised, and the release year
 * must be ours or one either side (TMDB often dates a film by its first festival or home release).
 * The exact year wins over a neighbouring one; ties keep TMDB's relevance order.
 */
export function tmdbMatch<T extends Omit<TmdbResult, 'id'>>(
  results: T[],
  name: string,
  year: number | null,
  needPoster = true,
): T | undefined {
  const ours = normalise(name);
  const yearOf = (m: T) => Number(m.release_date?.slice(0, 4)) || null;
  const same = results.filter(
    (m) =>
      (!needPoster || m.poster_path !== null) &&
      (normalise(m.title) === ours || normalise(m.original_title ?? '') === ours),
  );
  // Without a year nothing tells a remake from the original: only an unambiguous name counts.
  if (year === null) return same.length === 1 ? same[0] : undefined;
  return (
    same.find((m) => yearOf(m) === year) ??
    same.find((m) => {
      const y = yearOf(m);
      return y !== null && Math.abs(y - year) === 1;
    })
  );
}

/** The poster of the matching TMDB result (see tmdbMatch), at 500 px wide. */
export function tmdbPosterFromSearch(
  results: Omit<TmdbResult, 'id'>[],
  name: string,
  year: number | null,
): string | null {
  const hit = tmdbMatch(results, name, year);
  return hit?.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : null;
}

/** TMDB accepts a v3 API key as `?api_key=` or a v4 read access token (a JWT) as a Bearer header. */
export function tmdbAuth(key: string): { query: string; headers: Record<string, string> } {
  return key.startsWith('eyJ')
    ? { query: '', headers: { Authorization: `Bearer ${key}` } }
    : { query: `&api_key=${encodeURIComponent(key)}`, headers: {} };
}
