import { useRef } from 'react';
import { useAuth } from './AuthContext.js';

/**
 * Whether the write form for `scope` (a title or a review) should be on screen.
 * Signed-in users get it. After a 401 clears the session mid-use, only the form the user was already
 * on keeps showing (so its draft and the "session expired" message survive); any other title or
 * review shows the login prompt instead of a form that is bound to fail.
 */
export function useCanWrite(scope: string): boolean {
  const { user, sessionExpired } = useAuth();
  const signedInOn = useRef<string | null>(null);
  if (user) signedInOn.current = scope;
  else if (signedInOn.current !== scope) signedInOn.current = null;
  return user !== null || (sessionExpired && signedInOn.current === scope);
}
