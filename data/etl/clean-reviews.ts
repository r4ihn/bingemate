import { cleanMultiline, cleanText, toInt, toIsoDate, toNumber, toStars } from './lib/clean.js';
import {
  readJsonLines,
  readProcessed,
  readProcessedTitles,
  readRaw,
  runIfMain,
  writeJsonLines,
  writeProcessed,
} from './lib/io.js';
import { StepLog } from './lib/log.js';

type RawBody = {
  review_id: number;
  title_id: number;
  user_id: number;
  media_type: string;
  text: string | null;
  details: Record<string, unknown> | null;
};

type Header = {
  review_id: number;
  user_id: number;
  title_id: number;
  original_score: number;
  rating: number;
  created_at: string | null;
};

/**
 * Splits the review dataset into the two stores (TASKS.md section 0, option B):
 * reviews.csv is the PostgreSQL header row (rating 1..5), review_bodies.jsonl is the MongoDB body
 * keyed by the same review_id. The two files always contain exactly the same review ids.
 */
export function main(): void {
  const log = new StepLog('clean-reviews');
  const raw = readRaw('reviews.csv');
  const bodies = new Map(readJsonLines<RawBody>('reviews_mongo.json').map((b) => [b.review_id, b]));
  // Ids come from the cleaned output, so a title or user dropped upstream orphans its reviews here.
  const titleIds = new Set(readProcessedTitles().map((t) => t['title_id']));
  const userIds = new Set(readProcessed('users.csv').map((u) => u['user_id']));
  log.count('reviews in (raw csv)', raw.length);
  log.count('review bodies in (raw json)', bodies.size);

  const headers: Header[] = [];
  const seenIds = new Set<number>();
  for (const r of raw) {
    const id = toInt(r['review_id']);
    const userId = toInt(r['user_id']);
    const titleId = toInt(r['title_id']);
    const score = toNumber(r['score']);
    if (id === null || userId === null || titleId === null) {
      log.reject('bad id', r);
      continue;
    }
    if (seenIds.has(id)) {
      log.reject('duplicate review_id', r);
      continue;
    }
    seenIds.add(id);
    if (!userIds.has(String(userId)) || !titleIds.has(String(titleId))) {
      log.reject('user or title not found', r);
      continue;
    }
    if (score === null || score < 0 || score > 10) {
      log.reject('score missing or outside 0..10', r);
      continue;
    }
    if (!bodies.has(id)) {
      log.reject('no matching MongoDB body', r);
      continue;
    }
    if (score === 0) log.bump('score 0 mapped to 1 star');
    const date = toIsoDate(r['review_date']);
    if (date === null)
      log.bump('review_date missing or invalid (left blank, loaders use the fixed undated date)');
    headers.push({
      review_id: id,
      user_id: userId,
      title_id: titleId,
      original_score: score,
      rating: toStars(score),
      created_at: date,
    });
  }

  // One review per (user, title): keep the newest by date (undated counts as oldest), then highest id.
  const winner = new Map<string, Header>();
  for (const h of headers) {
    const key = `${h.user_id}|${h.title_id}`;
    const current = winner.get(key);
    if (!current || isNewer(h, current)) winner.set(key, h);
  }
  const kept = headers.filter((h) => winner.get(`${h.user_id}|${h.title_id}`) === h);
  const keptIds = new Set(kept.map((h) => h.review_id));
  for (const h of headers) {
    if (!keptIds.has(h.review_id)) {
      log.reject('duplicate (user, title) review, older one dropped', {
        review_id: h.review_id,
        user_id: h.user_id,
        title_id: h.title_id,
        score: h.original_score,
        review_date: h.created_at,
      });
    }
  }
  kept.sort((a, b) => a.review_id - b.review_id);

  const outBodies: Record<string, unknown>[] = [];
  const finalHeaders: Header[] = [];
  for (const h of kept) {
    const b = bodies.get(h.review_id);
    if (!b) continue;
    if (b.user_id !== h.user_id || b.title_id !== h.title_id) {
      log.reject('MongoDB body points at a different user or title', { review_id: h.review_id });
      continue;
    }
    const text = cleanMultiline(b.text);
    if (text === null) {
      log.reject('empty review text', { review_id: h.review_id });
      continue;
    }
    if (text !== b.text) log.bump('review text whitespace normalised');
    // Rating, username and title name are dropped from the body: the rating lives in PostgreSQL
    // and the others are derivable by join. `details` keeps the media-specific fields.
    outBodies.push({
      review_id: h.review_id,
      media_type: mediaFor(b.media_type),
      text,
      details: cleanDetails(b.details),
      comments: [],
    });
    finalHeaders.push(h);
  }

  const dist = [1, 2, 3, 4, 5].map(
    (s) => `${s}★=${finalHeaders.filter((h) => h.rating === s).length}`,
  );
  log.info(`rating distribution: ${dist.join(' ')}`);

  writeProcessed(
    'reviews.csv',
    ['review_id', 'user_id', 'title_id', 'rating', 'original_score', 'created_at'],
    finalHeaders,
  );
  writeJsonLines('review_bodies.jsonl', outBodies);
  log.count('reviews out (postgres headers)', finalHeaders.length);
  log.count('review bodies out (mongo)', outBodies.length);
  log.finish();
}

function isNewer(a: Header, b: Header): boolean {
  const da = a.created_at ?? '';
  const db = b.created_at ?? '';
  return da !== db ? da > db : a.review_id > b.review_id;
}

function mediaFor(raw: string): string {
  return raw === 'tv' ? 'TV_SHOW' : raw.toUpperCase();
}

/** Trim string values in the media-specific details and turn blanks into null. */
function cleanDetails(details: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details ?? {})) {
    out[k] = typeof v === 'string' ? cleanText(v) : (v ?? null);
  }
  return out;
}

runIfMain(import.meta.url, main);
