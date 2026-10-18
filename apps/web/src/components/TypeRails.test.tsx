import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../test/utils.js';
import { TypeRails } from './TypeRails.js';

describe('TypeRails', () => {
  it('shows a Movies, TV and Books rail, each with a See all link to Browse', async () => {
    renderWithProviders(<TypeRails />);
    const expected = [
      ['Movies', '/browse?type=MOVIE'],
      ['TV', '/browse?type=TV_SHOW'],
      ['Books', '/browse?type=BOOK'],
    ] as const;
    for (const [name, href] of expected) {
      const rail = await screen.findByRole('region', { name });
      expect(within(rail).getByRole('link', { name: /see all/i })).toHaveAttribute('href', href);
      const posters = within(rail).getAllByRole('listitem');
      expect(posters.length).toBeGreaterThan(0);
      expect(posters.length).toBeLessThanOrEqual(8);
    }
  });

  it('only lists titles of the rail’s own media type', async () => {
    renderWithProviders(<TypeRails />);
    const books = await screen.findByRole('region', { name: 'Books' });
    expect(within(books).queryAllByText('Movie')).toHaveLength(0);
    expect(within(books).getAllByText('Book').length).toBeGreaterThan(0);
  });
});
