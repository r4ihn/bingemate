import { Link } from 'react-router-dom';
import type { PersonRole, TitlePersonDTO } from '@bingemate/shared';
import { ROLE_LABEL } from '../labels.js';

const ROLE_ORDER: PersonRole[] = ['DIRECTOR', 'SHOWRUNNER', 'AUTHOR', 'WRITER', 'ACTOR'];

/** Cast and crew of a title, one chip per person with all their roles. Each links to /people/:id. */
export function TitleCredits({ people }: { people: TitlePersonDTO[] }) {
  if (people.length === 0) return null;

  const byPerson = new Map<string, { id: string; name: string; roles: PersonRole[] }>();
  for (const p of people) {
    const seen = byPerson.get(p.id);
    if (seen) seen.roles.push(p.role);
    else byPerson.set(p.id, { id: p.id, name: p.name, roles: [p.role] });
  }
  const rank = (roles: PersonRole[]) => Math.min(...roles.map((r) => ROLE_ORDER.indexOf(r)));
  const credits = [...byPerson.values()]
    .map((c) => ({
      ...c,
      roles: [...c.roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)),
    }))
    .sort((a, b) => rank(a.roles) - rank(b.roles) || a.name.localeCompare(b.name));

  return (
    <section
      aria-labelledby="credits-heading"
      className="mx-auto max-w-[1100px] border-t border-line px-6 py-8 sm:px-8 sm:py-12"
    >
      <h2 id="credits-heading" className="mb-6 text-2xl font-semibold tracking-tight">
        Cast &amp; crew
      </h2>
      <ul className="flex flex-wrap gap-3">
        {credits.map((c) => (
          <li key={c.id}>
            <Link
              to={`/people/${c.id}`}
              className="inline-flex flex-col rounded-xl border border-line px-4 py-2.5 transition-colors hover:border-white focus-visible:border-white"
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted">
                {c.roles.map((r) => ROLE_LABEL[r]).join(', ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
