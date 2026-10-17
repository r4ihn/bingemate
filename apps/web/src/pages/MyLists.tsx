import { useState } from 'react';
import { ListStatus, MediaType } from '@bingemate/shared';
import { listsApi } from '../api/lists.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { FilterPill } from '../components/FilterPill.js';
import { Pagination } from '../components/Pagination.js';
import { PosterCard } from '../components/PosterCard.js';
import { StateMessage } from '../components/StateMessage.js';
import { inputClass } from '../components/ui/inputClass.js';
import { useAsync } from '../hooks/useAsync.js';
import type { ListItem } from '../types/list.js';

const TABS: { status: ListStatus; label: string }[] = [
  { status: ListStatus.COMPLETED, label: 'Completed' },
  { status: ListStatus.IN_PROGRESS, label: 'In progress' },
  { status: ListStatus.PLAN_TO, label: 'Plan to' },
];

const MEDIA: { value: MediaType | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: MediaType.MOVIE, label: 'Movies' },
  { value: MediaType.BOOK, label: 'Books' },
  { value: MediaType.TV_SHOW, label: 'TV shows' },
];

export function MyLists() {
  const [status, setStatus] = useState<ListStatus>(ListStatus.COMPLETED);
  const [mediaType, setMediaType] = useState<MediaType | undefined>(undefined);
  const [page, setPage] = useState(1);
  // Entries removed or moved on screen before the server confirms; cleared whenever the view changes
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ListItem | null>(null);
  const { state, reload } = useAsync(
    () => listsApi.list({ status, mediaType, page }),
    [status, mediaType, page],
  );

  const resetView = () => {
    setPage(1);
    setHidden(new Set());
    setError(null);
  };
  const hide = (id: string) => setHidden((h) => new Set(h).add(id));
  const unhide = (id: string) =>
    setHidden((h) => {
      const next = new Set(h);
      next.delete(id);
      return next;
    });

  async function move(entry: ListItem, next: ListStatus) {
    if (next === entry.status) return;
    setError(null);
    hide(entry.id); // optimistic
    try {
      await listsApi.setStatus(entry.id, next);
    } catch {
      unhide(entry.id); // roll back
      setError(`Could not move “${entry.title.name}”. Try again.`);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const entry = removing;
    try {
      await listsApi.remove(entry.id);
      hide(entry.id);
    } catch {
      setError(`Could not remove “${entry.title.name}”. Try again.`);
    } finally {
      setRemoving(null);
    }
  }

  const tabLabel = TABS.find((t) => t.status === status)?.label ?? '';

  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-tight">My Lists</h1>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <nav aria-label="List status" className="flex gap-2">
          {TABS.map((t) => (
            <FilterPill
              key={t.status}
              active={status === t.status}
              onClick={() => {
                setStatus(t.status);
                resetView();
              }}
            >
              {t.label}
            </FilterPill>
          ))}
        </nav>
        <nav aria-label="Media type" className="flex gap-2">
          {MEDIA.map((m) => (
            <FilterPill
              key={m.label}
              active={mediaType === m.value}
              onClick={() => {
                setMediaType(m.value);
                resetView();
              }}
            >
              {m.label}
            </FilterPill>
          ))}
        </nav>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[0.85rem] text-danger">
          {error}
        </p>
      )}

      <div className="mt-8">
        {state.status === 'loading' && <StateMessage kind="loading" />}
        {state.status === 'error' && (
          <StateMessage kind="error" detail="Your list could not be loaded." onRetry={reload} />
        )}
        {state.status === 'ready' &&
          (() => {
            const visible = state.data.data.filter((e) => !hidden.has(e.id));
            if (visible.length === 0) {
              return (
                <StateMessage
                  kind="empty"
                  title={`Nothing in “${tabLabel}” yet`}
                  detail="Add titles from their page."
                />
              );
            }
            return (
              <>
                <ul className="grid grid-cols-2 gap-5 md:grid-cols-4 lg:grid-cols-6">
                  {visible.map((entry) => (
                    <li key={entry.id}>
                      <PosterCard title={entry.title}>
                        <div className="grid gap-2">
                          <select
                            aria-label={`Status for ${entry.title.name}`}
                            value={entry.status}
                            onChange={(e) => void move(entry, e.target.value as ListStatus)}
                            className={`${inputClass} py-2 text-[0.8rem]`}
                          >
                            {TABS.map((t) => (
                              <option key={t.status} value={t.status}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setRemoving(entry)}
                            className="cursor-pointer text-left text-[0.8rem] text-muted underline"
                          >
                            Remove<span className="sr-only"> {entry.title.name}</span>
                          </button>
                        </div>
                      </PosterCard>
                    </li>
                  ))}
                </ul>
                <Pagination
                  page={state.data.page}
                  pageSize={state.data.pageSize}
                  total={state.data.total}
                  onChange={(p) => {
                    setPage(p);
                    setHidden(new Set());
                  }}
                />
              </>
            );
          })()}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove from list?"
        body={removing ? `“${removing.title.name}” will be removed from your list.` : ''}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </section>
  );
}
