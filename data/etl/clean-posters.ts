import { existsSync } from 'node:fs';
import { toNumber } from './lib/clean.js';
import { RAW_DIR, readProcessed, readRaw, runIfMain, writeProcessed } from './lib/io.js';
import { StepLog } from './lib/log.js';

const SOURCE = 'MovieGenre_cleaned.csv';
/** MovieLens 1M movies.csv: TMDB poster links, which last longer than the Amazon ones in SOURCE. */
const TMDB_SOURCE = 'movielens_movies.csv';
export const POSTER_COLUMNS = ['title_id', 'poster_url'] as const;

/** Comparable form of a title: no accents, no leading article, letters and digits only. */
function normalise(name: string): string {
  const folded = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(the|a|an) /, '');
  return folded.replace(/[^a-z0-9]/g, '');
}

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

/**
 * Matches the Kaggle MovieGenre posters to our movies on normalised name + release year and writes
 * title_id -> poster_url. The source is optional: raw files are not committed, so without it the
 * step writes an empty file and the movies keep their placeholder gradient.
 */
export function main(): void {
  const log = new StepLog('clean-posters');
  const movies = readProcessed('movies.csv');
  log.count('movies', movies.length);

  if (!existsSync(RAW_DIR + SOURCE) && !existsSync(RAW_DIR + TMDB_SOURCE)) {
    log.warn(`${SOURCE} and ${TMDB_SOURCE} not found in data/raw: no posters added`);
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

  const out: Record<string, unknown>[] = [];
  for (const m of movies) {
    const hit = best.get(`${normalise(m['name'] ?? '')}|${m['release_year'] ?? ''}`);
    if (hit) out.push({ title_id: m['title_id'], poster_url: hit.url });
    else {
      const { title_id, name, release_year } = m;
      log.reject('no poster match (keeps the gradient)', { title_id, name, release_year });
    }
  }

  log.count('movies with a poster', out.length);
  log.count('movies without a poster', movies.length - out.length);
  writeProcessed('title_posters.csv', POSTER_COLUMNS, out);
  log.finish();
}

runIfMain(import.meta.url, main);
