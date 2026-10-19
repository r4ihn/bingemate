import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import { renderWithProviders } from '../test/utils.js';
import { MainLayout } from './MainLayout.js';

function renderLayout(role?: Role) {
  renderWithProviders(
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<h1>home</h1>} />
        <Route path="browse" element={<h1>browse</h1>} />
      </Route>
    </Routes>,
    { role },
  );
  return userEvent.setup();
}

const link = (name: string) => screen.queryByRole('link', { name });

describe('MainLayout role-aware links', () => {
  it('anonymous visitors see Sign in and no My Lists, Creator or Admin', () => {
    renderLayout();
    expect(link('Browse')).toBeInTheDocument();
    expect(link('Sign in')).toBeInTheDocument();
    expect(link('My Lists')).not.toBeInTheDocument();
    expect(link('Creator')).not.toBeInTheDocument();
    expect(link('Admin')).not.toBeInTheDocument();
  });

  it('a CONSUMER sees My Lists but no Creator or Admin link', () => {
    renderLayout(Role.CONSUMER);
    expect(link('My Lists')).toBeInTheDocument();
    expect(link('Creator')).not.toBeInTheDocument();
    expect(link('Admin')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('a CREATOR sees the Creator link but not Admin', () => {
    renderLayout(Role.CREATOR);
    expect(link('Creator')).toBeInTheDocument();
    expect(link('Admin')).not.toBeInTheDocument();
  });

  it('an ADMIN sees both Creator and Admin', () => {
    renderLayout(Role.ADMIN);
    expect(link('Creator')).toBeInTheDocument();
    expect(link('Admin')).toBeInTheDocument();
  });
});

describe('MainLayout mobile menu and skip link', () => {
  it('Menu button toggles the mobile links and closes after choosing one', async () => {
    const u = renderLayout(Role.CONSUMER);
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: 'Mobile menu' })).not.toBeInTheDocument();

    await u.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    const mobile = screen.getByRole('navigation', { name: 'Mobile menu' });
    expect(within(mobile).getByRole('link', { name: 'My Lists' })).toBeInTheDocument();

    await u.click(within(mobile).getByRole('link', { name: 'Browse' }));
    expect(await screen.findByRole('heading', { name: 'browse' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Mobile menu' })).not.toBeInTheDocument();
  });

  it('Escape closes the open mobile menu', async () => {
    const u = renderLayout();
    await u.click(screen.getByRole('button', { name: 'Menu' }));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Mobile menu' })).not.toBeInTheDocument();
  });

  it('has a skip link that targets the main landmark', () => {
    renderLayout();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});
