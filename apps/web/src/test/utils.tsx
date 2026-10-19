import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
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
  const { pathname, search } = new URL(opts.route ?? '/', 'http://localhost');
  return render(
    <AuthTestProvider user={user} signIn={opts.signIn}>
      <MemoryRouter initialEntries={[{ pathname, search, state: opts.state }]}>{ui}</MemoryRouter>
    </AuthTestProvider>,
  );
}

/** Clicks the n-star radio of the review form's star rating. */
export async function rate(user: ReturnType<typeof userEvent.setup>, n: number): Promise<void> {
  await user.click(screen.getByRole('radio', { name: `${n} ${n === 1 ? 'star' : 'stars'}` }));
}
