import { existsSync } from 'node:fs';
import { toNumber } from './lib/clean.js';
import type { Row } from './lib/csv.js';
import { RAW_DIR, readProcessed, readRaw, runIfMain, writeProcessed } from './lib/io.js';
import { StepLog } from './lib/log.js';
import { googleCoverUrl, imdbPosterUrl, normalise, tvSearchName } from './lib/posters.js';

const SOURCE = 'MovieGenre_cleaned.csv';
/** MovieLens 1M movies.csv: TMDB poster links, which last longer than the Amazon ones in SOURCE. */
const TMDB_SOURCE = 'movielens_movies.csv';
const TV_SOURCE = 'tv_series_data_cleaned.csv';
const BOOK_SOURCE = 'books_data_cleaned.csv';
/** What fetch-posters.ts found online for the titles the files above miss. */
export const LOOKUP_SOURCE = 'lookup_posters.csv';
export const POSTER_COLUMNS = ['title_id', 'poster_url'] as const;

/** "Toy Story (1995)" -> name and year. Rows without a trailing (YYYY) cannot be matched. */
function splitTitle(title: string): { name: string; year: number } | null {
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(title.trim());
  return m ? { name: m[1] ?? '', year: Number(m[2]) } : null;
}

/**
 * The names a MovieLens title can be matched under. It writes "Outsiders, The (1983)" and may add an
 * alternative name in brackets: "City of Lost Children, The (Cité des enfants perdus, La) (1995)".
 */
function movieLensNames(name: string): string[] {
  const swap = (n: string) => n.replace(/^(.*?),\s*(the|a|an)$/i, '$2 $1');
  const alt = /\(([^()]*)\)\s*$/.exec(name)?.[1];
  const main = name.replace(/\s*\([^()]*\)\s*$/, '');
  return [swap(main), swap(name), ...(alt ? [swap(alt)] : [])];
}

/** Posters are hotlinked, so only https URLs are kept (an http image is blocked on an https page). */
function httpsUrl(value: string | undefined): string | null {
  const s = (value ?? '').trim().replace(/^http:\/\//i, 'https://');
  return /^https:\/\/[^\s"]+$/.test(s) ? s : null;
}

/** name + year -> poster for one source file, or empty when the file is not there. First row wins. */
function postersByKey(
  file: string,
  toEntry: (r: Row) => { name: string; year: string; url: string | null },
): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync(RAW_DIR + file)) return found;
  for (const r of readRaw(file)) {
    const { name, year, url } = toEntry(r);
    const key = `${normalise(name)}|${year}`;
    if (url !== null && !found.has(key)) found.set(key, url);
  }
  return found;
}

/**
 * Matches the poster sources to our titles on normalised name + release year, then falls back to
 * the saved online lookups (a TMDB lookup replaces a dead link from the files), and writes title_id -> poster_url. Every source is optional: raw files
 * are not committed, so without them the step writes an empty file and titles keep the gradient.
 */
export function main(): void {
  const log = new StepLog('clean-posters');
  const movies = readProcessed('movies.csv');
  log.count('movies', movies.length);

  const sources = [SOURCE, TMDB_SOURCE, TV_SOURCE, BOOK_SOURCE, LOOKUP_SOURCE];
  if (!sources.some((file) => existsSync(RAW_DIR + file))) {
    log.warn(`no poster source in data/raw (${sources.join(', ')}): no posters added`);
    writeProcessed('title_posters.csv', POSTER_COLUMNS, []);
    log.finish();
    return;
  }

  // One entry per name+year; where the source repeats a film, the higher IMDb score wins.
  const best = new Map<string, { url: string; score: number }>();
  const source = existsSync(RAW_DIR + SOURCE) ? readRaw(SOURCE) : [];
  log.count('source rows (raw)', source.length);
  for (const r of source) {
    const parsed = splitTitle(r['Title'] ?? '');
    if (parsed === null) {
      log.bump('source rows without a year (cannot match)');
      continue;
    }
    const url = httpsUrl(r['Poster']);
    if (url === null) {
      log.bump('source rows without a usable https poster');
      continue;
    }
    const key = `${normalise(parsed.name)}|${parsed.year}`;
    const score = toNumber(r['IMDB Score']) ?? 0;
    const seen = best.get(key);
    if (seen === undefined) best.set(key, { url, score });
    else {
      log.bump('source duplicates (kept the higher score)');
      if (score > seen.score) best.set(key, { url, score });
    }
  }

  // A MovieLens (TMDB) poster replaces a MovieGenre (Amazon) one for the same name + year: about a
  // quarter of the Amazon links no longer load.
  if (existsSync(RAW_DIR + TMDB_SOURCE)) {
    const tmdb = readRaw(TMDB_SOURCE);
    log.count('MovieLens rows (raw)', tmdb.length);
    for (const r of tmdb) {
      const parsed = splitTitle(r['movie_title'] ?? '');
      const url = httpsUrl(r['poster_url']);
      if (parsed === null || url === null) {
        log.bump('MovieLens rows without a year or a poster (skipped)');
        continue;
      }
      for (const name of movieLensNames(parsed.name)) {
        best.set(`${normalise(name)}|${parsed.year}`, { url, score: Infinity });
      }
    }
  }

  const found = (existsSync(RAW_DIR + LOOKUP_SOURCE) ? readRaw(LOOKUP_SOURCE) : []).filter(
    (r) => (r['poster_url'] ?? '') !== '',
  );
  const byTitle = (rows: Row[]) =>
    new Map(rows.map((r) => [r['title_id'] ?? '', r['poster_url'] ?? '']));
  // fetch-posters only asks TMDB about a title whose poster is missing or whose link is dead, so a
  // TMDB answer replaces the file's link. Other lookups only fill a gap.
  const tmdb = byTitle(found.filter((r) => r['source'] === 'tmdb'));
  const lookups = byTitle(found.filter((r) => r['source'] !== 'tmdb'));

  const out: Record<string, unknown>[] = [];
  let movieLookups = 0;
  for (const m of movies) {
    const hit = best.get(`${normalise(m['name'] ?? '')}|${m['release_year'] ?? ''}`);
    const looked = tmdb.get(m['title_id'] ?? '');
    if (looked !== undefined) movieLookups++;
    const url = looked ?? hit?.url;
    if (url !== undefined) out.push({ title_id: m['title_id'], poster_url: url });
    else {
      const { title_id, name, release_year } = m;
      log.reject('no poster match (keeps the gradient)', { title_id, name, release_year });
    }
  }

  log.count('movies with a poster', out.length);
  log.count('movies with a poster from a TMDB lookup', movieLookups);
  log.count('movies without a poster', movies.length - out.length);
  const addRest = (
    label: string,
    titles: Row[],
    files: Map<string, string>,
    toKeyName: (name: string) => string,
  ): void => {
    let fromFile = 0;
    let fromLookup = 0;
    for (const t of titles) {
      const id = t['title_id'] ?? '';
      const fromTmdb = tmdb.get(id);
      const file = files.get(`${normalise(toKeyName(t['name'] ?? ''))}|${t['release_year'] ?? ''}`);
      const url = fromTmdb ?? file ?? lookups.get(id);
      if (fromTmdb === undefined && file !== undefined) fromFile++;
      else if (url !== undefined) fromLookup++;
      if (url !== undefined) out.push({ title_id: id, poster_url: url });
    }
    log.count(`${label} with a poster from a file`, fromFile);
    log.count(`${label} with a poster from a lookup`, fromLookup);
    log.count(`${label} without a poster`, titles.length - fromFile - fromLookup);
  };
  addRest(
    'TV shows',
    readProcessed('tv_shows.csv'),
    postersByKey(TV_SOURCE, (r) => ({
      name: r['Series_Title'] ?? '',
      year: /\d{4}/.exec(r['Runtime_of_Series'] ?? '')?.[0] ?? '',
      url: httpsUrl(imdbPosterUrl(r['Poster_Link'] ?? '')),
    })),
    tvSearchName,
  );
  addRest(
    'books',
    readProcessed('books.csv'),
    postersByKey(BOOK_SOURCE, (r) => ({
      name: r['Title'] ?? '',
      year: /\d{4}/.exec(r['publishedDate'] ?? '')?.[0] ?? '',
      url: httpsUrl(googleCoverUrl(r['image'] ?? '')),
    })),
    (name) => name,
  );

  writeProcessed('title_posters.csv', POSTER_COLUMNS, out);
  log.finish();
}

runIfMain(import.meta.url, main);
