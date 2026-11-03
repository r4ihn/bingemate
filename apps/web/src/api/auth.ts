import { normalizeUsername, usernameError, Role } from '@bingemate/shared';
import { db, newId } from '../mocks/db.js';
import { clone, delay, useMock } from './mockMode.js';
import type { AuthUser, LoginRequest, RegisterRequest } from '@bingemate/shared';
import { ApiError, apiFetch } from './client.js';

// Endpoint shapes follow TASKS.md section 3; confirm the /auth/me response with RA.
export const authApi = {
  me: () => apiFetch<AuthUser>('/auth/me'),
  login: (body: LoginRequest) =>
    apiFetch<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  async register(body: RegisterRequest): Promise<AuthUser> {
    if (!useMock)
      return apiFetch<AuthUser>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
    await delay();
    const error = usernameError(body.username);
    if (error) throw new ApiError(400, error);
    const username = normalizeUsername(body.username);
    if (db.users.some((user) => user.email.toLowerCase() === body.email.toLowerCase())) {
      throw new ApiError(409, 'Email already in use');
    }
    if (db.users.some((user) => user.username?.toLowerCase() === username.toLowerCase())) {
      throw new ApiError(409, 'Username already taken');
    }
    const user: AuthUser = { id: newId('user'), email: body.email, username, role: Role.MEMBER };
    db.users.push(user);
    return clone(user);
  },
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
};
