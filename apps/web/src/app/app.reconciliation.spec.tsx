import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './app';

/**
 * The reconciled list through the shell (specs/003, research §11): both screens that show detected
 * books get the list from the shell, which composes the slices. The API is a `fetch` double that
 * answers by what it is asked.
 */
const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const peste = { recordId: 'ark:/12148/cb1', title: 'La peste', authors: ['Albert Camus'] };
const confirmedPeste = {
  position: 0,
  read: { title: 'La Pest', author: 'Albert Camus' },
  status: 'confirmed',
  confirmedBy: 'automatic',
  titleOnly: false,
  reference: peste,
};
const notFound = { position: 1, read: { title: 'Rien' }, status: 'not_found' };
const pending = [
  { position: 0, read: { title: 'La Pest', author: 'Albert Camus' }, status: 'pending' },
  { position: 1, read: { title: 'Rien' }, status: 'pending' },
];
const detected = [
  { author: 'Albert Camus', title: 'La Pest', confidence: 0.9 },
  { title: 'Rien', confidence: 0.4 },
];

type Call = { readonly method: string; readonly path: string };

/** A server for the routes the screens use, answering what the spec scripts and keeping the calls. */
function stubApi(routes: Readonly<Record<string, () => Response>>) {
  const calls: Call[] = [];
  const fetchDouble = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url, init) => {
      const call = { method: init?.method ?? 'GET', path: new URL(url).pathname };
      calls.push(call);

      return (
        routes[`${call.method} ${call.path}`] ?? (() => Response.json({}, { status: 404 }))
      )();
    },
  );
  vi.stubGlobal('fetch', fetchDouble);

  return calls;
}

const asked = (calls: readonly Call[]) => calls.map((call) => `${call.method} ${call.path}`);

/** Leaves the address bar and `fetch` as they were, for the next test. */
function resetBrowser(): void {
  window.location.hash = '';
  vi.unstubAllGlobals();
}

describe('App, right after an analysis', () => {
  afterEach(resetBrowser);

  it('shows the books of a new photo with their status against the catalogue', async () => {
    const calls = stubApi({
      'POST /shelf-photos': () => Response.json({ id: anId }, { status: 201 }),
      [`POST /shelf-photos/${anId}/scan`]: () => Response.json({ books: detected }),
      [`POST /shelf-photos/${anId}/reconciliation`]: () =>
        Response.json({ books: [confirmedPeste, notFound] }),
    });
    window.location.hash = '#/';
    render(<App />);

    fireEvent.change(screen.getByLabelText('Photo de l’étagère'), {
      target: {
        files: [new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser la photo' }));

    await screen.findByText('Confirmé');
    expect(screen.getByText('Inconnu du catalogue')).toBeDefined();
    expect(screen.getByText('Source : catalogue général de la BnF')).toBeDefined();
    expect(asked(calls)).toContain(`POST /shelf-photos/${anId}/reconciliation`);
  });
});

describe('App, the detail of an upload', () => {
  afterEach(resetBrowser);

  const detail = () =>
    Response.json({
      id: anId,
      createdAt: '2026-09-27T14:03:12.481Z',
      outcome: 'completed',
      books: detected,
      hasThumbnail: false,
    });

  it('reads the kept state, and reconciles when books were never tried', async () => {
    const calls = stubApi({
      [`GET /shelf-photos/${anId}`]: detail,
      [`GET /shelf-photos/${anId}/reconciliation`]: () => Response.json({ books: pending }),
      [`POST /shelf-photos/${anId}/reconciliation`]: () =>
        Response.json({ books: [confirmedPeste, notFound] }),
    });
    window.location.hash = `#/historique/${anId}`;
    render(<App />);

    await screen.findByText('Confirmé');

    expect(asked(calls).filter((call) => call.includes('reconciliation'))).toStrictEqual([
      `GET /shelf-photos/${anId}/reconciliation`,
      `POST /shelf-photos/${anId}/reconciliation`,
    ]);
  });

  it('shows the kept state as it is, without asking again, when every book has its status', async () => {
    const calls = stubApi({
      [`GET /shelf-photos/${anId}`]: detail,
      [`GET /shelf-photos/${anId}/reconciliation`]: () =>
        Response.json({ books: [confirmedPeste, notFound] }),
    });
    window.location.hash = `#/historique/${anId}`;
    render(<App />);

    await screen.findByText('Confirmé');

    expect(asked(calls).filter((call) => call.startsWith('POST'))).toStrictEqual([]);
  });
});
