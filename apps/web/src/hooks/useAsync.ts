import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: T };

/**
 * Runs `load` on mount and whenever `deps` change; `reload()` runs it again.
 * A result that arrives after the inputs changed (or after unmount) is ignored.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let stale = false;
    setState({ status: 'loading' });
    loadRef.current().then(
      (data) => {
        if (!stale) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (!stale) setState({ status: 'error', error });
      },
    );
    return () => {
      stale = true;
    };
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}
