import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/utils.js';
import { NavSearch } from './NavSearch.js';

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderSearch() {
  renderWithProviders(
    <>
      <NavSearch />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </>,
  );
  return userEvent.setup();
}

const open = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(screen.getByRole('button', { name: 'Search' }));
  return screen.getByRole('combobox', { name: 'Search titles' });
};

describe('NavSearch', () => {
  it('starts as a Search button and expands into a focused combobox', async () => {
    const u = renderSearch();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const input = await open(u);
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('lists at most 5 matches plus a "See all" row while typing', async () => {
    const u = renderSearch();
    const input = await open(u);
    await u.type(input, 'a');
    const list = await screen.findByRole('listbox');
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(6);
    expect(options[5]).toHaveTextContent('See all results for “a”');
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  it('clicking a match opens its title page and collapses the bar', async () => {
    const u = renderSearch();
    await u.type(await open(u), 'salt arch');
    await u.click(await screen.findByRole('option', { name: /salt archive/i }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/titles\/mock-/);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('arrow keys move the highlight and Enter opens it', async () => {
    const u = renderSearch();
    const input = await open(u);
    await u.type(input, 'salt');
    await screen.findByRole('listbox');
    await u.keyboard('{ArrowDown}');
    const active = input.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(document.getElementById(active!)).toHaveAttribute('aria-selected', 'true');
    await u.keyboard('{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/titles\//);
  });

  it('Enter with nothing highlighted searches Browse with the query', async () => {
    const u = renderSearch();
    await u.type(await open(u), 'salt{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/browse?q=salt');
  });

  it('Enter on a blank query does nothing', async () => {
    const u = renderSearch();
    await u.type(await open(u), '   {Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('the scope chip narrows the Browse link to one media type', async () => {
    const u = renderSearch();
    const input = await open(u);
    await u.click(screen.getByRole('button', { name: 'Search scope: All' }));
    await u.click(screen.getByRole('menuitemradio', { name: 'Books' }));
    expect(screen.getByRole('button', { name: 'Search scope: Books' })).toBeInTheDocument();
    expect(input).toHaveFocus();
    await u.type(input, 'salt{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/browse?q=salt&type=BOOK');
  });

  it('Escape collapses the bar and returns focus to the Search button', async () => {
    const u = renderSearch();
    await u.type(await open(u), 'salt');
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
  });

  it('clicking outside collapses the bar', async () => {
    const u = renderSearch();
    await open(u);
    await u.click(document.body);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
