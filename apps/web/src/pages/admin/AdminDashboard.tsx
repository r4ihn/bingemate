import { NavLink, Outlet } from 'react-router-dom';

const LINKS = [
  { to: 'queue', label: 'Approval queue' },
  { to: 'users', label: 'Users' },
  { to: 'moderation', label: 'Moderation' },
];

export function AdminDashboard() {
  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-tight">Admin</h1>
      <nav aria-label="Admin" className="mt-6 flex flex-wrap gap-2">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `rounded-full border px-[18px] py-2 text-[0.85rem] transition-colors ${
                isActive
                  ? 'border-white bg-white text-black'
                  : 'border-line text-muted hover:border-white hover:text-white'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-8">
        <Outlet />
      </div>
    </section>
  );
}
