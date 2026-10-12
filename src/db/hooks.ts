import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

import { useDbStore } from './store';

type LiveQueryResult<T> = {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  /** Re-run the loader immediately (after a manual refresh). */
  refresh: () => void;
};

/**
 * Runs an async query and re-runs it whenever a repository bumps the DB
 * revision. Keeps the previous value while reloading so lists do not flash.
 */
export function useLiveQuery<T>(
  loader: () => Promise<T>,
  deps: DependencyList = [],
  name?: string,
): LiveQueryResult<T> {
  const revision = useDbStore((state) => state.revision);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    loaderRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        setHasLoaded(true);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        const err = caught instanceof Error ? caught : new Error(String(caught));
        // eslint-disable-next-line no-console
        console.error(`[useLiveQuery${name ? `(${name})` : ''}]`, err.message, err);
        setError(err);
        setHasLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, nonce, ...deps]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { data, isLoading: !hasLoaded, error, refresh };
}
