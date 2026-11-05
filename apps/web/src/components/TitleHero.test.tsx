import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MediaType, TitleStatus } from '@bingemate/shared';
import type { TitleDetail } from '../types/title.js';
import { TitleHero } from './TitleHero.js';

describe('TitleHero with sparse real data', () => {
  it('renders without crashing when the rating is null and optional lists are missing', () => {
    // Real SQL AVG() is NULL for an unreviewed title, and the backend may omit UI-only fields
    const sparse = {
      id: 't1',
      name: 'Fresh Title',
      mediaType: MediaType.MOVIE,
      status: TitleStatus.APPROVED,
      avgRating: null,
      reviewCount: 0,
      synopsis: '',
    } as unknown as TitleDetail;
    render(
      <MemoryRouter>
        <TitleHero title={sparse} breadcrumb={['Main', 'Fresh Title']} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Fresh Title' })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('TitleHero poster', () => {
  const base = {
    id: 't1',
    name: '1492: Conquest of Paradise',
    mediaType: MediaType.MOVIE,
    status: TitleStatus.APPROVED,
    avgRating: 4,
    reviewCount: 3,
    synopsis: '',
    rankInType: null,
    topPercent: null,
  } satisfies TitleDetail;
  const renderHero = (title: TitleDetail) =>
    render(
      <MemoryRouter>
        <TitleHero title={title} breadcrumb={['Main']} />
      </MemoryRouter>,
    );

  it('shows the poster, with a blurred copy behind it, when the title has one', () => {
    renderHero({ ...base, posterUrl: 'https://image.tmdb.org/t/p/w500/x.jpg' });
    expect(
      screen.getByRole('img', { name: 'Poster for 1492: Conquest of Paradise' }),
    ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w500/x.jpg');
    expect(screen.getByTestId('hero-backdrop').style.backgroundImage).toContain('/x.jpg');
  });

  it('keeps the gradient and no image when there is no poster', () => {
    renderHero(base);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByTestId('hero-backdrop')).toBeNull();
  });
});
