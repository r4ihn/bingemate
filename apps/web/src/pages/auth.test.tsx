import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { usernameError, USERNAME_MIN, USERNAME_MAX, Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { authApi } from '../api/auth.js';
import type * as MockMode from '../api/mockMode.js';
import { ApiError } from '../api/client.js';
import { renderWithProviders } from '../test/utils.js';
import { Login } from './Login.js';
import { Register } from './Register.js';

vi.mock('../api/mockMode.js', async (importOriginal) => ({
  ...(await importOriginal<typeof MockMode>()),
  useMock: false,
}));

const user: AuthUser = { username: 'test member', id: 'u1', email: 'a@b.co', role: Role.MEMBER };

function Where() {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="where">{pathname + search + hash}</p>;
}

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
  const username = screen.queryByLabelText('Username');
  if (username) await u.type(username, 'test member');
  return u;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Login', () => {
  it('has no Username field', () => {
    renderWithProviders(routes(), { route: '/login' });
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });
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

  it('keeps the query string and hash of the stored "from" location', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue(user);
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/browse" element={<Where />} />
      </Routes>,
      {
        route: '/login',
        state: { from: { pathname: '/browse', search: '?q=salt', hash: '#top' } },
      },
    );
    const u = await fill('a@b.co', 'whatever1');
    await u.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByTestId('where')).toHaveTextContent('/browse?q=salt#top');
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

describe('Register username (real API client)', () => {
  function setup(status = 201, message?: string) {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(message ? { message } : user), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    renderWithProviders(routes(), { route: '/register' });
    return fetcher;
  }

  it('labels Username between Email and Password and describes its rules', () => {
    setup();
    const input = screen.getByLabelText('Username');
    expect(input).toHaveAttribute('autocomplete', 'username');
    expect(input).toHaveAccessibleDescription(
      `${USERNAME_MIN} to ${USERNAME_MAX} characters: letters, digits, spaces, _ - and .`,
    );
    expect(screen.getAllByRole('textbox').map((el) => el.getAttribute('autocomplete'))).toEqual([
      'email',
      'username',
    ]);
    expect(
      input.compareDocumentPosition(screen.getByLabelText('Password')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each(['', 'ab', 'a'.repeat(USERNAME_MAX + 1), 'bad!name', 'AdMiN', '_starts'])(
    'blocks invalid username %j with the shared message',
    async (name) => {
      const fetcher = setup();
      const u = await fill('a@b.co', 'abcdefg1');
      const input = screen.getByLabelText('Username');
      await u.clear(input);
      if (name) await u.type(input, name);
      await u.click(screen.getByRole('button', { name: 'Create account' }));
      expect(screen.getByRole('alert')).toHaveTextContent(usernameError(name)!);
      expect(input).toHaveAccessibleDescription(expect.stringContaining(usernameError(name)!));
      expect(input).toHaveFocus();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('focuses Email before Username and Password when all are invalid', async () => {
    const fetcher = setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('preserves spaces while typing and normalises the request body', async () => {
    const fetcher = setup();
    const u = await fill('a@b.co', 'abcdefg1');
    const input = screen.getByLabelText('Username');
    await u.clear(input);
    await u.type(input, '  Test  Member  ');
    expect(input).toHaveValue('  Test  Member  ');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('home page');
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/auth/register'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.co', password: 'abcdefg1', username: 'Test Member' }),
      }),
    );
  });

  it('puts a taken username error under Username and focuses it', async () => {
    setup(409, 'Username already taken');
    const u = await fill('a@b.co', 'abcdefg1');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Username already taken');
    const input = screen.getByLabelText('Username');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(expect.stringContaining('Username already taken'));
    expect(input).toHaveFocus();
  });

  it('keeps the taken email error at form level', async () => {
    setup(409, 'Email already in use');
    const u = await fill('a@b.co', 'abcdefg1');
    await u.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use');
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled();
  });
});
