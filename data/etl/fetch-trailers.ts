import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import { toInt } from './lib/clean.js';
import { toCsv, type Row } from './lib/csv.js';
import { RAW_DIR, readProcessed, readRaw, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';
import { movieSearchName, tmdbMatch, tvSearchName } from './lib/posters.js';
import { TMDB_DELAY_MS, tmdbFromEnv, tmdbSearch, tmdbVideos } from './lib/tmdb.js';
import { pickTrailer } from './lib/trailers.js';

export const TRAILER_LOOKUP = 'lookup_trailers.csv';
const COLUMNS = ['title_id', 'name', 'tmdb_id', 'youtube_key'] as const;
const SAVE_EVERY = 25;

/**
 * Finds a YouTube trailer for every movie and TV show on TMDB and saves it to
 * data/raw/lookup_trailers.csv for clean-trailers.ts. The title is matched with the same rules as the
 * posters (name, and the year or one either side); a TV special listed as a movie on TMDB is found
 * through the movie search.
 *
 *   npx tsx --env-file=apps/api/.env data/etl/fetch-trailers.ts
 *
 * It needs the network and TMDB_API_KEY, so it is not part of clean-all. It can be stopped and
 * resumed; a title TMDB has no trailer for is saved with an empty youtube_key and not asked again.
 * The key is only sent to TMDB: it is never logged or written to a file.
 */
export async function main(): Promise<void> {
  const log = new StepLog('fetch-trailers');
  const tmdb = await tmdbFromEnv();
  if ('problem' in tmdb) {
    log.warn(`${tmdb.problem}: no trailers looked up`);
    log.finish();
    process.exitCode = 1;
    return;
  }
  const { auth } = tmdb;
  const saved: Row[] = existsSync(RAW_DIR + TRAILER_LOOKUP) ? readRaw(TRAILER_LOOKUP) : [];
  const asked = new Set(saved.map((r) => r['title_id']));
  const save = () => writeFileSync(RAW_DIR + TRAILER_LOOKUP, toCsv(COLUMNS, saved));

  /** The TMDB id and videos of the matching title, trying each (kind, name) in turn. */
  const find = async (
    tries: ['movie' | 'tv', string][],
    year: number | null,
  ): Promise<{ id: number; kind: 'movie' | 'tv'; key: string | null } | null | undefined> => {
    for (const [kind, name] of tries) {
      const results = await tmdbSearch(kind, name, auth);
      await wait(TMDB_DELAY_MS);
      if (results === undefined) return undefined;
      const hit = tmdbMatch(results, name, year, false);
      if (!hit) continue;
      const videos = await tmdbVideos(kind, hit.id, auth);
      await wait(TMDB_DELAY_MS);
      if (videos === undefined) return undefined;
      return { id: hit.id, kind, key: pickTrailer(videos) };
    }
    return null;
  };

  const run = async (file: string, kind: 'movie' | 'tv', label: string) => {
    const todo = readProcessed(file).filter((t) => !asked.has(t['title_id']));
    log.count(`${label} to look up`, todo.length);
    let found = 0;
    for (const [i, t] of todo.entries()) {
      const raw = t['name'] ?? '';
      const unique = <T>(xs: T[]) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()];
      const tries: ['movie' | 'tv', string][] = unique(
        kind === 'tv'
          ? [
              ['tv', tvSearchName(raw)],
              ['movie', tvSearchName(raw)],
            ]
          : [
              ['movie', raw],
              ['movie', movieSearchName(raw)],
            ],
      );
      const hit = await find(tries, toInt(t['release_year']));
      if (hit === undefined) {
        log.bump(`${label} lookups that failed (retried next run)`);
        continue;
      }
      if (hit?.key) found++;
      saved.push({
        title_id: t['title_id'] ?? '',
        name: raw,
        tmdb_id: hit ? `${hit.kind}/${hit.id}` : '',
        youtube_key: hit?.key ?? '',
      });
      if ((i + 1) % SAVE_EVERY === 0) {
        save();
        log.info(`${label}: ${i + 1} of ${todo.length}, ${found} trailers`);
      }
    }
    save();
    log.count(`${label} trailers found`, found);
  };

  await run('movies.csv', 'movie', 'movies');
  await run('tv_shows.csv', 'tv', 'TV shows');
  log.finish();
}

runIfMain(import.meta.url, main);
