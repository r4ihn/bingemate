import { Link } from 'react-router-dom';
import { MediaType } from '@bingemate/shared';
import { titlesApi } from '../api/titles.js';
import { useAsync } from '../hooks/useAsync.js';
import { MEDIA_LABEL } from '../labels.js';
import { PosterCard } from './PosterCard.js';
import { StateMessage } from './StateMessage.js';

const RAIL_SIZE = 8;

const RAILS = [
  { type: MediaType.MOVIE, name: 'Movies' },
  { type: MediaType.TV_SHOW, name: 'TV' },
  { type: MediaType.BOOK, name: 'Books' },
] as const;

function Rail({ type, name }: (typeof RAILS)[number]) {
  const { state, reload } = useAsync(() => titlesApi.search({ type, pageSize: RAIL_SIZE }), [type]);
  const heading = `rail-${type}`;

  return (
    <section aria-labelledby={heading} className="min-w-0">
      <div className="flex items-baseline justify-between">
        <h2 id={heading} className="text-xl font-semibold tracking-tight">
          {name}
        </h2>
        <Link to={`/browse?type=${type}`} className="text-sm text-accent">
          See all
          <span className="sr-only"> {name}</span> →
        </Link>
      </div>
      {state.status === 'loading' && <StateMessage kind="loading" />}
      {state.status === 'error' && (
        <StateMessage kind="error" detail={`${name} could not be loaded.`} onRetry={reload} />
      )}
      {state.status === 'ready' && (
        <ul className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {state.data.items.map((t) => (
            <li key={t.id} className="w-[150px] flex-none">
              <PosterCard title={t}>
                <p className="text-xs text-muted">{MEDIA_LABEL[t.mediaType]}</p>
              </PosterCard>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Home rails: the first approved titles of each media type, with a link into Browse for the rest. */
export function TypeRails() {
  return (
    <div className="mx-auto grid max-w-[1280px] gap-12 px-8 py-16 md:px-16">
      {RAILS.map((r) => (
        <Rail key={r.type} {...r} />
      ))}
    </div>
  );
}
