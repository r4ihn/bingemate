import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
import { Register } from './Register.js';
import { TitleDetail } from './TitleDetail.js';

const pages: [string, string, string, ReactElement, Role?][] = [
  ['Home', '/', '/', <Home />],
  ['Browse', '/browse', '/browse', <Browse />],
  ['TitleDetail', '/titles/:id', '/titles/mock-1', <TitleDetail />],
  ['Login', '/login', '/login', <Login />],
  ['Register', '/register', '/register', <Register />],
  ['MyLists', '/me/lists', '/me/lists', <MyLists />, Role.CONSUMER],
  ['Forbidden', '/forbidden', '/forbidden', <Forbidden />],
  ['NotFound', '*', '/nope', <NotFound />],
  ['CreatorDashboard', '/creator', '/creator', <CreatorDashboard />, Role.CREATOR],
  ['SubmissionForm', '/creator/new', '/creator/new', <SubmissionForm />, Role.CREATOR],
  ['CreatorStats', '/creator/stats', '/creator/stats', <CreatorStats />, Role.CREATOR],
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
