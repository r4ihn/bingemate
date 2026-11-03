import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// ETL is outside this package's rootDir; importing it does not invoke main or connect to a DB.
const file = fileURLToPath(
  new URL('../../../../data/etl/backfill-undated-dates.ts', import.meta.url),
);
type Ids = Record<'users' | 'titles' | 'genres' | 'people' | 'reviews', Record<string, string>>;
const { planBackfill } = (await import(/* @vite-ignore */ file)) as {
  planBackfill: (rows: Record<string, string>[], ids: Ids) => { pgId: string; date: Date }[];
};
const ids: Ids = {
  users: {},
  titles: {},
  genres: {},
  people: {},
  reviews: { '123': 'pg-123', '456': 'pg-456' },
};

describe('undated review backfill plan', () => {
  it('includes only undated rows and maps dataset ids to PostgreSQL ids', () => {
    const plan = planBackfill(
      [
        { review_id: '123', created_at: '' },
        { review_id: 'unmapped-dated-review', created_at: '2020-06-01' },
        { review_id: '456', created_at: '' },
      ],
      ids,
    );
    expect(plan.map(({ pgId }) => pgId)).toEqual(['pg-123', 'pg-456']);
  });

  it('uses deterministic dataset-id dates regardless of database ids or row order', () => {
    const rows = [
      { review_id: '123', created_at: '' },
      { review_id: '456', created_at: '' },
    ];
    const plan = planBackfill(rows, ids);
    expect(planBackfill(rows, ids)).toEqual(plan);
    const remapped = planBackfill([...rows].reverse(), {
      ...ids,
      reviews: { '123': 'other-123', '456': 'other-456' },
    });
    expect(remapped.map(({ date }) => date)).toEqual(plan.map(({ date }) => date).reverse());
    expect(plan[0]?.date.toISOString()).toBe('2024-01-08T00:00:00.000Z');
  });

  it('keeps every planned date within 2022-01-01 through 2025-12-31 at UTC midnight', () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      review_id: String(i),
      created_at: '',
    }));
    const reviews = Object.fromEntries(rows.map((row) => [row.review_id, `pg-${row.review_id}`]));
    const plan = planBackfill(rows, { ...ids, reviews });
    for (const { date } of plan) {
      expect(date.getTime()).toBeGreaterThanOrEqual(Date.UTC(2022, 0, 1));
      expect(date.getTime()).toBeLessThanOrEqual(Date.UTC(2025, 11, 31));
      expect(date.toISOString()).toMatch(/T00:00:00\.000Z$/);
    }
  });

  it('returns an empty plan when no rows need dates', () => {
    expect(planBackfill([], ids)).toEqual([]);
    expect(planBackfill([{ review_id: '123', created_at: '1900-01-01' }], ids)).toEqual([]);
  });

  it('refuses an undated review without an id mapping', () => {
    expect(() => planBackfill([{ review_id: 'missing', created_at: '' }], ids)).toThrow(
      'No database id for review missing',
    );
  });
});
