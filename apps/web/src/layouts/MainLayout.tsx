import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import { useAuth } from '../auth/AuthContext.js';
import { RoleGate } from '../auth/RoleGate.js';

const textLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2.5 text-[0.8rem] transition-colors hover:bg-white/10 hover:text-white ${
    isActive ? 'bg-white/10 text-white' : 'text-white/70'
  }`;

const iconBtn =
  'flex h-[46px] w-[54px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[10px] bg-white/[0.06] text-[0.5rem] text-white/60 transition-colors hover:bg-white/15';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] fill-white" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function IconLink({ to, label, d }: { to: string; label: string; d: ReactNode }) {
  return (
    <Link to={to} className={iconBtn}>
      {d}
      {label}
    </Link>
  );
}

export function MainLayout() {
  const { user, status, signOut } = useAuth();
  const { pathname } = useLocation();
  const fullBleed = pathname === '/' || pathname.startsWith('/titles/');

  return (
    <>
      <header className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 gap-2 rounded-[14px] border border-line bg-dock p-1.5 backdrop-blur-md">
        <Link
          to="/"
          className="flex h-[46px] items-center rounded-[10px] bg-accent px-[18px] text-[1.05rem] font-bold tracking-tight text-accent-ink"
        >
          BingeMate
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 px-2 md:flex">
          <NavLink to="/browse" className={textLink}>
            Browse
          </NavLink>
          {user && (
            <NavLink to="/me/lists" className={textLink}>
              My Lists
            </NavLink>
          )}
          <RoleGate roles={[Role.CREATOR, Role.ADMIN]}>
            <NavLink to="/creator" className={textLink}>
              Creator
            </NavLink>
          </RoleGate>
          <RoleGate roles={[Role.ADMIN]}>
            <NavLink to="/admin" className={textLink}>
              Admin
            </NavLink>
          </RoleGate>
        </nav>

        <div className="flex gap-1.5">
          <IconLink to="/me/lists" label="Save" d={<Icon d="M6 2h12v20l-6-4-6 4z" />} />
          <IconLink
            to="/browse"
            label="Search"
            d={
              <Icon d="M10 2a8 8 0 105 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z" />
            }
          />
          {status === 'loading' ? null : user ? (
            <button type="button" className={iconBtn} onClick={() => void signOut()}>
              <Icon d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
              Log out
            </button>
          ) : (
            <IconLink
              to="/login"
              label="Sign in"
              d={
                <Icon d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
              }
            />
          )}
        </div>
      </header>

      <main className={fullBleed ? undefined : 'mx-auto max-w-[1100px] px-8 pt-32 pb-16'}>
        <Outlet />
      </main>
    </>
  );
}
