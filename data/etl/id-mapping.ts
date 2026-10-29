import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PROCESSED_DIR } from './lib/io.js';

/** Dataset id (as a string) -> database id, per entity. */
export type IdMap = {
  users: Record<string, string>;
  titles: Record<string, string>;
  genres: Record<string, string>;
  people: Record<string, string>;
  reviews: Record<string, string>;
};

const FILE = `${PROCESSED_DIR}id-map.json`;

export const newId = (): string => randomUUID();

export function emptyIdMap(): IdMap {
  return { users: {}, titles: {}, genres: {}, people: {}, reviews: {} };
}

export function saveIdMap(map: IdMap): void {
  writeFileSync(FILE, JSON.stringify(map) + '\n');
}

/** Written by load-postgres.ts; load-mongo-reviews.ts needs it so Mongo _id === Postgres reviews.id. */
export function loadIdMap(): IdMap {
  return JSON.parse(readFileSync(FILE, 'utf8')) as IdMap;
}

export function lookup(
  map: Record<string, string>,
  datasetId: string | undefined,
  what: string,
): string {
  const id = datasetId === undefined ? undefined : map[datasetId];
  if (id === undefined) throw new Error(`No database id for ${what} ${String(datasetId)}`);
  return id;
}
