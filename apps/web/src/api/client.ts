const BASE = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** AuthContext registers here so any 401 clears the session and sends the user to login. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const error = body as Record<string, unknown>;
  if (error.error === 'ValidationError') {
    const details = error.details;
    if (details && typeof details === 'object') {
      const { formErrors, fieldErrors } = details as Record<string, unknown>;
      if (Array.isArray(formErrors) && typeof formErrors[0] === 'string') return formErrors[0];
      if (fieldErrors && typeof fieldErrors === 'object') {
        for (const messages of Object.values(fieldErrors)) {
          if (Array.isArray(messages) && typeof messages[0] === 'string') return messages[0];
        }
      }
    }
    return 'Please check what you entered';
  }
  if (typeof error.error === 'string') return error.error;
  return typeof error.message === 'string' ? error.message : fallback;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    // /auth/me and /auth/login 401s are expected states, not session expiry
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.();
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, errorMessage(body, res.statusText));
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
