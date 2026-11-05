import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import { resetDb } from '../mocks/db.js';
import { renderWithProviders } from '../test/utils.js';
import { AdminDashboard } from './admin/AdminDashboard.js';
import { Browse } from './Browse.js';
import { CreatorDashboard } from './creator/CreatorDashboard.js';
import { CreatorStats } from './creator/CreatorStats.js';
import { SubmissionForm } from './creator/SubmissionForm.js';
import { Forbidden } from './Forbidden.js';
import { Home } from './Home.js';
import { Login } from './Login.js';
import { MyLists } from './MyLists.js';
import { NotFound } from './NotFound.js';
import { Person } from './Person.js';
import { Register } from './Register.js';
import { TitleDetail } from './TitleDetail.js';

const pages: [string, string, string, ReactElement, Role?][] = [
  ['Home', '/', '/', <Home />],
  ['Browse', '/browse', '/browse', <Browse />],
  ['TitleDetail', '/titles/:id', '/titles/mock-1', <TitleDetail />],
  ['Person', '/people/:id', '/people/person-1', <Person />],
  ['Login', '/login', '/login', <Login />],
  ['Register', '/register', '/register', <Register />],
  ['MyLists', '/me/lists', '/me/lists', <MyLists />, Role.MEMBER],
  ['Forbidden', '/forbidden', '/forbidden', <Forbidden />],
  ['NotFound', '*', '/nope', <NotFound />],
  ['CreatorDashboard', '/creator', '/creator', <CreatorDashboard />, Role.MEMBER],
  ['SubmissionForm', '/creator/new', '/creator/new', <SubmissionForm />, Role.MEMBER],
  ['CreatorStats', '/creator/stats', '/creator/stats', <CreatorStats />, Role.MEMBER],
  ['AdminDashboard', '/admin', '/admin', <AdminDashboard />, Role.ADMIN],
];

beforeEach(() => resetDb());

describe('every page has exactly one h1', () => {
  it.each(pages)('%s', async (_name, pattern, route, element, role) => {
    renderWithProviders(
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>,
      { route, role },
    );
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1));
  });
});

it('Browse discovery selects have visible labels and work from the keyboard', async () => {
  const user = userEvent.setup();
  renderWithProviders(<Browse />, { route: '/browse?type=MOVIE' });
  await screen.findByRole('option', { name: 'Drama' });
  const genre = screen.getByRole('combobox', { name: 'Genre' });
  const sort = screen.getByRole('combobox', { name: 'Sort' });
  expect(document.querySelector(`label[for="${genre.id}"]`)).toHaveTextContent('Genre');
  expect(document.querySelector(`label[for="${sort.id}"]`)).toHaveTextContent('Sort');
  genre.focus();
  await user.tab();
  expect(sort).toHaveFocus();
  await user.selectOptions(sort, 'rating');
  expect(sort).toHaveValue('rating');
});

it('Home trending strip retains named keyboard-focusable title links', async () => {
  renderWithProviders(<Home />);
  await screen.findByRole('heading', { level: 1 });
  const strip = document.getElementById('strip')!;
  const links = within(strip).getAllByRole('link');
  expect(links).toHaveLength(7);
  for (const link of links) {
    expect(link).toHaveAccessibleName();
    expect(link.tabIndex).toBe(0);
  }
});

it('Register username has a visible label, described hint and keyboard order', async () => {
  renderWithProviders(<Register />, { route: '/register' });
  const input = screen.getByRole('textbox', { name: 'Username' });
  expect(input.closest('label')).toHaveTextContent('Username');
  expect(input).toHaveAccessibleDescription(/characters: letters, digits/);
  const u = userEvent.setup();
  screen.getByLabelText('Email').focus();
  await u.tab();
  expect(input).toHaveFocus();
  await u.tab();
  expect(screen.getByLabelText('Password')).toHaveFocus();
});
