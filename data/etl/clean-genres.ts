import { cleanText, toInt } from './lib/clean.js';
import { readRaw, runIfMain, writeProcessed } from './lib/io.js';
import { StepLog } from './lib/log.js';

/** Genre names merged into one canonical name (compared case-insensitively). */
const ALIASES: Record<string, string> = { 'sci-fi': 'Science Fiction' };
/** Placeholder genres: the title keeps no genre rather than a meaningless one. */
const PLACEHOLDERS = new Set(['unknown']);
// Rare genres (mostly one-off book subject headings) are deliberately kept: the filter list is a
// query concern (a view with HAVING COUNT(*) >= N), not something to delete during cleaning.

export function main(): void {
  const log = new StepLog('clean-genres');
  const genres = readRaw('genres.csv');
  const links = readRaw('title_genres.csv');
  const mediaById = new Map(
    readRaw('titles.csv').map((t) => [t['title_id'] ?? '', t['media_type'] ?? '']),
  );
  log.count('genres in (raw)', genres.length);
  log.count('title_genres in (raw)', links.length);

  // Raw genre_id -> trimmed display name, plus how many titles and which media use it.
  const nameById = new Map<string, string>();
  for (const g of genres) {
    const name = cleanText(g['name']);
    if (name === null) log.reject('empty genre name', g);
    else nameById.set(g['genre_id'] ?? '', name);
  }
  const usage = new Map<string, { titles: number; media: Set<string> }>();
  for (const l of links) {
    const id = l['genre_id'] ?? '';
    const u = usage.get(id) ?? { titles: 0, media: new Set<string>() };
    u.titles++;
    u.media.add(mediaById.get(l['title_id'] ?? '') ?? '');
    usage.set(id, u);
  }

  // Group case-variants and aliases under one canonical name; the most-used spelling wins.
  const groups = new Map<string, { id: string; raw: string; name: string; titles: number }[]>();
  for (const [id, name] of nameById) {
    const key = (ALIASES[name.toLowerCase()] ?? name).toLowerCase();
    const list = groups.get(key) ?? [];
    list.push({
      id,
      raw: name,
      name: ALIASES[name.toLowerCase()] ?? name,
      titles: usage.get(id)?.titles ?? 0,
    });
    groups.set(key, list);
  }

  const canonicalIdByRawId = new Map<string, string>();
  const kept: { genre_id: number; name: string }[] = [];
  for (const [key, members] of groups) {
    const best = [...members].sort((a, b) => b.titles - a.titles || Number(a.id) - Number(b.id))[0];
    if (!best) continue;
    const total = members.reduce((n, m) => n + m.titles, 0);
    if (members.length > 1) {
      log.info(`merged ${members.map((m) => `"${m.raw}"(${m.id})`).join(' + ')} -> "${best.name}"`);
      log.bump('genre variants merged');
    }
    if (PLACEHOLDERS.has(key)) {
      log.reject('placeholder genre dropped', { genre: best.name, titles: total });
      continue;
    }
    kept.push({ genre_id: Number(best.id), name: best.name });
    for (const m of members) canonicalIdByRawId.set(m.id, best.id);
  }
  kept.sort((a, b) => a.genre_id - b.genre_id);

  const seen = new Set<string>();
  const outLinks: { title_id: number; genre_id: number }[] = [];
  const titlesWithGenre = new Set<string>();
  for (const l of links) {
    const titleId = toInt(l['title_id']);
    const canonical = canonicalIdByRawId.get(l['genre_id'] ?? '');
    if (titleId === null || canonical === undefined) {
      log.bump('title_genres link dropped with its genre');
      continue;
    }
    const key = `${titleId}|${canonical}`;
    if (seen.has(key)) {
      log.bump('title_genres duplicate collapsed after merge');
      continue;
    }
    seen.add(key);
    outLinks.push({ title_id: titleId, genre_id: Number(canonical) });
    titlesWithGenre.add(String(titleId));
  }

  const without = [...mediaById.keys()].filter((id) => !titlesWithGenre.has(id));
  const byMedia = new Map<string, number>();
  for (const id of without)
    byMedia.set(mediaById.get(id) ?? '?', (byMedia.get(mediaById.get(id) ?? '?') ?? 0) + 1);
  if (without.length > 0) {
    log.warn(
      `${without.length} titles have no genre left (${[...byMedia].map(([m, n]) => `${m}: ${n}`).join(', ')})`,
    );
  }

  writeProcessed('genres.csv', ['genre_id', 'name'], kept);
  writeProcessed('title_genres.csv', ['title_id', 'genre_id'], outLinks);
  log.count('genres out', kept.length);
  log.count('title_genres out', outLinks.length);
  log.count('titles without any genre', without.length);
  log.finish();
}

runIfMain(import.meta.url, main);
