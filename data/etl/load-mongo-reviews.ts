import mongoose from 'mongoose';
import { ReviewBody } from '../../apps/api/src/mongo/models/reviewBody.model.js';
import { loadIdMap, lookup } from './id-mapping.js';
import { reviewCreatedAt } from './lib/dates.js';
import { assertLocalDatabases, loadApiEnv } from './lib/env.js';
import { PROCESSED_DIR, readJsonLines, readProcessed, runIfMain } from './lib/io.js';
import { StepLog } from './lib/log.js';

const BATCH = 1000;

type Body = {
  review_id: number;
  media_type: string;
  text: string;
  details: Record<string, unknown>;
};

/**
 * Loads review_bodies.jsonl into MongoDB with _id === the PostgreSQL reviews.id (via id-map.json,
 * written by load-postgres.ts, so run that first). Refuses to run on a non-empty collection
 * unless --reset is given.
 */
export async function main(): Promise<void> {
  loadApiEnv();
  const log = new StepLog('load-mongo-reviews');
  const reset = process.argv.includes('--reset');

  try {
    assertLocalDatabases();
    const uri = process.env['MONGO_URI'];
    if (!uri) throw new Error('MONGO_URI is not set (apps/api/.env)');
    await mongoose.connect(uri);

    const existing = await ReviewBody.countDocuments();
    if (existing > 0 && !reset) {
      throw new Error(
        `reviewbodies already has ${existing} documents. Re-run with --reset to wipe it.`,
      );
    }
    if (reset) {
      await ReviewBody.deleteMany({});
      log.info('emptied reviewbodies (--reset)');
    }

    const ids = loadIdMap();
    const headers = new Map(readProcessed('reviews.csv').map((r) => [r['review_id'] ?? '', r]));
    const bodies = readJsonLines<Body>('review_bodies.jsonl', PROCESSED_DIR);
    log.count('bodies in', bodies.length);

    let inserted = 0;
    for (let i = 0; i < bodies.length; i += BATCH) {
      const docs = bodies.slice(i, i + BATCH).map((b) => {
        const header = headers.get(String(b.review_id));
        if (!header) throw new Error(`No Postgres header for review ${b.review_id}`);
        const doc: Record<string, unknown> = {
          _id: lookup(ids.reviews, String(b.review_id), 'review'),
          titleId: lookup(ids.titles, header['title_id'], 'title'),
          userId: lookup(ids.users, header['user_id'], 'user'),
          mediaType: b.media_type,
          body: b.text,
          details: b.details,
        };
        // Same date as the Postgres header, including the fixed date for undated reviews.
        doc['createdAt'] = reviewCreatedAt(header['created_at']);
        return doc;
      });
      inserted += (await ReviewBody.insertMany(docs)).length;
    }
    if (inserted !== bodies.length) throw new Error(`inserted ${inserted} of ${bodies.length}`);
    log.count('review bodies inserted', inserted);
    log.finish();
  } catch (err) {
    log.warn(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    log.finish();
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runIfMain(import.meta.url, () => void main());
