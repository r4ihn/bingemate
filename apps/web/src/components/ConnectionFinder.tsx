import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ConnectionDTO, PersonSummaryDTO } from '@bingemate/shared';
import { peopleApi } from '../api/people.js';
import { MEDIA_LABEL } from '../labels.js';
import { Field } from './ui/Field.js';
import { inputClass } from './ui/inputClass.js';

type Result =
  | { status: 'idle' }
  | { status: 'loading'; other: PersonSummaryDTO }
  | { status: 'ready'; other: PersonSummaryDTO; data: ConnectionDTO }
  | { status: 'error'; other: PersonSummaryDTO };

/**
 * "How are they connected?": pick a second person and show the shortest chain of shared titles,
 * which the API finds with a breadth-first search in a recursive SQL query.
 */
export function ConnectionFinder({ from }: { from: { id: string; name: string } }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<PersonSummaryDTO[]>([]);
  const [result, setResult] = useState<Result>({ status: 'idle' });

  // Search as the user types, ignoring answers to an older query.
  useEffect(() => {
    let current = true;
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      peopleApi
        .search(query)
        .then((people) => current && setMatches(people.filter((p) => p.id !== from.id)))
        .catch(() => current && setMatches([]));
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, from.id]);

  // A new page (another person) starts over.
  useEffect(() => {
    setQuery('');
    setResult({ status: 'idle' });
  }, [from.id]);

  const pick = (other: PersonSummaryDTO) => {
    setMatches([]);
    setQuery(other.name);
    setResult({ status: 'loading', other });
    peopleApi.connection(from.id, other.id).then(
      (data) => setResult({ status: 'ready', other, data }),
      () => setResult({ status: 'error', other }),
    );
  };

  return (
    <section
      aria-labelledby="connection-heading"
      className="mt-12 rounded-2xl border border-line p-6 sm:p-8"
    >
      <h2 id="connection-heading" className="text-2xl font-semibold tracking-tight">
        How are they connected?
      </h2>
      <p className="mt-2 text-sm text-muted">
        Pick anyone else and we&apos;ll find the shortest chain of shared titles back to {from.name}
        .
      </p>

      <div className="relative mt-6 max-w-md">
        <Field label="Another person">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a name"
            autoComplete="off"
            className={inputClass}
          />
        </Field>
        {matches.length > 0 && (
          <ul
            aria-label="Matching people"
            className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-line bg-bg"
          >
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => pick(p)}
                  className="flex w-full cursor-pointer justify-between gap-4 px-4 py-2.5 text-left hover:bg-white/5 focus-visible:bg-white/5"
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-muted">
                    {p.titleCount} {p.titleCount === 1 ? 'title' : 'titles'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div aria-live="polite" className="mt-8">
        {result.status === 'loading' && (
          <p className="text-muted">Searching for a link to {result.other.name}…</p>
        )}
        {result.status === 'error' && (
          <p role="alert" className="text-danger">
            Could not look up the connection. Please try again.
          </p>
        )}
        {result.status === 'ready' && <Chain data={result.data} other={result.other} />}
      </div>
    </section>
  );
}

function Chain({ data, other }: { data: ConnectionDTO; other: PersonSummaryDTO }) {
  if (!data.path) {
    return (
      <p className="text-muted">
        No link to {other.name} within {data.maxDepth} steps.
      </p>
    );
  }
  return (
    <>
      <p className="text-lg">
        <strong className="text-3xl font-semibold tracking-tight">{data.degrees}</strong>{' '}
        {data.degrees === 1 ? 'degree' : 'degrees'} of separation
      </p>
      <ol aria-label="Connection" className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-4">
        {data.path.map((step, i) => (
          <Fragment key={step.person.id}>
            {step.via && (
              <li className="flex items-center gap-3 text-sm text-muted">
                <span aria-hidden="true">→</span>
                <Link
                  to={`/titles/${step.via.id}`}
                  className="underline underline-offset-4 hover:text-white"
                >
                  {step.via.name}
                </Link>
                <span className="sr-only">({MEDIA_LABEL[step.via.mediaType]})</span>
                <span aria-hidden="true">→</span>
              </li>
            )}
            <li>
              <Link
                to={`/people/${step.person.id}`}
                className={`inline-block rounded-full border px-4 py-2 font-medium ${
                  i === 0 || i === data.path!.length - 1 ? 'border-white' : 'border-line'
                }`}
              >
                {step.person.name}
              </Link>
            </li>
          </Fragment>
        ))}
      </ol>
    </>
  );
}
