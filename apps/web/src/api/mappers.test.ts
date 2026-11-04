import { MediaType, Role, TitleStatus } from '@bingemate/shared';
import type { ReplyDTO, ReviewDTO, TitleDetailDTO, TitleSummary } from '@bingemate/shared';
import { describe, expect, it } from 'vitest';
import { detailToTitle, mapReply, mapReview, summaryToTitle } from './mappers.js';

const summary: TitleSummary = {
  id: 't1',
  name: 'Dune',
  mediaType: MediaType.MOVIE,
  status: TitleStatus.APPROVED,
  avgRating: 4.2,
  reviewCount: 7,
};

const detail: TitleDetailDTO = {
  ...summary,
  description: 'Spice.',
  details: null,
  releaseYear: 2021,
  genres: ['Sci-Fi'],
  people: [],
};

describe('summaryToTitle', () => {
  it('gives an empty synopsis and no invented fields', () => {
    const t = summaryToTitle(summary);
    expect(t).toEqual({ ...summary, synopsis: '' });
    expect('year' in t).toBe(false);
    expect('hue' in t).toBe(false);
    expect('studio' in t).toBe(false);
    expect('posterUrl' in t).toBe(false);
    expect('createdById' in t).toBe(false);
  });
  it('keeps posterUrl when present', () => {
    expect(summaryToTitle({ ...summary, posterUrl: '/p.jpg' }).posterUrl).toBe('/p.jpg');
  });
  it('keeps createdById when set and when null', () => {
    expect(summaryToTitle({ ...summary, createdById: 'u1' }).createdById).toBe('u1');
    expect(summaryToTitle({ ...summary, createdById: null }).createdById).toBeNull();
  });
});

describe('detailToTitle', () => {
  const withDetails = (details: TitleDetailDTO['details']) => detailToTitle({ ...detail, details });

  it('maps movie details to a runtime and rating', () => {
    const t = withDetails({
      mediaType: 'MOVIE',
      runtimeMin: 109,
      tagline: null,
      rated: 'R',
      letterboxdRating: null,
    });
    expect(t.runtime).toBe('109 min');
    expect(t.rated).toBe('R');
  });
  const tv = {
    mediaType: 'TV_SHOW',
    numSeasons: 1,
    duration: 50,
    contentRating: 'TV-MA',
    metascore: null,
    userscore: null,
  } as const;
  it('maps TV details, with one season in the singular', () => {
    const t = withDetails(tv);
    expect(t.seasons).toBe('1 season');
    expect(t.runtime).toBe('50 min per episode');
    expect(t.rated).toBe('TV-MA');
  });
  it('counts several seasons in the plural', () => {
    expect(withDetails({ ...tv, numSeasons: 5 }).seasons).toBe('5 seasons');
  });
  it('maps a book publisher', () => {
    const t = withDetails({ mediaType: 'BOOK', publisher: 'NYU Press', ratingsCount: null });
    expect(t.publisher).toBe('NYU Press');
  });
  it('adds no fact fields for null or blank details', () => {
    const blank = withDetails({ ...tv, numSeasons: null, duration: null, contentRating: null });
    for (const t of [withDetails(null), blank]) {
      for (const key of ['runtime', 'rated', 'seasons', 'publisher']) expect(key in t).toBe(false);
    }
  });
  it('maps description to synopsis and releaseYear to year', () => {
    const t = detailToTitle(detail);
    expect(t.synopsis).toBe('Spice.');
    expect(t.year).toBe(2021);
  });
  it('falls back to an empty synopsis for a null description', () => {
    expect(detailToTitle({ ...detail, description: null }).synopsis).toBe('');
  });
  it('leaves year absent for a null release year', () => {
    expect('year' in detailToTitle({ ...detail, releaseYear: null })).toBe(false);
  });
  it('keeps a year of 0 rather than treating it as missing', () => {
    expect(detailToTitle({ ...detail, releaseYear: 0 }).year).toBe(0);
  });
  it('leaves studio, countries, runtime and hue undefined', () => {
    const t = detailToTitle(detail);
    expect(t.studio).toBeUndefined();
    expect(t.countries).toBeUndefined();
    expect(t.runtime).toBeUndefined();
    expect(t.hue).toBeUndefined();
  });
  it('keeps posterUrl and createdById, and does not leak genres or people', () => {
    const t = detailToTitle({ ...detail, posterUrl: '/p.jpg', createdById: 'u9' });
    expect(t.posterUrl).toBe('/p.jpg');
    expect(t.createdById).toBe('u9');
    expect('genres' in t).toBe(false);
    expect('people' in t).toBe(false);
    expect('description' in t).toBe(false);
  });
  it('omits posterUrl when absent and keeps a null createdById', () => {
    const t = detailToTitle({ ...detail, createdById: null });
    expect('posterUrl' in t).toBe(false);
    expect(t.createdById).toBeNull();
  });
});

const author = { id: 'u1', name: 'Ann', role: Role.CREATOR };

describe('mapReview', () => {
  const dto: ReviewDTO = {
    id: 'r1',
    titleId: 't1',
    author,
    rating: 4,
    body: 'Good',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  it('maps every field', () => {
    expect(mapReview(dto)).toEqual(dto);
  });
  it('copies the author rather than sharing it', () => {
    expect(mapReview(dto).author).not.toBe(dto.author);
  });
});

describe('mapReply', () => {
  const dto: ReplyDTO = {
    id: 'p1',
    reviewId: 'r1',
    author,
    body: 'Thanks',
    createdAt: '2026-01-02T00:00:00.000Z',
    editedAt: '2026-01-03T00:00:00.000Z',
  };
  it('maps a flat reply and keeps editedAt when the writer changed the text', () => {
    expect(mapReply(dto)).toEqual({
      id: 'p1',
      reviewId: 'r1',
      author,
      body: 'Thanks',
      createdAt: '2026-01-02T00:00:00.000Z',
      editedAt: '2026-01-03T00:00:00.000Z',
    });
  });

  it('leaves editedAt out for a reply nobody changed', () => {
    const unedited: ReplyDTO = { ...dto };
    delete unedited.editedAt;
    const reply = mapReply(unedited);

    expect(reply).not.toHaveProperty('editedAt');
    expect(reply).not.toHaveProperty('parentId');
    expect(reply).not.toHaveProperty('isOfficial');
  });
});
