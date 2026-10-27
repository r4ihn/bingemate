import { useRef, useState } from 'react';
import type { MediaType } from '@bingemate/shared';
import { ListStatus } from '@bingemate/shared';
import { listsApi } from '../api/lists.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { FilterPill } from '../components/FilterPill.js';
import { Pagination } from '../components/Pagination.js';
import { PosterCard } from '../components/PosterCard.js';
import { StateMessage } from '../components/StateMessage.js';
import { Dropdown } from '../components/ui/Dropdown.js';
import { useAsync } from '../hooks/useAsync.js';
import { LIST_STATUSES, MEDIA_FILTERS } from '../labels.js';
import type { ListItem } from '../types/list.js';

const STATUS_OPTIONS = LIST_STATUSES.map((s) => ({ value: s.status, label: s.label }));

export function MyLists() {
  const [status, setStatus] = useState<ListStatus>(ListStatus.COMPLETED);
  const [mediaType, setMediaType] = useState<MediaType | undefined>(undefined);
  const [page, setPage] = useState(1);
  // Entries removed or moved on screen before the server confirms; cleared whenever the view changes
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const hiddenRef = useRef<ReadonlySet<string>>(hidden);
  const [error, setError] = useState<string | null>(null);
  // Identifies the view on screen; an action that resolves after the view changed must not touch the new one
  const viewKey = `${status}|${mediaType ?? ''}|${page}`;
  const viewRef = useRef(viewKey);
  viewRef.current = viewKey;
  const [removing, setRemoving] = useState<ListItem | null>(null);
  const { state, reload } = useAsync(
    () => listsApi.list({ status, mediaType, page }),
    [status, mediaType, page],
  );

  const syncHidden = (next: ReadonlySet<string>) => {
    hiddenRef.current = next;
    setHidden(next);
  };
  const resetView = () => {
    setPage(1);
    syncHidden(new Set());
    setError(null);
  };
  const hide = (id: string) => syncHidden(new Set(hiddenRef.current).add(id));
  const unhide = (id: string) => {
    const next = new Set(hiddenRef.current);
    next.delete(id);
    syncHidden(next);
  };

  /** After the server confirms a change that leaves this page empty: previous page, or refetch. */
  function settle(startedIn: string) {
    if (viewRef.current !== startedIn || state.status !== 'ready') return;
    const left = state.data.data.filter((e) => !hiddenRef.current.has(e.id)).length;
    if (left > 0) return;
    syncHidden(new Set());
    if (page > 1) setPage(page - 1);
    else reload();
  }

  async function move(entry: ListItem, next: ListStatus) {
    if (next === entry.status) return;
    setError(null);
    const startedIn = viewRef.current;
    hide(entry.id); // optimistic
    try {
      await listsApi.setStatus(entry.id, next);
      settle(startedIn);
    } catch {
      if (viewRef.current !== startedIn) return; // the view reset already cleared the optimistic hide
      unhide(entry.id); // roll back
      setError(`Could not move “${entry.title.name}”. Try again.`);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const entry = removing;
    const startedIn = viewRef.current;
    try {
      await listsApi.remove(entry.id);
      if (viewRef.current !== startedIn) return;
      hide(entry.id);
      settle(startedIn);
    } catch {
      if (viewRef.current === startedIn)
        setError(`Could not remove “${entry.title.name}”. Try again.`);
    } finally {
      setRemoving(null);
    }
  }

  const tabLabel = LIST_STATUSES.find((t) => t.status === status)?.label ?? '';

  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-tight">My Lists</h1>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
        <nav aria-label="List status" className="flex flex-wrap gap-2">
          {LIST_STATUSES.map((t) => (
            <FilterPill
              key={t.status}
              active={status === t.status}
              onClick={() => {
                if (t.status === status) return; // re-clicking the active tab must not resurrect hidden entries
                setStatus(t.status);
                resetView();
              }}
            >
              {t.label}
            </FilterPill>
          ))}
        </nav>
        <nav aria-label="Media type" className="flex flex-wrap gap-2">
          {MEDIA_FILTERS.map((m) => (
            <FilterPill
              key={m.label}
              active={mediaType === m.value}
              onClick={() => {
                if (m.value === mediaType) return;
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
        <p role="alert" className="mt-4 text-sm text-danger">
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
                          <Dropdown
                            label={`Status for ${entry.title.name}`}
                            value={entry.status}
                            options={STATUS_OPTIONS}
                            onChange={(value) => void move(entry, value as ListStatus)}
                            className="rounded-xl text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setRemoving(entry)}
                            className="cursor-pointer text-left text-sm text-muted underline inline-flex min-h-11 items-center"
                          >
                            Remove <span className="sr-only">{entry.title.name}</span>
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
                    syncHidden(new Set());
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
