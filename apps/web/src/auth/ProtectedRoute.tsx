import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@bingemate/shared';
import { useAuth } from './AuthContext.js';

/** Route guard. UX only: the API enforces the same rules with authenticate/authorize. */
export function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <p role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}
