import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { anApi, books, withoutVerdict } from './testing';

const DETECTED = [{ title: 'La Peste', author: 'Albert Camus' }, { title: 'Rien' }];

const OFFLINE =
  'Impossible de joindre le serveur : la vérification n’a pas pu avoir lieu. Vérifiez votre connexion.';
const RATE_LIMITED = 'Trop de demandes en peu de temps. Patientez une minute puis réessayez.';
const UNEXPECTED =
  'Une erreur inattendue est survenue pendant la vérification. Réessayez dans quelques instants.';

// FR-008: a catalogue that fails never hides the books.
describe('ReconciledBookList, when the request itself fails', () => {
  it.each([
    ['offline', OFFLINE],
    ['rateLimited', RATE_LIMITED],
    ['unexpected', UNEXPECTED],
  ] as const)(
    'keeps every book visible, not verified, and says why (%s)',
    async (failure, message) => {
      const api = anApi({ reconcile: { status: 'error', failure } });

      render(<ReconciledBookList scanId="an-id" books={DETECTED} mode="afterAnalysis" api={api} />);

      await screen.findByText(message);
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(screen.getAllByText('Non vérifié')).toHaveLength(2);
    },
  );

  it('keeps the books visible when the kept state cannot be read either', async () => {
    const api = anApi({ read: { status: 'error', failure: 'offline' } });

    render(<ReconciledBookList scanId="an-id" books={DETECTED} mode="detail" api={api} />);

    await screen.findAllByText('Non vérifié');
    expect(screen.getAllByText('Non vérifié')).toHaveLength(2);
    expect(api.reconcile).not.toHaveBeenCalled();
  });

  it('shows as not verified a book never tried when the reconciliation then fails', async () => {
    const api = anApi({
      read: books(withoutVerdict(0, 'La Peste', 'pending', 'Albert Camus')),
      reconcile: { status: 'error', failure: 'offline' },
    });

    render(<ReconciledBookList scanId="an-id" books={DETECTED} mode="detail" api={api} />);

    await screen.findByText('Non vérifié');
    expect(screen.queryByText('Vérification en cours…')).toBeNull();
  });
});
