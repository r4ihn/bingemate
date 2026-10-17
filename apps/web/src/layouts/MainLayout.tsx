import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { useAuth } from '../auth/AuthContext.js';
import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { NavSearch } from '../components/NavSearch.js';

const textLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2.5 text-[0.8rem] transition-colors hover:bg-white/10 hover:text-white ${
    isActive ? 'bg-white/10 text-white' : 'text-white/70'
  }`;

const iconBtn =
  'flex h-[46px] w-[54px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[10px] bg-white/[0.06] text-[0.5rem] text-white/60 transition-colors hover:bg-white/15';

const PERSON = 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z';

/** Links shown for this user. Hiding is UX only; the API enforces roles. */
function navLinks(user: AuthUser | null) {
  const links = [{ to: '/browse', label: 'Browse' }];
  if (user) links.push({ to: '/me/lists', label: 'My Lists' });
  if (user && (user.role === Role.CREATOR || user.role === Role.ADMIN)) {
    links.push({ to: '/creator', label: 'Creator' });
  }
  if (user?.role === Role.ADMIN) links.push({ to: '/admin', label: 'Admin' });
  return links;
}

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
  const [menuOpen, setMenuOpen] = useState(false);
  const links = navLinks(user);

  // Close the mobile menu after navigating, and on Escape
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-ink"
      >
        Skip to content
      </a>

      <header className="fixed top-4 left-1/2 z-50 flex -translate-x-1/2 gap-2 rounded-[14px] border border-line bg-dock p-1.5 backdrop-blur-md">
        <Link
          to="/"
          className="flex h-[46px] items-center rounded-[10px] bg-accent px-[18px] text-[1.05rem] font-bold tracking-tight text-accent-ink"
        >
          BingeMate
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 px-2 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={textLink}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
          className={`${iconBtn} md:hidden`}
        >
          <Icon d="M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z" />
          Menu
        </button>

        <div className="flex gap-1.5">
          <IconLink to="/me/lists" label="Save" d={<Icon d="M6 2h12v20l-6-4-6 4z" />} />
          <NavSearch />
          {status === 'loading' ? null : user ? (
            <button type="button" className={iconBtn} onClick={() => void signOut()}>
              <Icon d={PERSON} />
              Log out
            </button>
          ) : (
            <IconLink to="/login" label="Sign in" d={<Icon d={PERSON} />} />
          )}
        </div>

        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="Mobile menu"
            className="absolute top-full right-0 left-0 mt-2 grid gap-1 rounded-[14px] border border-line bg-dock p-2 backdrop-blur-md md:hidden"
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={textLink}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main
        id="main"
        tabIndex={-1}
        className={fullBleed ? undefined : 'mx-auto max-w-[1100px] px-8 pt-32 pb-16'}
      >
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </>
  );
}
