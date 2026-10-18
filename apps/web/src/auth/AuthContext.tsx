import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { authApi } from '../api/auth.js';
import { setUnauthorizedHandler } from '../api/client.js';
import { setMockActor } from '../mocks/db.js';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** True after a 401 cleared the session mid-use; lets forms keep drafts and show a login prompt. */
  sessionExpired: boolean;
  signIn: (user: AuthUser) => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Mock API writes (reviews, comments, submissions) are attributed to whoever is signed in. */
function useMockActor(user: AuthUser | null) {
  useEffect(() => {
    setMockActor(user);
  }, [user]);
}

/** Test helper: provides a fixed auth state and never calls /auth/me. */
export function AuthTestProvider({
  user,
  signIn = () => undefined,
  children,
}: {
  user: AuthUser | null;
  signIn?: (user: AuthUser) => void;
  children: ReactNode;
}) {
  useMockActor(user);
  const value: AuthContextValue = {
    user,
    status: user ? 'authenticated' : 'anonymous',
    sessionExpired: false,
    signIn,
    signOut: () => Promise.resolve(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Dev-only: set VITE_MOCK_ROLE=ADMIN|CREATOR|CONSUMER to skip the backend while building UI. */
function mockUser(): AuthUser | null {
  const role = import.meta.env.DEV ? import.meta.env.VITE_MOCK_ROLE : undefined;
  if (!role || !Object.values(Role).includes(role)) return null;
  return { id: 'mock-user', email: `${role.toLowerCase()}@mock.dev`, role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [sessionExpired, setSessionExpired] = useState(false);
  useMockActor(user);

  // Restore the session on page load (TASKS.md section 3: GET /auth/me)
  useEffect(() => {
    const mocked = mockUser();
    if (mocked) {
      setUser(mocked);
      setStatus('authenticated');
      return;
    }
    authApi
      .me()
      .then((me) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => setStatus('anonymous'));
  }, []);

  // Any 401 from a non-auth endpoint means the 2h token expired
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
      setSessionExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback((next: AuthUser) => {
    setUser(next);
    setStatus('authenticated');
    setSessionExpired(false);
  }, []);

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    setUser(null);
    setStatus('anonymous');
    setSessionExpired(false);
  }, []);

  const value = useMemo(
    () => ({ user, status, sessionExpired, signIn, signOut }),
    [user, status, sessionExpired, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
