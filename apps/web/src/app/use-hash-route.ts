import { useMemo, useSyncExternalStore } from 'react';

import { parseRoute, type Route } from './routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);

  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

const currentHash = (): string => window.location.hash;

/**
 * The route the address bar names, followed as it changes: a link, the back button, a
 * hand-typed fragment. The fragment is the store — a string, so React can tell whether it moved
 * — and the route is derived from it, one object per fragment.
 */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, currentHash);

  return useMemo(() => parseRoute(hash), [hash]);
}
