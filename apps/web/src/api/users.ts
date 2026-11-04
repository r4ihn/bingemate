import { normalizeUsername, passwordProblem, usernameError } from '@bingemate/shared';
import type { ChangePasswordRequest, ProfileDTO, UpdateUsernameRequest } from '@bingemate/shared';
import { db, getMockActor } from '../mocks/db.js';
import { ApiError, apiFetch } from './client.js';
import { clone, delay, useMock } from './mockMode.js';

// Mock accounts. The demo password is the one the seeded demo accounts use.
const MOCK_PASSWORD = 'Password123!';
interface MockAccount {
  username: string;
  password: string;
}
const accounts = new Map<string, MockAccount>();

/** Restores the mock accounts; tests call this next to `resetDb()`. */
export function resetMockProfiles(): void {
  accounts.clear();
}

function mockAccount(): MockAccount {
  const actor = getMockActor();
  let account = accounts.get(actor.id);
  if (!account) {
    const listed = db.users.find((u) => u.id === actor.id)?.username;
    account = { username: listed ?? actor.name, password: MOCK_PASSWORD };
    accounts.set(actor.id, account);
  }
  return account;
}

function mockProfile(): ProfileDTO {
  const actor = getMockActor();
  return {
    id: actor.id,
    email: `${actor.name}@mock.dev`,
    username: mockAccount().username,
    role: actor.role,
    createdAt: '2026-10-12T00:00:00.000Z',
  };
}

export const usersApi = {
  /** The signed-in user's own profile. */
  async me(): Promise<ProfileDTO> {
    if (!useMock) return apiFetch<ProfileDTO>('/users/me');
    await delay();
    return clone(mockProfile());
  },

  async updateUsername(username: string): Promise<ProfileDTO> {
    if (!useMock) {
      const body: UpdateUsernameRequest = { username };
      return apiFetch<ProfileDTO>('/users/me', { method: 'PATCH', body: JSON.stringify(body) });
    }
    await delay();
    const error = usernameError(username);
    if (error) throw new ApiError(400, error);
    const name = normalizeUsername(username);
    const actor = getMockActor();
    // Same rule as the API: somebody else's name, ignoring case
    const lower = name.toLowerCase();
    const taken =
      db.users.some((u) => u.id !== actor.id && u.username?.toLowerCase() === lower) ||
      db.reviews.some((r) => r.author.id !== actor.id && r.author.name.toLowerCase() === lower);
    if (taken) throw new ApiError(409, 'Username already taken');
    mockAccount().username = name;
    const listed = db.users.find((u) => u.id === actor.id);
    if (listed) listed.username = name;
    return clone(mockProfile());
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!useMock) {
      const body: ChangePasswordRequest = { currentPassword, newPassword };
      return apiFetch<void>('/users/me/password', { method: 'PATCH', body: JSON.stringify(body) });
    }
    await delay();
    const account = mockAccount();
    // 400, not 401: a 401 would sign the person out as if the session had expired
    if (currentPassword !== account.password) {
      throw new ApiError(400, 'Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new ApiError(400, 'Choose a password different from your current one');
    }
    const problem = passwordProblem(newPassword);
    if (problem) throw new ApiError(400, problem);
    account.password = newPassword;
  },
};
