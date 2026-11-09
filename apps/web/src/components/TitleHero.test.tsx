import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('TitleHero trailer', () => {
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
    posterUrl: 'https://image.tmdb.org/t/p/w500/x.jpg',
  } satisfies TitleDetail;
  const renderHero = (title: TitleDetail) =>
    render(
      <MemoryRouter>
        <TitleHero title={title} breadcrumb={['Main']} />
      </MemoryRouter>,
    );

  it('has no play button when the title has no trailer', () => {
    renderHero(base);
    expect(screen.queryByRole('button', { name: /Play trailer/ })).toBeNull();
    expect(screen.queryByTestId('hero-poster-play')).toBeNull();
  });

  it('the play button opens the trailer, and Close removes it', async () => {
    const user = userEvent.setup();
    renderHero({ ...base, trailerKey: 'abcDEF12345' });

    await user.click(
      screen.getByRole('button', { name: 'Play trailer for 1492: Conquest of Paradise' }),
    );
    expect(screen.getByTitle('Trailer for 1492: Conquest of Paradise')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&rel=0',
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTitle('Trailer for 1492: Conquest of Paradise')).toBeNull();
  });

  it('clicking the poster opens the trailer too', async () => {
    const user = userEvent.setup();
    renderHero({ ...base, trailerKey: 'abcDEF12345' });
    await user.click(screen.getByTestId('hero-poster-play'));
    expect(screen.getByTitle('Trailer for 1492: Conquest of Paradise')).toBeInTheDocument();
  });

  it('never embeds something that is not a YouTube id', async () => {
    const user = userEvent.setup();
    renderHero({ ...base, trailerKey: '"><script>' });
    await user.click(screen.getByRole('button', { name: /Play trailer/ }));
    expect(document.querySelector('iframe')).toBeNull();
  });
});
