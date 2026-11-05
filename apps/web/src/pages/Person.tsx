import { useParams } from 'react-router-dom';
import { peopleApi } from '../api/people.js';
import { ApiError } from '../api/client.js';
import { ConnectionFinder } from '../components/ConnectionFinder.js';
import { PosterCard } from '../components/PosterCard.js';
import { StateMessage } from '../components/StateMessage.js';
import { useAsync } from '../hooks/useAsync.js';
import { ROLE_LABEL } from '../labels.js';
import { NotFound } from './NotFound.js';
import { TitleStatus } from '@bingemate/shared';

/** A person's credits, newest first, and the "How are they connected?" finder. */
export function Person() {
  const { id = '' } = useParams();
  const { state, reload } = useAsync(() => peopleApi.get(id), [id]);

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return state.error instanceof ApiError && state.error.status === 404 ? (
      <NotFound />
    ) : (
      <StateMessage kind="error" detail="This person could not be loaded." onRetry={reload} />
    );
  }

  const person = state.data;
  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{person.name}</h1>
      <p className="mt-3 text-muted">
        {person.credits.length} {person.credits.length === 1 ? 'title' : 'titles'}
      </p>

      {person.credits.length > 0 && (
        <ul
          aria-label="Credits"
          className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-5"
        >
          {person.credits.map((c) => (
            <li key={c.id}>
              <PosterCard
                title={{
                  id: c.id,
                  name: c.name,
                  mediaType: c.mediaType,
                  status: TitleStatus.APPROVED,
                  avgRating: 0,
                  reviewCount: 0,
                  ...(c.posterUrl && { posterUrl: c.posterUrl }),
                  ...(c.releaseYear !== null && { year: c.releaseYear }),
                }}
              >
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted">
                  {[c.releaseYear, c.roles.map((r) => ROLE_LABEL[r]).join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </PosterCard>
            </li>
          ))}
        </ul>
      )}

      <ConnectionFinder from={person} />
    </section>
  );
}
