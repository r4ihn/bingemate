import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { resetMockProfiles } from '../api/users.js';
import { db, resetDb } from '../mocks/db.js';
import { renderWithProviders } from '../test/utils.js';
import { Profile } from './Profile.js';

beforeEach(() => {
  resetDb();
  resetMockProfiles();
});

const show = async (role: Role = Role.MEMBER, signIn?: (user: AuthUser) => void) => {
  const u = userEvent.setup();
  renderWithProviders(<Profile />, { role, route: '/me/profile', signIn });
  await screen.findByRole('heading', { name: 'Profile' });
  return u;
};

type User = Awaited<ReturnType<typeof show>>;

const usernameInput = () => screen.getByRole('textbox', { name: 'Username' });

const saveUsername = async (u: User, name: string) => {
  await u.clear(usernameInput());
  if (name) await u.type(usernameInput(), name);
  await u.click(screen.getByRole('button', { name: 'Save username' }));
};

const changePassword = async (u: User, current: string, next: string, confirm: string) => {
  await u.type(screen.getByLabelText('Current password'), current);
  await u.type(screen.getByLabelText('New password'), next);
  await u.type(screen.getByLabelText('Confirm new password'), confirm);
  await u.click(screen.getByRole('button', { name: 'Update password' }));
};

describe('Profile account card', () => {
  it('shows the name, role, email and member-since date', async () => {
    await show();

    expect(await screen.findByRole('heading', { level: 2, name: 'member' })).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.getByText('member@mock.dev')).toBeInTheDocument();
    expect(screen.getByText('Only you can see your email.')).toBeInTheDocument();
    expect(screen.getByText('12 Oct 2026')).toBeInTheDocument();
  });

  it('labels an admin account', async () => {
    await show(Role.ADMIN);

    expect(await screen.findByText('Admin')).toBeInTheDocument();
  });
});

describe('Profile username form', () => {
  it('starts with the current username and shows the rules', async () => {
    await show();

    expect(await screen.findByRole('textbox', { name: 'Username' })).toHaveValue('member');
    expect(screen.getByText(/3 to 30 characters/)).toBeInTheDocument();
  });

  it('rejects an invalid name before calling the API', async () => {
    const u = await show();

    await saveUsername(u, 'ab');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Username must be between 3 and 30 characters',
    );
    expect(screen.queryByText('Username updated.')).not.toBeInTheDocument();
  });

  it('rejects a reserved name', async () => {
    const u = await show();

    await saveUsername(u, 'Admin');

    expect(await screen.findByRole('alert')).toHaveTextContent('This username is reserved');
  });

  it('saves the normalised name, updates the card at once and tells the app who is signed in', async () => {
    const signIn = vi.fn();
    const u = await show(Role.MEMBER, signIn);

    await saveUsername(u, '  new   name  ');

    expect(await screen.findByText('Username updated.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'new name' })).toBeInTheDocument();
    expect(usernameInput()).toHaveValue('new name');
    expect(signIn).toHaveBeenCalledWith({
      id: 'test-user',
      email: 'member@mock.dev',
      role: Role.MEMBER,
      username: 'new name',
    });
  });

  it("shows the API's message when somebody else has the name, ignoring case", async () => {
    const signIn = vi.fn();
    const other = db.users.find((u) => u.id !== 'test-user')?.username ?? '';
    const u = await show(Role.MEMBER, signIn);

    await saveUsername(u, other.toUpperCase());

    expect(await screen.findByRole('alert')).toHaveTextContent('Username already taken');
    expect(screen.queryByText('Username updated.')).not.toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('Profile password form', () => {
  it('asks for every field', async () => {
    const u = await show();

    await u.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Enter your current password')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('refuses a weak new password', async () => {
    const u = await show();

    await changePassword(u, 'Password123!', 'onlyletters', 'onlyletters');

    expect(
      await screen.findByText('Password must contain a letter and a number'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Password updated.')).not.toBeInTheDocument();
  });

  it('refuses when the confirmation does not match', async () => {
    const u = await show();

    await changePassword(u, 'Password123!', 'newpass99', 'newpass98');

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.queryByText('Password updated.')).not.toBeInTheDocument();
  });

  it('refuses a new password equal to the current one', async () => {
    const u = await show();

    await changePassword(u, 'Password123!', 'Password123!', 'Password123!');

    expect(
      await screen.findByText('Choose a password different from your current one'),
    ).toBeInTheDocument();
  });

  it("shows the API's message for a wrong current password and keeps what was typed", async () => {
    const u = await show();

    await changePassword(u, 'wrongpass1', 'newpass99', 'newpass99');

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
    expect(screen.getByLabelText('New password')).toHaveValue('newpass99');
  });

  it('updates the password, clears the fields, and the new one is then the current one', async () => {
    const u = await show();

    await changePassword(u, 'Password123!', 'newpass99', 'newpass99');

    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');

    await changePassword(u, 'newpass99', 'another123', 'another123');

    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
  });
});

describe('Profile activity', () => {
  it('shows how many titles are on each list', async () => {
    await show();

    expect(await screen.findByRole('heading', { name: 'Your activity' })).toBeInTheDocument();
    // The mock data puts 4 of its 12 entries on each list
    expect(screen.getAllByText('4')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'View completed in My Lists' })).toHaveAttribute(
      'href',
      '/me/lists',
    );
  });
});
