import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// data/etl has no test runner and sits outside this package's rootDir, so it is imported at run time.
type ToRow = (t: Record<string, string>, titleId: string) => Record<string, unknown> | null;
const details = fileURLToPath(new URL('../../../../data/etl/lib/details.ts', import.meta.url));
const { bookDetailsRow, tvDetailsRow } = (await import(/* @vite-ignore */ details)) as {
  bookDetailsRow: ToRow;
  tvDetailsRow: ToRow;
};

describe('ETL details rows', () => {
  it('keeps a ratings count of 0', () => {
    expect(bookDetailsRow({ publisher: '', ratings_count: '0' }, 't1')).toEqual({
      titleId: 't1',
      publisher: null,
      ratingsCount: 0,
    });
  });

  it('keeps a score of 0', () => {
    expect(tvDetailsRow({ userscore: '0' }, 't1')?.userscore).toBe(0);
  });

  it('gives no row when every detail is blank', () => {
    expect(bookDetailsRow({ publisher: '', ratings_count: '' }, 't1')).toBeNull();
  });
});
