import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import { renderWithProviders } from '../test/utils.js';
import { ProtectedRoute } from './ProtectedRoute.js';
import { RoleGate } from './RoleGate.js';

function routes() {
  return (
    <Routes>
      <Route path="/login" element={<p>login page</p>} />
      <Route path="/forbidden" element={<p>forbidden page</p>} />
      <Route element={<ProtectedRoute roles={[Role.ADMIN]} />}>
        <Route path="/admin" element={<p>admin page</p>} />
      </Route>
    </Routes>
  );
}

describe('ProtectedRoute', () => {
  it('redirects anonymous users to /login', () => {
    renderWithProviders(routes(), { route: '/admin' });
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('sends a CONSUMER to /forbidden when roles=[ADMIN]', () => {
    renderWithProviders(routes(), { route: '/admin', role: Role.CONSUMER });
    expect(screen.getByText('forbidden page')).toBeInTheDocument();
  });

  it('lets an ADMIN through', () => {
    renderWithProviders(routes(), { route: '/admin', role: Role.ADMIN });
    expect(screen.getByText('admin page')).toBeInTheDocument();
  });
});

describe('RoleGate', () => {
  it('renders children for an allowed role and the fallback otherwise', () => {
    const gate = (
      <RoleGate roles={[Role.CREATOR]} fallback={<span>nope</span>}>
        <span>creator tools</span>
      </RoleGate>
    );
    const allowed = renderWithProviders(gate, { role: Role.CREATOR });
    expect(screen.getByText('creator tools')).toBeInTheDocument();
    allowed.unmount();

    renderWithProviders(gate, { role: Role.CONSUMER });
    expect(screen.getByText('nope')).toBeInTheDocument();
    expect(screen.queryByText('creator tools')).not.toBeInTheDocument();
  });
});
