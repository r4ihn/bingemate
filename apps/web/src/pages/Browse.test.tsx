import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/utils.js';
import { genresApi } from '../api/genres.js';
import { titlesApi } from '../api/titles.js';
import { MediaType } from '@bingemate/shared';
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

afterEach(() => vi.restoreAllMocks());

describe('Browse discovery controls', () => {
  function setup(route: string) {
    const genres = vi
      .spyOn(genresApi, 'list')
      .mockImplementation(async (type) =>
        type === MediaType.BOOK
          ? [{ id: 'fantasy', name: 'Fantasy', titleCount: 4 }]
          : [{ id: 'drama', name: 'Drama', titleCount: 7 }],
      );
    const search = vi.spyOn(titlesApi, 'search').mockResolvedValue({ items: [], total: 0 });
    return { u: renderBrowse(route), genres, search };
  }

  it('loads genres for the selected type', async () => {
    const { genres } = setup('/browse?type=BOOK');
    expect(await screen.findByRole('option', { name: 'Fantasy' })).toBeInTheDocument();
    expect(genres).toHaveBeenCalledWith(MediaType.BOOK);
    expect(screen.getByRole('combobox', { name: 'Genre' })).toHaveValue('');
  });

  it('choosing a genre preserves filters, writes the URL and requests page 1', async () => {
    const { u, search } = setup('/browse?q=light&type=MOVIE&page=3&sort=rating');
    await screen.findByRole('option', { name: 'Drama' });
    await u.selectOptions(screen.getByLabelText('Genre'), 'Drama');
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith({
        q: 'light',
        type: MediaType.MOVIE,
        genre: 'Drama',
        sort: 'rating',
        page: 1,
        pageSize: 15,
      }),
    );
    const params = new URLSearchParams(screen.getByTestId('where').textContent ?? '');
    expect(params.get('genre')).toBe('Drama');
    expect(params.has('page')).toBe(false);
  });

  it('clears a genre unavailable for the new type', async () => {
    const { u, search } = setup('/browse?type=MOVIE&genre=Drama&page=3');
    await screen.findByRole('option', { name: 'Drama' });
    await u.click(screen.getByRole('button', { name: 'Books' }));
    await screen.findByRole('option', { name: 'Fantasy' });
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('genre='));
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: MediaType.BOOK, genre: undefined, page: 1 }),
    );
  });

  it('sort updates the URL and requests page 1', async () => {
    const { u, search } = setup('/browse?page=2');
    await u.selectOptions(screen.getByLabelText('Sort'), 'reviews');
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'reviews', page: 1 }),
      ),
    );
    expect(screen.getByTestId('where')).toHaveTextContent('sort=reviews');
    expect(screen.getByTestId('where')).not.toHaveTextContent('page=');
  });

  it('ignores an unknown URL sort', async () => {
    const { search } = setup('/browse?sort=bogus');
    await waitFor(() =>
      expect(search).toHaveBeenCalledWith(expect.objectContaining({ sort: undefined })),
    );
    expect(screen.getByLabelText('Sort')).toHaveValue('name');
  });
});

it('keeps genre and sort while paginating', async () => {
  vi.spyOn(genresApi, 'list').mockResolvedValue([{ id: 'drama', name: 'Drama', titleCount: 30 }]);
  const original = await titlesApi.search({ pageSize: 15 });
  const search = vi.spyOn(titlesApi, 'search').mockResolvedValue({ ...original, total: 30 });
  const user = renderBrowse('/browse?genre=Drama&sort=year');
  await user.click(await screen.findByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ genre: 'Drama', sort: 'year', page: 2 }),
    ),
  );
});

it('keeps a genre that is offered for the new media type', async () => {
  vi.spyOn(genresApi, 'list').mockResolvedValue([{ id: 'drama', name: 'Drama', titleCount: 8 }]);
  const search = vi.spyOn(titlesApi, 'search').mockResolvedValue({ items: [], total: 0 });
  const user = renderBrowse('/browse?type=MOVIE&genre=Drama&sort=rating');
  await screen.findByRole('option', { name: 'Drama' });
  await user.click(screen.getByRole('button', { name: 'TV' }));
  await waitFor(() =>
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: MediaType.TV_SHOW, genre: 'Drama', sort: 'rating', page: 1 }),
    ),
  );
  expect(await screen.findByRole('combobox', { name: 'Genre' })).toHaveValue('Drama');
});

it('shows genre loading and retry states without hiding titles', async () => {
  const list = vi
    .spyOn(genresApi, 'list')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue([{ id: 'drama', name: 'Drama', titleCount: 8 }]);
  const user = renderBrowse('/browse');
  expect(screen.getByText('Loading genres…')).toBeInTheDocument();
  expect(screen.getByLabelText('Genre')).toBeDisabled();
  expect(await screen.findByText('Genres could not be loaded.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('option', { name: 'Drama' });
  expect(list).toHaveBeenCalledTimes(2);
  expect(screen.getByLabelText('Genre')).toBeEnabled();
});
