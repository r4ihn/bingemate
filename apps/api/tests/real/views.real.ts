import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';
import { getTitleRank } from '../../src/modules/titles/ranking.service.js';
import { createTitle, createUser, refreshViews, resetDatabases } from './helpers.js';

const app = createApp();
beforeEach(resetDatabases);

async function reviews(titleId: string, ratings: number[]) {
  for (const rating of ratings) {
    const user = await createUser();
    await prisma.review.create({ data: { titleId, userId: user.id, rating } });
  }
}

describe('real database views', () => {
  it('migrations install all four views and the materialized title rank view', async () => {
    const views = await prisma.$queryRaw<{ viewname: string }[]>`
      SELECT viewname FROM pg_views WHERE schemaname = current_schema()`;
    expect(views.map((v) => v.viewname), 'migrations must install every application view')
      .toEqual(expect.arrayContaining([
        'title_rating_stats', 'genre_filter_options', 'trending_titles', 'creator_title_stats',
      ]));
    const matviews = await prisma.$queryRaw<{ matviewname: string }[]>`
      SELECT matviewname FROM pg_matviews WHERE schemaname = current_schema()`;
    expect(matviews.map((v) => v.matviewname), 'rank lookups require a materialized view')
      .toContain('title_rank_in_type');
    const response = await request(app).get('/api/titles');
    expect(response.status, 'migrated empty databases must support title browsing').toBe(200);
  });

  it('title_rating_stats rounds 41 stars over 40 distinct reviewers to 1.03', async () => {
    const title = await createTitle();
    await reviews(title.id, [...Array<number>(39).fill(1), 2]);
    const rows = await prisma.$queryRaw<{ avg_rating: number; review_count: number }[]>`
      SELECT avg_rating, review_count FROM title_rating_stats WHERE title_id = ${title.id}`;
    expect(rows, 'PostgreSQL numeric ROUND must preserve the .xx5 tie and all 40 reviews')
      .toEqual([{ avg_rating: 1.03, review_count: 40 }]);
  });

  it('trending_titles excludes hidden and unreviewed titles and applies the global weighted score', async () => {
    const unreviewed = await createTitle();
    const pending = await createTitle({ status: 'PENDING' });
    const high = await createTitle();
    const low = await createTitle();
    // The hidden review participates in C, but its title must not appear in trending.
    await reviews(pending.id, [1]);
    await reviews(high.id, [5, 5, 5]);
    await reviews(low.id, [2, 4]);
    const c = (1 + 5 + 5 + 5 + 2 + 4) / 6;
    const fixtures = [{ id: high.id, v: 3, r: 5 }, { id: low.id, v: 2, r: 3 }];
    const expected = fixtures.map(({ id, v, r }) => ({
      id, score: v / (v + 10) * r + 10 / (v + 10) * c,
    })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const rows = await prisma.$queryRaw<{ id: string; trending_score: number }[]>`
      SELECT id, trending_score FROM trending_titles ORDER BY trending_score DESC, id`;
    expect(rows.map((r) => r.id), 'only reviewed approved titles may appear, in weighted score order')
      .toEqual(expected.map((r) => r.id));
    expect(rows.map((r) => r.id), 'unreviewed approved titles must be excluded').not.toContain(unreviewed.id);
    expect(rows.map((r) => r.id), 'pending reviewed titles must be excluded').not.toContain(pending.id);
    for (const fixture of expected) {
      const row = rows.find((r) => r.id === fixture.id)!;
      expect(Math.abs(row.trending_score - fixture.score), 'SQL score must match the fixture formula within 1e-9')
        .toBeLessThan(1e-9);
    }
  });

  it('genre_filter_options requires five approved titles per media type', async () => {
    const genre = await prisma.genre.create({ data: { name: 'Threshold genre' } });
    for (let i = 0; i < 4; i++) {
      const title = await createTitle();
      await prisma.titleGenre.create({ data: { titleId: title.id, genreId: genre.id } });
    }
    const hidden = await createTitle({ status: 'PENDING' });
    await prisma.titleGenre.create({ data: { titleId: hidden.id, genreId: genre.id } });
    const below = await prisma.$queryRaw<{ title_count: number }[]>`
      SELECT title_count FROM genre_filter_options WHERE genre_id = ${genre.id}`;
    expect(below, 'four approved plus one pending title must not meet HAVING threshold').toEqual([]);
    const fifth = await createTitle();
    await prisma.titleGenre.create({ data: { titleId: fifth.id, genreId: genre.id } });
    const eligible = await prisma.$queryRaw<{ mediaType: string; title_count: number }[]>`
      SELECT "mediaType", title_count FROM genre_filter_options WHERE genre_id = ${genre.id}`;
    expect(eligible, 'five approved titles must expose the genre with the approved count')
      .toEqual([{ mediaType: 'MOVIE', title_count: 5 }]);
  });

  it('title_rank_in_type ranks movies and books independently with deterministic ties and API parity', async () => {
    const empty = await createTitle();
    for (const mediaType of ['MOVIE', 'BOOK'] as const) {
      for (const rating of [5, 5, 2]) {
        const title = await createTitle({ mediaType });
        await reviews(title.id, [rating]);
      }
    }
    await refreshViews();
    for (const mediaType of ['MOVIE', 'BOOK']) {
      const ordered = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM trending_titles WHERE "mediaType"::text = ${mediaType}
        ORDER BY trending_score DESC, id`;
      const ranked = await prisma.$queryRaw<{ title_id: string; rank_in_type: bigint }[]>`
        SELECT title_id, rank_in_type FROM title_rank_in_type WHERE "mediaType"::text = ${mediaType}
        ORDER BY rank_in_type`;
      expect(ranked.map((r) => r.title_id), 'ranks must follow score descending and id for ties')
        .toEqual(ordered.map((r) => r.id));
      expect(ranked.map((r) => Number(r.rank_in_type)), 'each media type must restart ranks at one')
        .toEqual([1, 2, 3]);
      for (const [index, row] of ranked.entries()) {
        const rank = await getTitleRank(row.title_id);
        const expected = { rankInType: index + 1, topPercent: Math.max(1, Math.ceil(index / 2 * 100)) };
        expect(rank, 'service must convert rank and percent including top 1% for the winner').toEqual(expected);
        const response = await request(app).get(`/api/titles/${row.title_id}`);
        expect(response.status, 'ranked title detail must remain readable').toBe(200);
        expect(response.body, 'HTTP detail must expose the same rank and percentage as the service')
          .toMatchObject(expected);
      }
    }
    expect(await getTitleRank(empty.id), 'an unreviewed title has no materialized rank').toBeNull();
    const response = await request(app).get(`/api/titles/${empty.id}`);
    expect(response.status, 'missing ranks must not hide unreviewed titles').toBe(200);
    expect(response.body, 'unreviewed title detail must explicitly expose null rank fields')
      .toMatchObject({ rankInType: null, topPercent: null });
  });
});
