import type { AuthUser, LoginRequest, RegisterRequest } from '@bingemate/shared';
import { apiFetch } from './client.js';

// Endpoint shapes follow TASKS.md section 3; confirm the /auth/me response with RA.
export const authApi = {
  me: () => apiFetch<AuthUser>('/auth/me'),
  login: (body: LoginRequest) =>
    apiFetch<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: RegisterRequest) =>
    apiFetch<AuthUser>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
};
