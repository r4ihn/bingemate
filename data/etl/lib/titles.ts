import { cleanText, toInt, toNumber } from './clean.js';
import type { Row } from './csv.js';
import { readRaw, writeProcessed } from './io.js';
import { StepLog } from './log.js';

type DetailColumn = {
  name: string;
  kind: 'int' | 'number' | 'text';
  /** Values outside [min, max] are blanked and logged. */
  min?: number;
  max?: number;
};

type MediaSpec = {
  step: string;
  /** Value in raw titles.csv `media_type`. */
  rawType: string;
  /** Prisma `MediaType` value written to the output. */
  mediaType: 'MOVIE' | 'TV_SHOW' | 'BOOK';
  detailsFile: string;
  details: DetailColumn[];
  outFile: string;
};

// Books go far back (the dataset has an original 1661 edition), so the floor is generous.
const MIN_YEAR = 1000;
const MAX_YEAR = new Date().getFullYear() + 1;

export const TITLE_COLUMNS = [
  'title_id',
  'media_type',
  'name',
  'release_year',
  'description',
  'created_by',
] as const;

/**
 * Cleans one media type: the core `titles.csv` rows plus that type's `*_details.csv`,
 * joined on title_id. Core columns map onto `Title`; detail columns have no Postgres home
 * yet and are kept for the loader to put in MongoDB or drop.
 */
export function cleanMediaTitles(spec: MediaSpec): void {
  const log = new StepLog(spec.step);
  const rawTitles = readRaw('titles.csv').filter((r) => r['media_type'] === spec.rawType);
  const rawDetails = readRaw(spec.detailsFile);
  log.count('titles in (raw)', rawTitles.length);
  log.count('detail rows in (raw)', rawDetails.length);

  const detailsById = new Map<string, Row>();
  for (const d of rawDetails) {
    const detailId = toInt(d['title_id']);
    if (detailId === null) {
      log.reject('detail row with a bad title_id', d);
      continue;
    }
    const id = String(detailId);
    if (detailsById.has(id)) log.reject('duplicate detail row (kept first)', d);
    else detailsById.set(id, d);
  }

  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];

  for (const raw of rawTitles) {
    const id = toInt(raw['title_id']);
    if (id === null || seen.has(String(id))) {
      log.reject('bad or duplicate title_id', raw);
      continue;
    }
    seen.add(String(id));

    const name = cleanText(raw['name']);
    if (name === null) {
      log.reject('empty name', raw);
      continue;
    }
    if (name !== raw['name']) log.bump('name whitespace fixed');

    let year = toInt(raw['release_year']);
    if (year === null) {
      log.bump('release_year missing (left null)');
    } else if (year < MIN_YEAR || year > MAX_YEAR) {
      log.reject(`release_year outside ${MIN_YEAR}..${MAX_YEAR} (blanked)`, raw);
      year = null;
    }

    const description = cleanText(raw['description']);
    if (description === null) log.bump('description missing (left null)');

    const row: Record<string, unknown> = {
      title_id: id,
      media_type: spec.mediaType,
      name,
      release_year: year,
      description,
      created_by: toInt(raw['created_by']),
    };

    const detail = detailsById.get(String(id));
    if (!detail) log.bump('title without a details row');
    for (const col of spec.details) {
      row[col.name] = cleanDetail(col, detail?.[col.name], id, log);
    }
    out.push(row);
  }

  for (const id of detailsById.keys()) {
    if (!seen.has(id)) log.warn(`details row for unknown ${spec.rawType} title_id ${id}`);
  }

  // Same name + year inside one media type would be a duplicate catalogue entry.
  const keys = new Map<string, number>();
  for (const r of out) {
    const key = `${String(r['name']).toLowerCase()}|${String(r['release_year'])}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  const dupes = [...keys.values()].filter((n) => n > 1).length;
  if (dupes > 0) log.warn(`${dupes} name+year pairs appear more than once; review by hand`);

  writeProcessed(spec.outFile, [...TITLE_COLUMNS, ...spec.details.map((d) => d.name)], out);
  log.count('titles out', out.length);
  log.finish();
}

function cleanDetail(
  col: DetailColumn,
  value: string | undefined,
  titleId: number,
  log: StepLog,
): string | number | null {
  if (col.kind === 'text') return cleanText(value);
  const n = col.kind === 'int' ? toInt(value) : toNumber(value);
  if (n === null) {
    if (cleanText(value) !== null)
      log.reject(`${col.name} not numeric (blanked)`, { title_id: titleId, value });
    return null;
  }
  if ((col.min !== undefined && n < col.min) || (col.max !== undefined && n > col.max)) {
    log.reject(`${col.name} out of range (blanked)`, { title_id: titleId, value });
    return null;
  }
  return n;
}
