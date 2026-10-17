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
