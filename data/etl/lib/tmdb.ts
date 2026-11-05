import { setTimeout as wait } from 'node:timers/promises';
import { tmdbAuth, type TmdbResult } from './posters.js';

/** Network helpers shared by fetch-posters.ts and fetch-trailers.ts. The key is never logged. */

const BUSY_DELAY_MS = 15_000;
export const TMDB_DELAY_MS = 250; // well under TMDB's limit of about 50 calls a second
const USER_AGENT = 'BingeMate class project';

/** The parsed reply, or null when the service could not be reached: that title is retried next run. */
export async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
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

export type TmdbAuth = ReturnType<typeof tmdbAuth>;

/** TMDB_API_KEY from the environment, checked with one cheap call; a reason when it cannot be used. */
export async function tmdbFromEnv(): Promise<{ auth: TmdbAuth } | { problem: string }> {
  const key = process.env['TMDB_API_KEY']?.trim();
  if (!key) return { problem: 'TMDB_API_KEY is not set (pass --env-file=apps/api/.env)' };
  const auth = tmdbAuth(key);
  const res = await fetch(`https://api.themoviedb.org/3/configuration?${auth.query.slice(1)}`, {
    headers: { 'User-Agent': USER_AGENT, ...auth.headers },
  });
  await res.body?.cancel();
  return res.status === 401
    ? { problem: 'TMDB refused TMDB_API_KEY (401): check the key' }
    : { auth };
}

/**
 * TMDB search results for a movie or a TV show, in the movie shape (a show's `name` and
 * `first_air_date` become `title` and `release_date`), or undefined when TMDB could not be reached.
 */
export async function tmdbSearch(
  kind: 'movie' | 'tv',
  name: string,
  auth: TmdbAuth,
): Promise<TmdbResult[] | undefined> {
  type Raw = TmdbResult & { name?: string; original_name?: string; first_air_date?: string };
  const reply = await fetchJson<{ results: Raw[] }>(
    `https://api.themoviedb.org/3/search/${kind}?include_adult=false&query=${encodeURIComponent(name)}${auth.query}`,
    auth.headers,
  );
  if (reply === null) return undefined;
  return reply.results.map((r) =>
    kind === 'tv'
      ? {
          id: r.id,
          title: r.name ?? '',
          original_title: r.original_name ?? '',
          release_date: r.first_air_date ?? '',
          poster_path: r.poster_path,
        }
      : r,
  );
}

export type TmdbVideo = {
  site: string;
  type: string;
  key: string;
  official?: boolean;
  iso_639_1?: string;
};

/** The videos TMDB lists for a movie or show, or undefined when TMDB could not be reached. */
export async function tmdbVideos(
  kind: 'movie' | 'tv',
  id: number,
  auth: TmdbAuth,
): Promise<TmdbVideo[] | undefined> {
  const reply = await fetchJson<{ results: TmdbVideo[] }>(
    `https://api.themoviedb.org/3/${kind}/${id}/videos?language=en-US${auth.query}`,
    auth.headers,
  );
  return reply === null ? undefined : reply.results;
}
