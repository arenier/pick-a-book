import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './app';

/**
 * The history through the shell (specs/002-upload-history): the route of the address bar picks the
 * screen, and the API is a `fetch` double that answers by what it is asked.
 */
const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const emptyHistory = () => Response.json({ items: [], nextCursor: null });
const notFound = () => Response.json({ statusCode: 404 }, { status: 404 });
const isListRequest = (url: string) => url.includes('limit=20');

/** One upload in the list; no detail for it — enough to tell what was asked and what is shown. */
const oneUploadApi = (url: string) =>
  isListRequest(url)
    ? Response.json({
        items: [
          {
            id: anId,
            createdAt: '2026-09-27T14:03:12.481Z',
            outcome: 'pending',
            hasThumbnail: false,
          },
        ],
        nextCursor: null,
      })
    : notFound();

function stubApi(answer: (url: string) => Response) {
  const fetchDouble = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) =>
    answer(url),
  );
  vi.stubGlobal('fetch', fetchDouble);

  return fetchDouble;
}

/** What the browser does when the user follows a link: the fragment changes, and says so. */
function navigateTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** Leaves the address bar and `fetch` as they were, for the next test. */
function resetBrowser(): void {
  window.location.hash = '';
  vi.unstubAllGlobals();
}

describe('App, the history', () => {
  afterEach(resetBrowser);

  it('shows the history on #/historique, and not the upload screen', async () => {
    stubApi(emptyHistory);
    window.location.hash = '#/historique';

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Vous n’avez encore envoyé aucune photo.')).toBeDefined();
    });
    expect(screen.queryByRole('button', { name: 'Analyser la photo' })).toBeNull();
  });

  it('leads back to the upload screen by the link of the shell', async () => {
    stubApi(emptyHistory);
    window.location.hash = '#/historique';

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('navigation').textContent).toBe('Nouvelle photo');
    });
    expect(screen.getByRole('link', { name: 'Nouvelle photo' }).getAttribute('href')).toBe('#/');
  });

  it('follows the link of the upload screen to the history', async () => {
    stubApi(emptyHistory);
    window.location.hash = '#/';
    render(<App />);

    navigateTo('#/historique');

    await waitFor(() => {
      expect(screen.getByText('Vous n’avez encore envoyé aucune photo.')).toBeDefined();
    });
  });
});

describe('App, the detail of an upload', () => {
  afterEach(resetBrowser);

  // The route names the upload; the shell hands it to the history, which asks the API for it.
  it('shows the upload the address names, without asking for the list', async () => {
    const fetchDouble = stubApi(notFound);
    window.location.hash = `#/historique/${anId}`;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Cet envoi est introuvable.')).toBeDefined();
    });
    expect(fetchDouble).toHaveBeenCalledOnce();
    expect(fetchDouble.mock.calls[0]?.[0]).toMatch(new RegExp(`/shelf-photos/${anId}$`, 'u'));
  });

  it('keeps the link of the shell to a new photo', async () => {
    stubApi(notFound);
    window.location.hash = `#/historique/${anId}`;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Nouvelle photo' }).getAttribute('href')).toBe('#/');
    });
  });

  // US2, scenario 4, through the shell: it is the route that moves, and the history must outlive it.
  it('does not ask for the list again when the user opens an upload and comes back', async () => {
    const fetchDouble = stubApi(oneUploadApi);
    window.location.hash = '#/historique';
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText('Analyse non lancée')).toBeDefined();
    });

    navigateTo(`#/historique/${anId}`);
    await waitFor(() => {
      expect(screen.getByText('Cet envoi est introuvable.')).toBeDefined();
    });
    navigateTo('#/historique');

    await waitFor(() => {
      expect(screen.getByText('Analyse non lancée')).toBeDefined();
    });
    expect(fetchDouble.mock.calls.filter(([url]) => isListRequest(url))).toHaveLength(1);
  });
});
