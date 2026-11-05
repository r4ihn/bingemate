import { existsSync } from 'node:fs';
import { TRAILER_LOOKUP } from './fetch-trailers.js';
import { RAW_DIR, readProcessed, readRaw, runIfMain, writeProcessed } from './lib/io.js';
import { StepLog } from './lib/log.js';
import { YOUTUBE_KEY } from './lib/trailers.js';

export const TRAILER_COLUMNS = ['title_id', 'youtube_key'] as const;

/**
 * Writes title_id -> YouTube trailer id for the movies and TV shows fetch-trailers.ts found one for.
 * The lookup file is optional: without it the step writes an empty file and no title has a trailer.
 * A key that is not a YouTube id, or a title that is no longer in the dataset, is dropped.
 */
export function main(): void {
  const log = new StepLog('clean-trailers');
  const titles = new Set(
    [...readProcessed('movies.csv'), ...readProcessed('tv_shows.csv')].map((t) => t['title_id']),
  );
  if (!existsSync(RAW_DIR + TRAILER_LOOKUP)) {
    log.warn(`no ${TRAILER_LOOKUP} in data/raw (run fetch-trailers.ts): no trailers added`);
    writeProcessed('title_trailers.csv', TRAILER_COLUMNS, []);
    log.finish();
    return;
  }

  const out = new Map<string, string>();
  for (const r of readRaw(TRAILER_LOOKUP)) {
    const id = r['title_id'] ?? '';
    const key = (r['youtube_key'] ?? '').trim();
    if (key === '') continue;
    if (!titles.has(id)) log.reject('title not in the dataset', { title_id: id, youtube_key: key });
    else if (!YOUTUBE_KEY.test(key))
      log.reject('not a YouTube id', { title_id: id, youtube_key: key });
    else if (!out.has(id)) out.set(id, key);
  }
  log.count('titles with a trailer', out.size);
  log.count('movies and TV shows without one', titles.size - out.size);
  writeProcessed(
    'title_trailers.csv',
    TRAILER_COLUMNS,
    [...out].map(([title_id, youtube_key]) => ({ title_id, youtube_key })),
  );
  log.finish();
}

runIfMain(import.meta.url, main);
