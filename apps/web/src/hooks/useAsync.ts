import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: T };

/**
 * Runs `load` on mount and whenever `deps` change; `reload()` runs it again.
 * A result that arrives after the inputs changed (or after unmount) is ignored.
 * `reload()` keeps the current data on screen while it runs, so a screen does not unmount (and lose
 * drafts or focus) after a mutation. With `keepPrevious`, a changed input does the same.
 * `refreshing` is true while old data is shown during a re-run.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  options: { keepPrevious?: boolean } = {},
) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  const seenVersion = useRef(version);
  const stateRef = useRef(state);
  stateRef.current = state;
  const keepPrevious = options.keepPrevious ?? false;

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let stale = false;
    const reloading = seenVersion.current !== version;
    seenVersion.current = version;
    const keep = reloading || keepPrevious;
    const kept = keep && stateRef.current.status === 'ready';
    if (!kept) setState({ status: 'loading' });
    setRefreshing(kept);
    loadRef.current().then(
      (data) => {
        if (stale) return;
        setRefreshing(false);
        setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (stale) return;
        setRefreshing(false);
        setState({ status: 'error', error });
      },
    );
    return () => {
      stale = true;
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload, refreshing };
}
