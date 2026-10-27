import { cleanText, toInt } from './lib/clean.js';
import { readRaw, runIfMain, writeProcessed } from './lib/io.js';
import { StepLog } from './lib/log.js';

/** Prisma `PersonRole`; WRITER was added to the schema for this dataset (2.8k rows). */
const ROLES = new Set(['AUTHOR', 'DIRECTOR', 'ACTOR', 'SHOWRUNNER', 'WRITER']);

export function main(): void {
  const log = new StepLog('clean-people');
  const people = readRaw('people.csv');
  const links = readRaw('title_people.csv');
  const titleIds = new Set(readRaw('titles.csv').map((t) => t['title_id']));
  log.count('people in (raw)', people.length);
  log.count('title_people in (raw)', links.length);

  // People are de-duplicated on a case- and accent-insensitive name; the lowest id survives.
  const survivorByKey = new Map<string, number>();
  const survivorByRawId = new Map<number, number>();
  const kept: { person_id: number; name: string }[] = [];
  for (const p of people) {
    const id = toInt(p['person_id']);
    const name = cleanText(p['name']);
    if (id === null || name === null) {
      log.reject('bad person id or empty name', p);
      continue;
    }
    if (name !== p['name']) log.bump('name whitespace fixed');
    const key = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const existing = survivorByKey.get(key);
    if (existing !== undefined) {
      survivorByRawId.set(id, existing);
      log.reject('duplicate person merged', { person_id: id, name, merged_into: existing });
      continue;
    }
    survivorByKey.set(key, id);
    survivorByRawId.set(id, id);
    kept.push({ person_id: id, name });
  }

  const seen = new Set<string>();
  const out: { title_id: number; person_id: number; role: string }[] = [];
  for (const l of links) {
    const titleId = toInt(l['title_id']);
    const rawPerson = toInt(l['person_id']);
    const role = cleanText(l['role'])?.toUpperCase() ?? '';
    const personId = rawPerson === null ? undefined : survivorByRawId.get(rawPerson);
    if (titleId === null || !titleIds.has(String(titleId)) || personId === undefined) {
      log.reject('title or person not found', l);
      continue;
    }
    if (!ROLES.has(role)) {
      log.reject('unknown role', l);
      continue;
    }
    const key = `${titleId}|${personId}|${role}`;
    if (seen.has(key)) {
      log.bump('title_people duplicate collapsed after merge');
      continue;
    }
    seen.add(key);
    out.push({ title_id: titleId, person_id: personId, role });
  }

  // Drop people who no longer appear on any title so the loader does not create orphans.
  const used = new Set(out.map((l) => l.person_id));
  const keptUsed = kept.filter((p) => used.has(p.person_id));
  if (keptUsed.length !== kept.length) {
    log.warn(`${kept.length - keptUsed.length} people have no title link and were dropped`);
  }

  if (!out.some((l) => l.role === 'SHOWRUNNER')) log.info('no SHOWRUNNER rows in the dataset');

  writeProcessed('people.csv', ['person_id', 'name'], keptUsed);
  writeProcessed('title_people.csv', ['title_id', 'person_id', 'role'], out);
  log.count('people out', keptUsed.length);
  log.count('title_people out', out.length);
  log.finish();
}

runIfMain(import.meta.url, main);
