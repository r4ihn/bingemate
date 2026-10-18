import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/utils.js';
import { Browse } from './Browse.js';

function Where() {
  const { search } = useLocation();
  return <p data-testid="where">{search}</p>;
}

function renderBrowse(route: string) {
  renderWithProviders(
    <Routes>
      <Route
        path="browse"
        element={
          <>
            <Browse />
            <Where />
          </>
        }
      />
    </Routes>,
    { route },
  );
  return userEvent.setup();
}

describe('Browse', () => {
  it('shows results for the q in the URL, each linking to its title', async () => {
    renderBrowse('/browse?q=salt');
    expect(await screen.findByRole('heading', { name: 'Results for “salt”' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /salt archive/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/titles\//),
    );
    expect(screen.queryByRole('link', { name: /harbour nine/i })).not.toBeInTheDocument();
  });

  it('marks the pill matching ?type and narrows the grid', async () => {
    renderBrowse('/browse?type=BOOK');
    expect(await screen.findByRole('button', { name: 'Books' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('choosing a pill writes type to the URL, keeps q and drops the page', async () => {
    const u = renderBrowse('/browse?q=a&page=2');
    await u.click(await screen.findByRole('button', { name: 'Movies' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?q=a&type=MOVIE');
    await u.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('where')).toHaveTextContent('?q=a');
    expect(screen.getByTestId('where')).not.toHaveTextContent('type');
  });

  it('shows an empty state naming the query when nothing matches', async () => {
    renderBrowse('/browse?q=zzzzqq');
    expect(await screen.findByText(/no titles match/i)).toBeInTheDocument();
  });

  it('an out-of-range ?page lands on the last page instead of an empty grid', async () => {
    renderBrowse('/browse?page=99');
    expect(await screen.findAllByRole('listitem')).not.toHaveLength(0);
    expect(screen.getByTestId('where')).toHaveTextContent('page=2');
    expect(screen.queryByText(/no titles/i)).not.toBeInTheDocument();
  });

  it('paginates with ?page and writes the new page to the URL', async () => {
    const u = renderBrowse('/browse');
    await u.click(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('where')).toHaveTextContent('page=2');
  });
});
