import { cleanText, toInt } from './lib/clean.js';
import { readRaw, runIfMain, writeProcessed } from './lib/io.js';
import { StepLog } from './lib/log.js';

// The two dataset accounts map onto the seed.ts logins so one set of credentials works everywhere.
const EMAIL_OVERRIDES: Record<string, string> = {
  admin: 'admin@bingemate.dev',
  demo_creator: 'creator@bingemate.dev',
};

const ROLE_BY_ID: Record<string, string> = { '1': 'CONSUMER', '2': 'CREATOR', '3': 'ADMIN' };

export function main(): void {
  const log = new StepLog('clean-users');
  const users = readRaw('users.csv');
  log.count('users in (raw)', users.length);

  const seenIds = new Set<number>();
  const seenNames = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const u of users) {
    const id = toInt(u['user_id']);
    const username = cleanText(u['username']);
    const role = ROLE_BY_ID[u['role_id'] ?? ''];
    if (id === null || seenIds.has(id) || username === null || role === undefined) {
      log.reject('bad id, duplicate id, empty username or unknown role_id', u);
      continue;
    }
    if (username !== u['username']) log.bump('username whitespace fixed');
    seenIds.add(id);
    // Usernames are display names (reviewers' real names), so repeats are legal; just note them.
    const lower = username.toLowerCase();
    if (seenNames.has(lower)) log.bump('username repeats an earlier one (kept)');
    seenNames.add(lower);
    out.push({
      user_id: id,
      username,
      role,
      email: EMAIL_OVERRIDES[username] ?? `user${id}@seed.bingemate.local`,
    });
  }

  log.warn(
    'email is a PLACEHOLDER (user<id>@seed.bingemate.local): the dataset has no emails. ' +
      'The loader must set passwordHash itself, and schema.prisma User has no username column.',
  );
  writeProcessed('users.csv', ['user_id', 'username', 'role', 'email'], out);
  log.count('users out', out.length);
  log.finish();
}

runIfMain(import.meta.url, main);
