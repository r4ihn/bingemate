import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { renderWithProviders } from '../test/utils.js';
import { Login } from './Login.js';
import { Register } from './Register.js';

const user: AuthUser = { id: 'u1', email: 'a@b.co', role: Role.CONSUMER };

function routes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<p>home page</p>} />
      <Route path="/me/lists" element={<p>lists page</p>} />
    </Routes>
  );
}

async function fill(email: string, password: string) {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Email'), email);
  await u.type(screen.getByLabelText('Password'), password);
  return u;
}

afterEach(() => vi.restoreAllMocks());

describe('Login', () => {
  it("shows the server's generic error and keeps the form usable", async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    renderWithProviders(routes(), { route: '/login' });
    const u = await fill('a@b.co', 'whatever1');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.co');
  });

  it('calls signIn and goes to "/" after a successful login', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(user);
    const signIn = vi.fn();
    renderWithProviders(routes(), { route: '/login', signIn });
    const u = await fill('a@b.co', 'whatever1');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
    expect(signIn).toHaveBeenCalledWith(user);
  });

  it('returns to the stored "from" route after login', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(user);
    renderWithProviders(routes(), {
      route: '/login',
      state: { from: { pathname: '/me/lists' } },
    });
    const u = await fill('a@b.co', 'whatever1');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(screen.getByText('lists page')).toBeInTheDocument());
  });

  it('disables the submit button while the request is pending', async () => {
    vi.spyOn(authApi, 'login').mockReturnValue(new Promise(() => undefined));
    renderWithProviders(routes(), { route: '/login' });
    const u = await fill('a@b.co', 'whatever1');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
  });

  it('does not call the API when a field is empty', async () => {
    const login = vi.spyOn(authApi, 'login');
    renderWithProviders(routes(), { route: '/login' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log in' }));
    expect(login).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
});

describe('Register', () => {
  it('shows inline errors for a weak password and does not call the API', async () => {
    const register = vi.spyOn(authApi, 'register');
    renderWithProviders(routes(), { route: '/register' });
    const u = await fill('a@b.co', 'short');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/8 characters/);
  });

  it('registers, signs in and goes to "/"', async () => {
    vi.spyOn(authApi, 'register').mockResolvedValue(user);
    const signIn = vi.fn();
    renderWithProviders(routes(), { route: '/register', signIn });
    const u = await fill('a@b.co', 'abcdefg1');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
    expect(signIn).toHaveBeenCalledWith(user);
  });
});
