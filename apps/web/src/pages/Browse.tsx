import { useSearchParams } from 'react-router-dom';
import { MediaType } from '@bingemate/shared';
import { titlesApi } from '../api/titles.js';
import { FilterPill } from '../components/FilterPill.js';
import { Pagination } from '../components/Pagination.js';
import { PosterCard } from '../components/PosterCard.js';
import { StateMessage } from '../components/StateMessage.js';
import { useAsync } from '../hooks/useAsync.js';
import { MEDIA_FILTERS, MEDIA_LABEL } from '../labels.js';

const PAGE_SIZE = 15;

const isMediaType = (v: string | null): v is MediaType =>
  v !== null && (Object.values(MediaType) as string[]).includes(v);

/** The URL is the state (?q, ?type, ?page), so back, refresh and shared links all work. */
export function Browse() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const typeParam = params.get('type');
  const type = isMediaType(typeParam) ? typeParam : undefined;
  const pageParam = Number(params.get('page'));
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

  const { state, reload } = useAsync(
    () => titlesApi.search({ q, type, page, pageSize: PAGE_SIZE }),
    [q, type, page],
  );

  function update(next: { type?: MediaType | undefined; page?: number }) {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    const t = 'type' in next ? next.type : type;
    if (t) p.set('type', t);
    if (next.page && next.page > 1) p.set('page', String(next.page));
    setParams(p);
  }

  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-tight">
        {q ? `Results for “${q}”` : 'Browse'}
      </h1>
      {state.status === 'ready' && (
        <p className="mt-2 text-muted">
          {state.data.total} {state.data.total === 1 ? 'title' : 'titles'}
        </p>
      )}

      <nav aria-label="Media type" className="mt-6 flex flex-wrap gap-2">
        {MEDIA_FILTERS.map((p) => (
          <FilterPill
            key={p.label}
            active={type === p.value}
            onClick={() => {
              if (p.value !== type) update({ type: p.value });
            }}
          >
            {p.label}
          </FilterPill>
        ))}
      </nav>

      <div className="mt-8">
        {state.status === 'loading' && <StateMessage kind="loading" />}
        {state.status === 'error' && (
          <StateMessage kind="error" detail="Titles could not be loaded." onRetry={reload} />
        )}
        {state.status === 'ready' &&
          (state.data.items.length === 0 ? (
            <StateMessage
              kind="empty"
              title={q ? `No titles match “${q}”` : 'No titles yet'}
              detail="Try a different spelling or another media type."
            />
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
                {state.data.items.map((t) => (
                  <li key={t.id}>
                    <PosterCard title={t}>
                      <p className="text-xs text-muted">{MEDIA_LABEL[t.mediaType]}</p>
                    </PosterCard>
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={state.data.total}
                onChange={(next) => update({ page: next })}
              />
            </>
          ))}
      </div>
    </section>
  );
}
