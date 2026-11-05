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
  tvPosterFromSearch,
  tvSearchName,
} from './lib/posters.js';

const COLUMNS = ['title_id', 'name', 'source', 'poster_url'] as const;
const TV_DELAY_MS = 600; // TVmaze allows about 20 calls in 10 seconds
const BOOK_DELAY_MS = 1100; // Open Library asks for about one call a second
const BUSY_DELAY_MS = 15_000;
const SAVE_EVERY = 25;

/** The parsed reply, or null when the service could not be reached: that title is retried next run. */
async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'BingeMate class project' } });
      if (res.status === 429) {
        await wait(BUSY_DELAY_MS);
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      return null;
    } catch {
      await wait(BUSY_DELAY_MS);
    }
  }
  return null;
}

/**
 * Looks up the TV shows and books the poster files miss, on TVmaze and Open Library, and saves what
 * it finds to data/raw/lookup_posters.csv for clean-posters.ts. It needs the network, so it is not
 * part of clean-all. Run clean-all first, then this, then clean-all again. A rerun skips every
 * title already answered, so it can be stopped and resumed; a title with no match is saved with an
 * empty poster_url so it is not asked for again.
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
    file: string,
    source: string,
    delayMs: number,
    find: (t: Row) => Promise<string | null | undefined>,
  ): Promise<void> => {
    const todo = readProcessed(file).filter((t) => !skip.has(t['title_id']));
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

  await lookUp('tv_shows.csv', 'tvmaze', TV_DELAY_MS, async (t) => {
    const name = t['name'] ?? '';
    const q = encodeURIComponent(tvSearchName(name));
    const results = await fetchJson<Parameters<typeof tvPosterFromSearch>[0]>(
      `https://api.tvmaze.com/search/shows?q=${q}`,
    );
    return results === null
      ? undefined
      : tvPosterFromSearch(results, name, toInt(t['release_year']));
  });

  await lookUp('books.csv', 'openlibrary', BOOK_DELAY_MS, async (t) => {
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
