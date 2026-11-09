import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { LOOKUP_SOURCE } from './clean-posters.js';
import { toInt } from './lib/clean.js';
import { toCsv, type Row } from './lib/csv.js';
import { RAW_DIR, readProcessed, readRaw, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';
import {
  bookCoverFromSearch,
  bookSearchName,
  movieSearchName,
  tmdbPosterFromSearch,
  tvPosterFromSearch,
  tvSearchName,
} from './lib/posters.js';
import { fetchJson, TMDB_DELAY_MS, tmdbFromEnv, tmdbSearch } from './lib/tmdb.js';

const COLUMNS = ['title_id', 'name', 'source', 'poster_url'] as const;
const TV_DELAY_MS = 600; // TVmaze allows about 20 calls in 10 seconds
const BOOK_DELAY_MS = 1100; // Open Library asks for about one call a second
const LINK_CHECKS_AT_ONCE = 16;
const SAVE_EVERY = 25;

/**
 * True only when the image host says the poster is gone (404 or 410). A network error or timeout
 * proves nothing, so that link is kept. Asks for one byte, not the whole image.
 */
async function isDead(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'BingeMate class project', Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(20_000),
    });
    await res.body?.cancel();
    return res.status === 404 || res.status === 410;
  } catch {
    return false;
  }
}

/** Runs `check` over `items`, a few at a time, and returns the items it was true for. */
async function filterAsync<T>(items: T[], check: (item: T) => Promise<boolean>): Promise<T[]> {
  const hits: T[] = [];
  for (let i = 0; i < items.length; i += LINK_CHECKS_AT_ONCE) {
    const batch = items.slice(i, i + LINK_CHECKS_AT_ONCE);
    const results = await Promise.all(batch.map(check));
    batch.forEach((item, j) => results[j] && hits.push(item));
  }
  return hits;
}

/**
 * Looks up posters the poster files miss and saves what it finds to data/raw/lookup_posters.csv for
 * clean-posters.ts:
 *
 * - movies and TV shows on TMDB, when they have no poster or their poster link is dead (most of the
 *   dataset's old IMDb links on Amazon now answer 404). Needs TMDB_API_KEY; without it this part is
 *   skipped.
 * - TV shows on TVmaze and books on Open Library, when they still have no poster.
 *
 * It needs the network, so it is not part of clean-all. Run clean-all first, then
 * `npx tsx --env-file=apps/api/.env data/etl/fetch-posters.ts`, then clean-all again. A rerun skips
 * every title already answered, so it can be stopped and resumed; a title with no match is saved
 * with an empty poster_url so it is not asked for again (`--retry-misses` asks TMDB again about those). The key is only sent to TMDB: it is never
 * logged or written to a file.
 */
export async function main(): Promise<void> {
  const log = new StepLog('fetch-posters');
  const saved: Row[] = existsSync(RAW_DIR + LOOKUP_SOURCE) ? readRaw(LOOKUP_SOURCE) : [];
  const skip = new Set([
    ...saved.map((r) => r['title_id']),
    ...readProcessed('title_posters.csv').map((r) => r['title_id']),
  ]);
  const save = () => writeFileSync(RAW_DIR + LOOKUP_SOURCE, toCsv(COLUMNS, saved));

  const lookUp = async (
    titles: Row[],
    source: string,
    delayMs: number,
    find: (t: Row) => Promise<string | null | undefined>,
  ): Promise<void> => {
    const todo = titles.filter((t) => !skip.has(t['title_id']));
    log.count(`${source} titles to look up`, todo.length);
    let found = 0;
    for (const [i, t] of todo.entries()) {
      const url = await find(t);
      await wait(delayMs);
      if (url === undefined) {
        log.bump(`${source} lookups that failed (retried next run)`);
        continue;
      }
      if (url !== null) found++;
      saved.push({
        title_id: t['title_id'] ?? '',
        name: t['name'] ?? '',
        source,
        poster_url: url ?? '',
      });
      if ((i + 1) % SAVE_EVERY === 0) {
        save();
        log.info(`${source}: ${i + 1} of ${todo.length}, ${found} found`);
      }
    }
    save();
    log.count(`${source} posters found`, found);
  };

  // Movies and TV shows: no poster, or a poster link the image host says is gone. TMDB goes first so
  // a TV show it answers is not asked of TVmaze as well.
  const tmdb = await tmdbFromEnv();
  if ('problem' in tmdb) {
    log.warn(`${tmdb.problem}: TMDB is not asked`);
  } else {
    const posters = new Map(
      readProcessed('title_posters.csv').map((r) => [r['title_id'] ?? '', r['poster_url'] ?? '']),
    );
    // --retry-misses asks TMDB again about every title it had no answer for (after a matching fix).
    if (process.argv.includes('--retry-misses')) {
      const before = saved.length;
      for (let i = saved.length - 1; i >= 0; i--) {
        if (saved[i]?.['source'] === 'tmdb' && !saved[i]?.['poster_url']) saved.splice(i, 1);
      }
      log.count('TMDB misses to ask again (--retry-misses)', before - saved.length);
    }
    const askedTmdb = new Set(
      saved.filter((r) => r['source'] === 'tmdb').map((r) => r['title_id']),
    );
    const { auth } = tmdb;

    const askTmdb = async (file: string, kind: 'movie' | 'tv', label: string) => {
      const titles = readProcessed(file).filter((t) => !askedTmdb.has(t['title_id']));
      const linked = titles.filter((t) => posters.has(t['title_id'] ?? ''));
      log.info(`checking ${linked.length} ${label} poster links`);
      const dead = await filterAsync(linked, (t) => isDead(posters.get(t['title_id'] ?? '') ?? ''));
      log.count(`${label} poster links that are dead`, dead.length);
      const missing = titles.filter((t) => !posters.has(t['title_id'] ?? ''));
      log.count(`${label} without a poster`, missing.length);

      const todo = [...dead, ...missing];
      // A dead link counts as unanswered, and so does a TVmaze miss: TMDB gets its own try.
      for (const t of todo) skip.delete(t['title_id']);
      await lookUp(todo, 'tmdb', TMDB_DELAY_MS, async (t) => {
        const raw = t['name'] ?? '';
        const year = toInt(t['release_year']);
        // Try the plain name, then a shorter one; a TV special or TV film is a movie on TMDB.
        const tries: ['movie' | 'tv', string][] =
          kind === 'tv'
            ? [
                ['tv', tvSearchName(raw)],
                ['movie', tvSearchName(raw)],
              ]
            : [
                ['movie', raw],
                ['movie', movieSearchName(raw)],
              ];
        const seen = new Set<string>();
        for (const [k, name] of tries) {
          if (seen.has(`${k}|${name}`)) continue;
          seen.add(`${k}|${name}`);
          const results = await tmdbSearch(k, name, auth);
          if (results === undefined) return undefined;
          const url = tmdbPosterFromSearch(results, name, year);
          if (url !== null) return url;
          await wait(TMDB_DELAY_MS);
        }
        return null;
      });
      for (const t of todo) skip.add(t['title_id']);
    };
    await askTmdb('movies.csv', 'movie', 'movie');
    await askTmdb('tv_shows.csv', 'tv', 'TV show');
  }

  await lookUp(readProcessed('tv_shows.csv'), 'tvmaze', TV_DELAY_MS, async (t) => {
    const name = t['name'] ?? '';
    const q = encodeURIComponent(tvSearchName(name));
    const results = await fetchJson<Parameters<typeof tvPosterFromSearch>[0]>(
      `https://api.tvmaze.com/search/shows?q=${q}`,
    );
    return results === null
      ? undefined
      : tvPosterFromSearch(results, name, toInt(t['release_year']));
  });

  await lookUp(readProcessed('books.csv'), 'openlibrary', BOOK_DELAY_MS, async (t) => {
    const name = t['name'] ?? '';
    const q = encodeURIComponent(bookSearchName(name));
    const reply = await fetchJson<{ docs: Parameters<typeof bookCoverFromSearch>[0] }>(
      `https://openlibrary.org/search.json?limit=10&fields=title,cover_i,first_publish_year&title=${q}`,
    );
    return reply === null
      ? undefined
      : bookCoverFromSearch(reply.docs, name, toInt(t['release_year']));
  });

  log.finish();
}

runIfMain(import.meta.url, main);
