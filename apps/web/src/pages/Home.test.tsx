import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ApiError } from '../api/client.js';
import { titlesApi } from '../api/titles.js';
import { renderWithProviders } from '../test/utils.js';
import { Home } from './Home.js';

afterEach(() => vi.restoreAllMocks());

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

  it('shows an error with Retry and no placeholder content when titles cannot load', async () => {
    vi.spyOn(titlesApi, 'search').mockRejectedValue(new ApiError(500, 'boom'));
    renderWithProviders(<Home />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
