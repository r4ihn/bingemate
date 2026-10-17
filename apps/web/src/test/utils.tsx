import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AuthUser, Role } from '@bingemate/shared';
import { AuthTestProvider } from '../auth/AuthContext.js';

/** Renders inside a MemoryRouter and a fixed auth state (anonymous unless `role` is given). */
export function renderWithProviders(
  ui: ReactElement,
  opts: {
    role?: Role;
    route?: string;
    state?: unknown;
    signIn?: (user: AuthUser) => void;
  } = {},
): RenderResult {
  const user = opts.role
    ? { id: 'test-user', email: `${opts.role.toLowerCase()}@test.dev`, role: opts.role }
    : null;
  return render(
    <AuthTestProvider user={user} signIn={opts.signIn}>
      <MemoryRouter initialEntries={[{ pathname: opts.route ?? '/', state: opts.state }]}>
        {ui}
      </MemoryRouter>
    </AuthTestProvider>,
  );
}
