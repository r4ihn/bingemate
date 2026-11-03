import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MediaType } from '@bingemate/shared';
import { genresApi } from '../api/genres.js';
import { inputClass } from '../components/ui/inputClass.js';
import { TITLE_SORTS, type TitleSort, titlesApi } from '../api/titles.js';
import { FilterPill } from '../components/FilterPill.js';
import { Pagination } from '../components/Pagination.js';
import { PosterCard } from '../components/PosterCard.js';
import { StateMessage } from '../components/StateMessage.js';
import { useAsync } from '../hooks/useAsync.js';
import { MEDIA_FILTERS, MEDIA_LABEL } from '../labels.js';

const PAGE_SIZE = 15;

const isMediaType = (v: string | null): v is MediaType =>
  v !== null && (Object.values(MediaType) as string[]).includes(v);

/** The URL is the state (?q, ?type, ?genre, ?sort, ?page), so back, refresh and shared links all work. */
export function Browse() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const typeParam = params.get('type');
  const type = isMediaType(typeParam) ? typeParam : undefined;
  const genre = params.get('genre') || undefined;
  const sortParam = params.get('sort');
  const sort = TITLE_SORTS.find((value) => value === sortParam);
  const genres = useAsync(async () => ({ type, options: await genresApi.list(type) }), [type]);
  const genreOptions =
    genres.state.status === 'ready' && genres.state.data.type === type
      ? genres.state.data.options
      : [];
  const genresReady = genres.state.status === 'ready' && genres.state.data.type === type;
  const pageParam = Number(params.get('page'));
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1;

  const { state, reload, refreshing } = useAsync(
    () => titlesApi.search({ q, type, genre, sort, page, pageSize: PAGE_SIZE }),
    [q, type, genre, sort, page],
    { keepPrevious: true }, // keeps focus on the Pagination button while the next page loads
  );

  // A stale link (?page=99) lands on the last page instead of an empty grid
  const outOfRange =
    state.status === 'ready' && state.data.items.length === 0 && state.data.total > 0 && page > 1;
  useEffect(() => {
    if (outOfRange && state.status === 'ready') {
      update({ page: Math.ceil(state.data.total / PAGE_SIZE) }, true);
    }
  }, [outOfRange]);

  useEffect(() => {
    if (
      genresReady &&
      genre &&
      !genreOptions.some((option) => option.name.toLowerCase() === genre.toLowerCase())
    ) {
      update({ genre: undefined }, true);
    }
  }, [genresReady, genres.state, genre]);

  function update(
    next: {
      type?: MediaType | undefined;
      genre?: string | undefined;
      sort?: TitleSort | undefined;
      page?: number;
    },
    replace = false,
  ) {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    const t = 'type' in next ? next.type : type;
    if (t) p.set('type', t);
    const g = 'genre' in next ? next.genre : genre;
    if (g) p.set('genre', g);
    const s = 'sort' in next ? next.sort : sort;
    if (s) p.set('sort', s);
    if (next.page && next.page > 1) p.set('page', String(next.page));
    setParams(p, { replace });
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

      <div className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2 lg:max-w-xl">
        <div className="grid min-w-0 gap-2">
          <label htmlFor="browse-genre" className="text-sm text-muted">
            Genre
          </label>
          <select
            id="browse-genre"
            className={`${inputClass} min-w-0 w-full`}
            value={
              genreOptions.find((option) => option.name.toLowerCase() === genre?.toLowerCase())
                ?.name ?? ''
            }
            disabled={!genresReady}
            onChange={(event) => update({ genre: event.target.value || undefined })}
          >
            <option value="">All genres</option>
            {genreOptions.map((option) => (
              <option key={option.id} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid min-w-0 gap-2">
          <label htmlFor="browse-sort" className="text-sm text-muted">
            Sort
          </label>
          <select
            id="browse-sort"
            className={`${inputClass} min-w-0 w-full`}
            value={sort ?? 'name'}
            onChange={(event) =>
              update({ sort: TITLE_SORTS.find((value) => value === event.target.value) })
            }
          >
            <option value="name">Name</option>
            <option value="rating">Top rated</option>
            <option value="year">Newest</option>
            <option value="reviews">Most reviewed</option>
          </select>
        </div>
      </div>
      {genres.state.status === 'loading' && <StateMessage kind="loading" title="Loading genres…" />}
      {genres.state.status === 'error' && (
        <StateMessage kind="error" detail="Genres could not be loaded." onRetry={genres.reload} />
      )}

      <div className="mt-8">
        {state.status === 'loading' && <StateMessage kind="loading" />}
        {state.status === 'error' && (
          <StateMessage kind="error" detail="Titles could not be loaded." onRetry={reload} />
        )}
        {outOfRange && <StateMessage kind="loading" />}
        {state.status === 'ready' &&
          !outOfRange &&
          (state.data.items.length === 0 ? (
            <StateMessage
              kind="empty"
              title={q ? `No titles match “${q}”` : 'No titles yet'}
              detail="Try a different spelling or another media type."
            />
          ) : (
            <>
              <ul
                aria-busy={refreshing}
                className={`grid grid-cols-2 gap-5 transition-opacity sm:grid-cols-3 lg:grid-cols-5 ${
                  refreshing ? 'opacity-60' : ''
                }`}
              >
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
