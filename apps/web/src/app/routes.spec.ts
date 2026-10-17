import { describe, expect, it } from 'vitest';

import { hrefFor, parseRoute } from './routes';

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

// The front is served from a static bucket, with no rewrite of URLs: the screen is read from the
// fragment, which the server never sees (specs/002-upload-history, research.md §2).
describe('parseRoute', () => {
  it.each(['', '#', '#/'])('reads %p as the upload screen', (hash) => {
    expect(parseRoute(hash)).toStrictEqual({ name: 'upload' });
  });

  it('reads #/historique as the history', () => {
    expect(parseRoute('#/historique')).toStrictEqual({ name: 'history' });
  });

  it('reads #/historique/{uuid} as the detail of that upload', () => {
    expect(parseRoute(`#/historique/${anId}`)).toStrictEqual({ name: 'entry', id: anId });
  });

  it('reads a trailing slash like the route without it', () => {
    expect(parseRoute('#/historique/')).toStrictEqual({ name: 'history' });
  });

  // A hand-written or damaged link lands on the upload screen, never on a blank one.
  it.each(['#/nope', '#/historique/not-a-uuid', `#/historique/${anId}/extra`, '#historique', 'x'])(
    'reads any other fragment (%p) as the upload screen',
    (hash) => {
      expect(parseRoute(hash)).toStrictEqual({ name: 'upload' });
    },
  );
});

describe('hrefFor', () => {
  it.each([
    [{ name: 'upload' } as const, '#/'],
    [{ name: 'history' } as const, '#/historique'],
    [{ name: 'entry', id: anId } as const, `#/historique/${anId}`],
  ])('writes the fragment of %j', (route, href) => {
    expect(hrefFor(route)).toBe(href);
  });

  it.each([{ name: 'upload' }, { name: 'history' }, { name: 'entry', id: anId }] as const)(
    'writes a fragment that parses back to %j',
    (route) => {
      expect(parseRoute(hrefFor(route))).toStrictEqual(route);
    },
  );
});
