import { readFileSync } from 'node:fs';
import type { Row } from './lib/csv.js';
import { PROCESSED_DIR, readProcessed, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';

/**
 * Second pair of eyes on the outputs. It re-reads only data/processed/ (not the cleaners'
 * code) and checks the constraints the PostgreSQL schema and MongoDB loaders will rely on.
 * Exits non-zero if anything fails.
 */
export function main(): void {
  const log = new StepLog('verify');
  let failures = 0;
  const check = (name: string, ok: boolean, detail = ''): void => {
    if (ok) log.info(`PASS ${name}`);
    else {
      failures++;
      log.warn(`FAIL ${name}${detail ? `: ${detail}` : ''}`);
    }
  };
  const unique = (rows: Row[], key: (r: Row) => string): boolean =>
    new Set(rows.map(key)).size === rows.length;

  const movies = readProcessed('movies.csv');
  const tv = readProcessed('tv_shows.csv');
  const books = readProcessed('books.csv');
  const titles = [...movies, ...tv, ...books];
  const titleIds = new Set(titles.map((t) => t['title_id']));
  const genres = readProcessed('genres.csv');
  const titleGenres = readProcessed('title_genres.csv');
  const people = readProcessed('people.csv');
  const titlePeople = readProcessed('title_people.csv');
  const users = readProcessed('users.csv');
  const reviews = readProcessed('reviews.csv');
  const lists = readProcessed('user_lists.csv');
  const bodies = readFileSync(PROCESSED_DIR + 'review_bodies.jsonl', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { review_id: number; media_type: string; text: string });

  // Titles
  check(
    'title_id unique across all media',
    unique(titles, (t) => t['title_id'] ?? ''),
  );
  check(
    'media types match their file',
    movies.every((t) => t['media_type'] === 'MOVIE') &&
      tv.every((t) => t['media_type'] === 'TV_SHOW') &&
      books.every((t) => t['media_type'] === 'BOOK'),
  );
  check(
    'every title has a trimmed, non-empty name',
    titles.every((t) => t['name'] !== '' && t['name'] === t['name']?.trim()),
  );
  check(
    'no title has created_by (imported = NULL)',
    titles.every((t) => t['created_by'] === ''),
  );
  check(
    'release_year is empty or between 1000 and next year',
    titles.every((t) => {
      const y = Number(t['release_year']);
      return t['release_year'] === '' || (y >= 1000 && y <= new Date().getFullYear() + 1);
    }),
  );

  // Genres
  check(
    'genre_id unique',
    unique(genres, (g) => g['genre_id'] ?? ''),
  );
  check(
    'genre names unique ignoring case',
    unique(genres, (g) => (g['name'] ?? '').toLowerCase()),
  );
  const genreIds = new Set(genres.map((g) => g['genre_id']));
  check(
    'title_genres reference real titles and genres',
    titleGenres.every((l) => titleIds.has(l['title_id']) && genreIds.has(l['genre_id'])),
  );
  check(
    'title_genres has no duplicate pair',
    unique(titleGenres, (l) => `${l['title_id']}|${l['genre_id']}`),
  );
  check(
    'every genre is used by a title',
    genres.every((g) => titleGenres.some((l) => l['genre_id'] === g['genre_id'])),
  );

  // People
  const personIds = new Set(people.map((p) => p['person_id']));
  check(
    'person_id unique',
    unique(people, (p) => p['person_id'] ?? ''),
  );
  check(
    'title_people reference real titles and people',
    titlePeople.every((l) => titleIds.has(l['title_id']) && personIds.has(l['person_id'])),
  );
  check(
    'title_people has no duplicate (title, person, role)',
    unique(titlePeople, (l) => `${l['title_id']}|${l['person_id']}|${l['role']}`),
  );
  check(
    'title_people roles are upper-case enum values',
    titlePeople.every((l) => /^(AUTHOR|DIRECTOR|ACTOR|SHOWRUNNER|WRITER)$/.test(l['role'] ?? '')),
  );

  // Users
  const userIds = new Set(users.map((u) => u['user_id']));
  check(
    'user_id and email unique',
    unique(users, (u) => u['user_id'] ?? '') && unique(users, (u) => u['email'] ?? ''),
  );
  check(
    'exactly one ADMIN and one CREATOR in the dataset',
    users.filter((u) => u['role'] === 'ADMIN').length === 1 &&
      users.filter((u) => u['role'] === 'CREATOR').length === 1,
  );

  // Reviews: Postgres headers vs Mongo bodies
  check(
    'review_id unique',
    unique(reviews, (r) => r['review_id'] ?? ''),
  );
  check(
    'rating is a whole number 1..5',
    reviews.every((r) => /^[1-5]$/.test(r['rating'] ?? '')),
  );
  check(
    'one review per (user, title)',
    unique(reviews, (r) => `${r['user_id']}|${r['title_id']}`),
  );
  check(
    'reviews reference real users and titles',
    reviews.every((r) => userIds.has(r['user_id']) && titleIds.has(r['title_id'])),
  );
  check(
    'created_at is empty or YYYY-MM-DD',
    reviews.every(
      (r) => r['created_at'] === '' || /^\d{4}-\d{2}-\d{2}$/.test(r['created_at'] ?? ''),
    ),
  );
  const headerIds = new Set(reviews.map((r) => r['review_id']));
  const bodyIds = new Set(bodies.map((b) => String(b.review_id)));
  check(
    'Mongo bodies and Postgres headers have exactly the same ids',
    headerIds.size === bodyIds.size &&
      [...headerIds].every((id) => id !== undefined && bodyIds.has(id)),
  );
  check(
    'every body has non-empty text and a known media type',
    bodies.every((b) => b.text.length > 0 && /^(MOVIE|TV_SHOW|BOOK)$/.test(b.media_type)),
  );
  const mediaOf = new Map(titles.map((t) => [t['title_id'], t['media_type']]));
  check(
    'body media type matches its title',
    reviews.every(
      (r) =>
        bodies.find((b) => String(b.review_id) === r['review_id'])?.media_type ===
        mediaOf.get(r['title_id']),
    ),
  );

  // Lists
  check(
    'lists reference real users and titles',
    lists.every((l) => userIds.has(l['user_id']) && titleIds.has(l['title_id'])),
  );
  check(
    'one list entry per (user, title)',
    unique(lists, (l) => `${l['user_id']}|${l['title_id']}`),
  );
  check(
    'list status is a ListStatus value',
    lists.every((l) => /^(COMPLETED|IN_PROGRESS|PLAN_TO)$/.test(l['status'] ?? '')),
  );

  log.count('checks failed', failures);
  log.finish();
  if (failures > 0) process.exitCode = 1;
}

runIfMain(import.meta.url, main);
