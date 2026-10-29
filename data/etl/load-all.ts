import mongoose from 'mongoose';
import { ReviewBody } from '../../apps/api/src/mongo/models/reviewBody.model.js';
import { assertLocalDatabases, loadApiEnv } from './lib/env.js';
import { runIfMain } from './lib/io.js';
import { main as loadMongoReviews } from './load-mongo-reviews.js';
import { main as loadPostgres } from './load-postgres.js';

/** Fails before anything is written if the Mongo load is going to be refused afterwards. */
async function checkMongoReady(): Promise<void> {
  assertLocalDatabases();
  const uri = process.env['MONGO_URI'];
  if (!uri) throw new Error('MONGO_URI is not set (apps/api/.env)');
  await mongoose.connect(uri);
  try {
    const existing = await ReviewBody.countDocuments();
    if (existing > 0 && !process.argv.includes('--reset')) {
      throw new Error(
        `reviewbodies already has ${existing} documents. Re-run with --reset to wipe it.`,
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

/**
 * Loads both stores in order. Ids are random per run and the Mongo review bodies are keyed by the
 * PostgreSQL review ids, so the two must always be loaded (and reset) together. Takes the same
 * flags as the loaders (--reset, --allow-remote), which both read from process.argv.
 */
export async function main(): Promise<void> {
  loadApiEnv();
  try {
    await checkMongoReady();
  } catch (err) {
    console.error(`load-all: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }
  await loadPostgres();
  if (process.exitCode) return; // nothing was committed, so leave Mongo alone
  await loadMongoReviews();
}

runIfMain(import.meta.url, () => void main());
