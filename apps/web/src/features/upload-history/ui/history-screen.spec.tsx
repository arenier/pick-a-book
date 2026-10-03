import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { HistoryEntry } from '../model/history-entry';
import type { PageAnswer } from '../model/history-state';
import { HistoryScreen, type ObserveEnd } from './history-screen';
import type { ListPage } from './use-history';

const anEntry = (index: number): HistoryEntry => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  sentAt: new Date(Date.UTC(2026, 8, 27, 14, 0, 0) - index * 60_000),
  outcome: { kind: 'books', count: index + 1 },
  hasThumbnail: false,
});

const aPage = (indexes: readonly number[], next: string | null = null): PageAnswer => ({
  status: 'page',
  entries: indexes.map((index) => anEntry(index)),
  next,
});

const failure = (kind: 'offline' | 'rateLimited' | 'unexpected'): PageAnswer => ({
  status: 'error',
  failure: kind,
});

/** A `list` that answers the pages it is told to, in turn, and records the cursors it was given. */
function aServer(...answers: PageAnswer[]) {
  const cursors: (string | undefined)[] = [];
  const list = vi.fn<ListPage>(async (request) => {
    cursors.push(request.cursor);

    return answers.at(cursors.length - 1) ?? failure('unexpected');
  });

  return { list, cursors };
}

const stopWatching = (): void => {
  // Nothing was really watched: the spec triggers the end of the list by hand.
};

/** An observer of the end of the list that the spec triggers by hand, instead of the browser. */
function anObserver() {
  const reached: (() => void)[] = [];
  const observeEnd: ObserveEnd = (_element, onReach) => {
    reached.push(onReach);

    return stopWatching;
  };

  return { observeEnd, reachEnd: () => reached.at(-1)?.() };
}

const screenOf = (server: ReturnType<typeof aServer>, observer = anObserver()) => {
  render(<HistoryScreen list={server.list} observeEnd={observer.observeEnd} />);

  return observer;
};

describe('HistoryScreen, loading', () => {
  it('shows that it is loading, first', () => {
    const server = aServer(aPage([0]));

    render(<HistoryScreen list={server.list} />);

    expect(screen.getByRole('status').textContent).toContain('Chargement');
  });

  // React runs an effect twice in development to flush out the ones that are not safe to repeat:
  // asking the API for the same page twice is what that would show.
  it('asks for the first page once, even when React runs its effects twice', async () => {
    const server = aServer(aPage([0]));

    render(
      <StrictMode>
        <HistoryScreen list={server.list} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });
    expect(server.cursors).toStrictEqual([undefined]);
  });

  it('asks for the first page, with no cursor', async () => {
    const server = aServer(aPage([0]));

    screenOf(server);

    expect(server.cursors).toStrictEqual([undefined]);
  });
});

describe('HistoryScreen, with nothing, or nothing it could read', () => {
  // US1, scenario 2.
  it('says there is nothing yet, and leads back to the upload screen', async () => {
    screenOf(aServer(aPage([])));

    await screen.findByText('Vous n’avez encore envoyé aucune photo.');
    expect(screen.getByRole('link', { name: 'Envoyer une photo' }).getAttribute('href')).toBe('#/');
  });

  // FR-010: an history that could not be loaded must not read as an empty one.
  it('says it could not load, never that there is nothing, and offers to try again', async () => {
    const server = aServer(failure('offline'), aPage([0]));
    screenOf(server);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Impossible de joindre');
    expect(screen.queryByText('Vous n’avez encore envoyé aucune photo.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(1);
    });
  });

  it('tells the limit by source apart from an outage', async () => {
    screenOf(aServer(failure('rateLimited')));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Trop de demandes en peu de temps. Patientez une minute puis réessayez.',
    );
  });
});

describe('HistoryScreen, the entries', () => {
  it('shows them in the order they came', async () => {
    screenOf(aServer(aPage([2, 0, 1])));

    const links = await screen.findAllByRole('link');

    expect(links.map((link) => link.getAttribute('href'))).toStrictEqual(
      [2, 0, 1].map((index) => `#/historique/${anEntry(index).id}`),
    );
  });
});

describe('HistoryScreen, the next pages', () => {
  it('adds the next page after the entries already there, when asked', async () => {
    const server = aServer(aPage([0, 1], 'cursor-1'), aPage([2]));
    screenOf(server);

    fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus' }));

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(3);
    });
    expect(server.cursors).toStrictEqual([undefined, 'cursor-1']);
  });

  it('has no button once the last page is there', async () => {
    const server = aServer(aPage([0, 1], 'cursor-1'), aPage([2]));
    screenOf(server);

    fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus' }));

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(3);
    });
    expect(screen.queryByRole('button', { name: 'Afficher plus' })).toBeNull();
  });

  it('has no button when there is a single page', async () => {
    screenOf(aServer(aPage([0])));

    await screen.findAllByRole('link');

    expect(screen.queryByRole('button', { name: 'Afficher plus' })).toBeNull();
  });
});

describe('HistoryScreen, reaching the end of the list', () => {
  // The button is the accessible fallback; reaching the end of the list does the same.
  it('loads the next page when the end of the list comes into view', async () => {
    const server = aServer(aPage([0], 'cursor-1'), aPage([1]));
    const { reachEnd } = screenOf(server);
    await screen.findAllByRole('link');

    act(() => {
      reachEnd();
    });

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });
  });

  it('does not ask twice for the same page', async () => {
    const server = aServer(aPage([0], 'cursor-1'), aPage([1]));
    const { reachEnd } = screenOf(server);
    await screen.findAllByRole('link');

    act(() => {
      reachEnd();
      reachEnd();
    });

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });
    expect(server.cursors).toStrictEqual([undefined, 'cursor-1']);
  });
});

describe('HistoryScreen, when a next page fails', () => {
  it('keeps what is loaded, and offers to try that page again', async () => {
    const server = aServer(aPage([0], 'cursor-1'), failure('unexpected'), aPage([1]));
    screenOf(server);
    fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('erreur inattendue');
    expect(screen.getAllByRole('link')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });
    expect(server.cursors).toStrictEqual([undefined, 'cursor-1', 'cursor-1']);
  });

  it('tells the limit by source apart on a next page too', async () => {
    const server = aServer(aPage([0], 'cursor-1'), failure('rateLimited'));
    screenOf(server);
    fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Trop de demandes en peu de temps. Patientez une minute puis réessayez.',
    );
  });
});
