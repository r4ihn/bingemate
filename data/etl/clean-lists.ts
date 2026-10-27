import { toInt } from './lib/clean.js';
import { readProcessed, readRaw, runIfMain, writeProcessed } from './lib/io.js';
import { StepLog } from './lib/log.js';

/**
 * user_lists.csv has no status. Every entry in this dataset is a title the user also reviewed, so
 * reviewed entries become COMPLETED; an entry without a review would become PLAN_TO. Run after
 * clean-reviews so the check uses the reviews that survived de-duplication.
 */
export function main(): void {
  const log = new StepLog('clean-lists');
  const raw = readRaw('user_lists.csv');
  const userIds = new Set(readRaw('users.csv').map((u) => u['user_id']));
  const titleIds = new Set(readRaw('titles.csv').map((t) => t['title_id']));
  const reviewed = new Set(
    readProcessed('reviews.csv').map((r) => `${r['user_id']}|${r['title_id']}`),
  );
  log.count('list entries in (raw)', raw.length);

  const seen = new Set<string>();
  const out: { user_id: number; title_id: number; status: string }[] = [];
  for (const r of raw) {
    const userId = toInt(r['user_id']);
    const titleId = toInt(r['title_id']);
    if (userId === null || titleId === null) {
      log.reject('bad id', r);
      continue;
    }
    if (!userIds.has(String(userId)) || !titleIds.has(String(titleId))) {
      log.reject('user or title not found', r);
      continue;
    }
    const key = `${userId}|${titleId}`;
    if (seen.has(key)) {
      log.reject('duplicate (user, title) entry', r);
      continue;
    }
    seen.add(key);
    const status = reviewed.has(key) ? 'COMPLETED' : 'PLAN_TO';
    log.bump(`status ${status} (derived)`);
    out.push({ user_id: userId, title_id: titleId, status });
  }

  log.warn('status is DERIVED, not in the dataset: reviewed -> COMPLETED, otherwise PLAN_TO');
  writeProcessed('user_lists.csv', ['user_id', 'title_id', 'status'], out);
  log.count('list entries out', out.length);
  log.finish();
}

runIfMain(import.meta.url, main);
