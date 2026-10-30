import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils.js';
import { TitleOverview } from './TitleOverview.js';
import type { TitleDetail } from '../types/title.js';

const title: TitleDetail = {
  id: 't1',
  name: 'Dune',
  mediaType: 'BOOK',
  status: 'APPROVED',
  avgRating: 4,
  reviewCount: 2,
  synopsis: 'Spice.',
};

describe('TitleOverview facts', () => {
  it('shows seasons, rating and publisher when the title has them', () => {
    renderWithProviders(
      <TitleOverview
        title={{ ...title, seasons: '5 seasons', rated: 'TV-MA', publisher: 'NYU Press' }}
        breadcrumb={['Browse']}
      />,
    );
    expect(screen.getByText('Seasons')).toBeInTheDocument();
    expect(screen.getByText('5 seasons')).toBeInTheDocument();
    expect(screen.getByText('Rated')).toBeInTheDocument();
    expect(screen.getByText('Publisher')).toBeInTheDocument();
    expect(screen.getByText('NYU Press')).toBeInTheDocument();
  });

  it('shows no label for a fact the title does not have', () => {
    renderWithProviders(<TitleOverview title={title} breadcrumb={['Browse']} />);
    expect(screen.queryByText('Seasons')).not.toBeInTheDocument();
    expect(screen.queryByText('Rated')).not.toBeInTheDocument();
    expect(screen.queryByText('Publisher')).not.toBeInTheDocument();
  });
});
