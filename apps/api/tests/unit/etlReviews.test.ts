import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const { writeJsonLines, writeProcessed } = vi.hoisted(() => ({
  writeJsonLines: vi.fn(),
  writeProcessed: vi.fn(),
}));

vi.mock('../../../../data/etl/lib/io.js', () => ({
  readRaw: () => [
    { review_id: '1', user_id: '2', title_id: '3', score: '8', review_date: '2026-10-01' },
  ],
  readJsonLines: () => [
    {
      review_id: 1,
      user_id: 2,
      title_id: 3,
      media_type: 'movie',
      text: '  Great.  ',
      details: { review_year: 1999 },
    },
  ],
  readProcessed: () => [{ user_id: '2' }],
  readProcessedTitles: () => [{ title_id: '3' }],
  writeJsonLines,
  writeProcessed,
  runIfMain: vi.fn(),
}));
vi.mock('../../../../data/etl/lib/log.js', () => ({
  StepLog: class {
    count = vi.fn();
    bump = vi.fn();
    reject = vi.fn();
    info = vi.fn();
    finish = vi.fn();
  },
}));

// ETL sits outside this package's rootDir, so import it at run time like the other ETL tests.
const file = fileURLToPath(new URL('../../../../data/etl/clean-reviews.ts', import.meta.url));
const { main } = (await import(/* @vite-ignore */ file)) as { main: () => void };

describe('clean-reviews', () => {
  it('drops imported details while keeping the cleaned text and matching rating header', () => {
    main();

    expect(writeJsonLines).toHaveBeenCalledOnce();
    expect(writeJsonLines).toHaveBeenCalledWith('review_bodies.jsonl', [
      { review_id: 1, media_type: 'MOVIE', text: 'Great.', comments: [] },
    ]);
    expect(writeJsonLines.mock.calls[0]?.[1][0]).not.toHaveProperty('details');
    expect(writeProcessed.mock.calls[0]?.[2]).toEqual([
      {
        review_id: 1,
        user_id: 2,
        title_id: 3,
        original_score: 8,
        rating: 4,
        created_at: '2026-10-01',
      },
    ]);
  });
});
