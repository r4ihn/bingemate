import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCsv, toCsv, type Row } from './csv.js';

export const RAW_DIR = fileURLToPath(new URL('../../raw/', import.meta.url));
export const PROCESSED_DIR = fileURLToPath(new URL('../../processed/', import.meta.url));
export const LOG_DIR = `${PROCESSED_DIR}logs/`;

export function readRaw(name: string): Row[] {
  return parseCsv(readFileSync(RAW_DIR + name, 'utf8'));
}

export function readProcessed(name: string): Row[] {
  return parseCsv(readFileSync(PROCESSED_DIR + name, 'utf8'));
}

export function writeProcessed(
  name: string,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): void {
  mkdirSync(PROCESSED_DIR, { recursive: true });
  writeFileSync(PROCESSED_DIR + name, toCsv(columns, rows));
}

export function readJsonLines<T>(name: string): T[] {
  return readFileSync(RAW_DIR + name, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

export function writeJsonLines(name: string, rows: readonly unknown[]): void {
  mkdirSync(PROCESSED_DIR, { recursive: true });
  writeFileSync(PROCESSED_DIR + name, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

/** Run `main` only when this file is the entry point, so clean-all.ts can import the steps. */
export function runIfMain(metaUrl: string, main: () => void): void {
  const entry = process.argv[1];
  if (entry && metaUrl === pathToFileURL(entry).href) main();
}
