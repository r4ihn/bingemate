import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { ApiError } from '../api/client.js';
import { titlesApi } from '../api/titles.js';
import { renderWithProviders } from '../test/utils.js';
import { trendingApi } from '../api/trending.js';
import { Home } from './Home.js';

afterEach(() => vi.restoreAllMocks());

// Existing hero and fallback tests exercise the empty-job path.
beforeEach(() => {
  vi.spyOn(trendingApi, 'list').mockResolvedValue([]);
});

describe('Home', () => {
  it('features the first title the API returns, not hard-coded names', async () => {
    renderWithProviders(<Home />);
    const featured = (await titlesApi.search({ pageSize: 8 })).items[0]!;
    expect(
      await screen.findByRole('heading', { level: 1, name: featured.name }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/calloway/i)).not.toBeInTheDocument();
  });

  it('has no decorative ghost word behind the poster strip', async () => {
    renderWithProviders(<Home />);
    await screen.findByRole('heading', { level: 1 });
    const strip = document.getElementById('strip') as HTMLElement;
    expect(strip.querySelector('div[aria-hidden="true"]')).toBeNull();
  });

  it("shows a title's real poster in the strip when the data has one", async () => {
    const real = await titlesApi.search({ pageSize: 9 });
    vi.spyOn(titlesApi, 'search').mockResolvedValue({
      ...real,
      items: real.items.map((t, i) =>
        i === 1 ? { ...t, posterUrl: 'https://img.test/p.jpg' } : t,
      ),
    });
    renderWithProviders(<Home />);
    await screen.findByRole('heading', { level: 1 });
    const strip = document.getElementById('strip') as HTMLElement;
    expect(strip.innerHTML).toContain('img.test/p.jpg');
  });

  it('shows an error with Retry and no placeholder content when titles cannot load', async () => {
    vi.spyOn(titlesApi, 'search').mockRejectedValue(new ApiError(500, 'boom'));
    renderWithProviders(<Home />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});

describe('Home trending strip', () => {
  it('shows trending items in returned order while keeping the hero', async () => {
    const { items } = await titlesApi.search({ pageSize: 8 });
    const trending = [items[3]!, items[1]!, items[0]!];
    vi.mocked(trendingApi.list).mockResolvedValue(trending);
    renderWithProviders(<Home />);
    await screen.findByRole('heading', { level: 1, name: items[0]!.name });
    const links = within(document.getElementById('strip')!).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      trending.map((t) => `/titles/${t.id}`),
    );
    expect(trendingApi.list).toHaveBeenCalledWith({ limit: 7 });
  });

  it.each(['empty', 'rejected'])(
    'falls back to the title list when trending is %s',
    async (mode) => {
      const { items } = await titlesApi.search({ pageSize: 8 });
      if (mode === 'rejected')
        vi.mocked(trendingApi.list).mockImplementation(async () => {
          throw new Error('offline');
        });
      renderWithProviders(<Home />);
      await screen.findByRole('heading', { level: 1 });
      const links = within(document.getElementById('strip')!).getAllByRole('link');
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        items.slice(1).map((t) => `/titles/${t.id}`),
      );
    },
  );
});
