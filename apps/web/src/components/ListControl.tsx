import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ListStatus } from '@bingemate/shared';
import { listsApi } from '../api/lists.js';
import { useAuth } from '../auth/AuthContext.js';
import { LIST_STATUSES } from '../labels.js';
import type { ListItem } from '../types/list.js';
import { Dropdown } from './ui/Dropdown.js';
import type { DropdownOption } from './ui/Dropdown.js';

const REMOVE = 'REMOVE';

/** Add a title to My Lists, or change or remove its entry. Signed-out visitors get a sign-in link. */
export function ListControl({ titleId, titleName }: { titleId: string; titleName: string }) {
  const { user } = useAuth();
  // undefined while loading, null when the title is not on the list
  const [entry, setEntry] = useState<ListItem | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signedIn = user !== null;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    setEntry(undefined);
    setError(null);
    listsApi
      .forTitle(titleId)
      .then((found) => !cancelled && setEntry(found))
      .catch(() => !cancelled && setError('Could not load your list. Reload to try again.'));
    return () => {
      cancelled = true;
    };
  }, [titleId, signedIn]);

  if (!signedIn) {
    return (
      <Link
        to="/login"
        className="inline-flex min-h-11 items-center rounded-full border border-white px-6 font-semibold"
      >
        Sign in to add to list
      </Link>
    );
  }

  async function choose(value: string) {
    if (busy || !value) return;
    setBusy(true);
    setError(null);
    try {
      if (!entry) {
        setEntry(await listsApi.add(titleId, value as ListStatus));
      } else if (value === REMOVE) {
        await listsApi.remove(entry.id);
        setEntry(null);
      } else {
        setEntry(await listsApi.setStatus(entry.id, value as ListStatus));
      }
    } catch {
      setError('Could not update your list. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const options: DropdownOption[] = [
    ...LIST_STATUSES.map((s) => ({ value: s.status, label: s.label })),
    ...(entry ? [{ value: REMOVE, label: 'Remove from list', tone: 'danger' as const }] : []),
  ];

  return (
    <div className="w-fit min-w-48">
      <Dropdown
        label={entry ? `List status for ${titleName}` : 'Add to list'}
        value={entry ? entry.status : ''}
        placeholder="Add to list"
        options={options}
        disabled={busy || (entry === undefined && !error)}
        onChange={(value) => void choose(value)}
        className="rounded-full"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
