/**
 * The screens of the front, addressed by the fragment of the URL (specs/002-upload-history,
 * research.md §2). The front is served as static files from a bucket, with no rewrite: only the
 * fragment survives a reload and a pasted link, because the server never sees it.
 */
export type Route =
  | { readonly name: 'upload' }
  | { readonly name: 'history' }
  | { readonly name: 'entry'; readonly id: string };

const HISTORY = '#/historique';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The route a fragment names. Anything it does not recognise — a hand-written or damaged link —
 * is the upload screen, the front door, never a blank page.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/\/$/u, '');
  if (path === HISTORY) {
    return { name: 'history' };
  }

  const id = path.startsWith(`${HISTORY}/`) ? path.slice(HISTORY.length + 1) : '';

  return UUID.test(id) ? { name: 'entry', id } : { name: 'upload' };
}

/** The fragment of a route — what a link points at; the inverse of `parseRoute`. */
export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'upload': {
      return '#/';
    }
    case 'history': {
      return HISTORY;
    }
    case 'entry': {
      return `${HISTORY}/${route.id}`;
    }
    default: {
      const unhandled: never = route;

      return unhandled;
    }
  }
}
