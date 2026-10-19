import type { ReactNode } from 'react';
import type { Role } from '@bingemate/shared';
import { useAuth } from './AuthContext.js';

/** Hides UI the current role cannot use. The backend still enforces every permission. */
export function RoleGate({
  roles,
  children,
  fallback = null,
}: {
  roles: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user } = useAuth();
  return <>{user && roles.includes(user.role) ? children : fallback}</>;
}
