import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DetectedBook } from '../model/detected-book';
import type { HistoryOutcome } from '../model/history-entry';
import type { DetailAnswer, RescanAnswer, RescanFailure } from '../model/history-state';
import { EntryDetailScreen } from './entry-detail-screen';
import type { RescanShelfScan } from './use-entry-detail';
import type { LoadDetail } from './use-entry-detail';

/**
 * Running the analysis of an upload again, from its detail (specs/002-upload-history, US3): offered
 * where there is nothing to show — an analysis that failed, or never started — and nowhere else.
 */
const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const LA_PESTE: DetectedBook[] = [{ author: 'Albert Camus', title: 'La Peste', confidence: 0.9 }];

const found = (outcome: HistoryOutcome, books?: readonly DetectedBook[]): DetailAnswer => ({
  status: 'found',
  entry: { id: anId, sentAt: new Date('2026-09-27T14:03:12.481Z'), outcome, hasThumbnail: false },
  books,
});

const failed = () => found({ kind: 'failed' });

const button = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Relancer l’analyse' });

/** A `rescan` that answers when the spec lets it, so that the wait in between can be looked at. */
function aSlowRescan(answer: RescanAnswer) {
  const resolvers: (() => void)[] = [];
  const rescan = vi.fn<RescanShelfScan>(
    async () =>
      new Promise<RescanAnswer>((resolve) => {
        resolvers.push(() => {
          resolve(answer);
        });
      }),
  );

  return {
    rescan,
    answer: () => {
      act(() => {
        resolvers.forEach((resolve) => {
          resolve();
        });
      });
    },
  };
}

const loadOf = (...answers: DetailAnswer[]) =>
  vi.fn<LoadDetail>(async () => answers.shift() ?? failed());

const doesNotMatter = vi.fn<RescanShelfScan>(async () => ({
  status: 'error',
  failure: 'unexpected',
}));

describe('EntryDetailScreen, when running the analysis again is offered', () => {
  it.each([
    ['failed', { kind: 'failed' } as const],
    ['not started', { kind: 'notStarted' } as const],
  ])('shows the button for an analysis that is %s', async (_label, outcome) => {
    render(<EntryDetailScreen id={anId} load={loadOf(found(outcome))} rescan={doesNotMatter} />);

    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });
  });

  it.each([
    ['with books', found({ kind: 'books', count: 1 }, LA_PESTE)],
    ['with none', found({ kind: 'none' }, [])],
  ])('does not show it for an analysis that completed %s', async (_label, answer) => {
    render(<EntryDetailScreen id={anId} load={loadOf(answer)} rescan={doesNotMatter} />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Historique' })).toBeDefined();
    });
    expect(screen.queryByRole('button', { name: 'Relancer l’analyse' })).toBeNull();
  });
});

describe('EntryDetailScreen, while the analysis runs again', () => {
  it('shows that it is loading, and disables the button', async () => {
    const slow = aSlowRescan({ status: 'completed', books: LA_PESTE });
    render(<EntryDetailScreen id={anId} load={loadOf(failed())} rescan={slow.rescan} />);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Analyse de la photo en cours');
    });
    expect(button().disabled).toBe(true);
    slow.answer();
  });

  it('asks only once for a click made twice in a row', async () => {
    const slow = aSlowRescan({ status: 'completed', books: LA_PESTE });
    render(<EntryDetailScreen id={anId} load={loadOf(failed())} rescan={slow.rescan} />);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());
    fireEvent.click(button());

    expect(slow.rescan).toHaveBeenCalledOnce();
    slow.answer();
  });
});

describe('EntryDetailScreen, once the analysis has run again', () => {
  it('shows the books, and the button is gone', async () => {
    const rescan = vi.fn<RescanShelfScan>(async () => ({ status: 'completed', books: LA_PESTE }));
    render(<EntryDetailScreen id={anId} load={loadOf(failed())} rescan={rescan} />);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());

    await waitFor(() => {
      expect(screen.getByRole('listitem').textContent).toBe('La Peste — Albert Camus');
    });
    expect(screen.queryByRole('button', { name: 'Relancer l’analyse' })).toBeNull();
    expect(rescan).toHaveBeenCalledWith(anId);
  });
});

describe('EntryDetailScreen, telling the list what an upload became', () => {
  // The history behind the detail learns of it, with the new outcome of the entry (scenario 1).
  it('tells whoever shows the list what the upload now is', async () => {
    const rescan = vi.fn<RescanShelfScan>(async () => ({ status: 'completed', books: LA_PESTE }));
    const onRescanned = vi.fn<(id: string, outcome: HistoryOutcome) => void>();
    render(
      <EntryDetailScreen
        id={anId}
        load={loadOf(failed())}
        rescan={rescan}
        onRescanned={onRescanned}
      />,
    );
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());

    await waitFor(() => {
      expect(onRescanned).toHaveBeenCalledWith(anId, { kind: 'books', count: 1 });
    });
  });

  it('says « none » when the new analysis finds no book', async () => {
    const rescan = vi.fn<RescanShelfScan>(async () => ({ status: 'completed', books: [] }));
    render(<EntryDetailScreen id={anId} load={loadOf(failed())} rescan={rescan} />);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());

    await waitFor(() => {
      expect(screen.getByText('Aucun livre détecté sur cette photo.')).toBeDefined();
    });
  });
});

const WORDINGS: readonly (readonly [RescanFailure, string])[] = [
  ['upstream', 'Le service de reconnaissance ne répond pas pour le moment. Réessayez plus tard.'],
  ['dailyQuota', 'Limite d’analyses du jour atteinte : réessayez demain.'],
  ['inProgress', 'Une analyse de cette photo est déjà en cours.'],
  ['rateLimited', 'Trop de demandes en peu de temps. Patientez une minute puis réessayez.'],
  ['offline', 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.'],
  ['unexpected', 'Une erreur inattendue est survenue. Réessayez dans quelques instants.'],
];

// US3, scenario 3: a failure is told, in words of its own, and the button stays for another try.
describe('EntryDetailScreen, when the analysis cannot run again', () => {
  it.each(WORDINGS)('says %s in its own words, and keeps the button', async (failure, text) => {
    const rescan = vi.fn<RescanShelfScan>(async () => ({ status: 'error', failure }));
    render(<EntryDetailScreen id={anId} load={loadOf(failed())} rescan={rescan} />);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(text);
    });
    expect(button().disabled).toBe(false);
  });

  // Another tab got there first: the upload has its books, so the detail loads again to show them.
  it('loads the upload again when it turns out to have its books already', async () => {
    const rescan = vi.fn<RescanShelfScan>(async () => ({ status: 'alreadyCompleted' }));
    const load = loadOf(failed(), found({ kind: 'books', count: 1 }, LA_PESTE));
    render(<EntryDetailScreen id={anId} load={load} rescan={rescan} />);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());

    await waitFor(() => {
      expect(screen.getByRole('listitem').textContent).toBe('La Peste — Albert Camus');
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
