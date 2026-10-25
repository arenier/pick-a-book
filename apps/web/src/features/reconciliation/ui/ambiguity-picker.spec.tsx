import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { ambiguous, anApi, books, confirmed } from './testing';

const CHUTE = [{ title: 'La Chute' }];
const SECOND = 'ark:/12148/cb2';

const chosen = confirmed(0, { title: 'La Chute' }, { confirmedBy: 'user' });
const asked = () => screen.getByRole('button', { name: /Autre Auteur/u });

async function ambiguousList(api: ReturnType<typeof anApi>) {
  render(<ReconciledBookList scanId="an-id" books={CHUTE} mode="afterAnalysis" api={api} />);
  await screen.findByText('Plusieurs œuvres possibles');
}

describe('the choice among candidates (US2)', () => {
  it('offers each candidate in the order received, then « none of them »', async () => {
    await ambiguousList(anApi({ reconcile: books(ambiguous(0, 'La Chute')) }));

    const buttons = screen.getAllByRole('button').map((button) => button.textContent);

    expect(buttons).toStrictEqual([
      'La peste — Albert Camus',
      'La peste — Autre Auteur',
      'Aucun ne correspond',
    ]);
  });

  it('keeps every button at a touch size of 44 px', async () => {
    await ambiguousList(anApi({ reconcile: books(ambiguous(0, 'La Chute')) }));

    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('h-11');
    }
  });

  it('sends the chosen candidate and shows the book as the answer gives it', async () => {
    const api = anApi({
      reconcile: books(ambiguous(0, 'La Chute')),
      decide: { status: 'book', book: chosen },
    });
    await ambiguousList(api);

    await act(async () => {
      fireEvent.click(asked());
    });

    expect(api.decide).toHaveBeenCalledWith('an-id', 0, { choice: 'candidate', recordId: SECOND });
    expect(screen.queryByText('Confirmé')).not.toBeNull();
    expect(screen.queryByText('Plusieurs œuvres possibles')).toBeNull();
  });

  it('sends « none of them » as it is', async () => {
    const api = anApi({
      reconcile: books(ambiguous(0, 'La Chute')),
      decide: {
        status: 'book',
        book: { position: 0, read: { title: 'La Chute', author: undefined }, status: 'not_found' },
      },
    });
    await ambiguousList(api);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aucun ne correspond' }));
    });

    expect(api.decide).toHaveBeenCalledWith('an-id', 0, { choice: 'none' });
    expect(screen.queryByText('Inconnu du catalogue')).not.toBeNull();
  });

  it('reads the state again on a conflict, and shows what it says', async () => {
    const api = anApi({
      reconcile: books(ambiguous(0, 'La Chute')),
      decide: { status: 'error', failure: 'conflict' },
      read: books(chosen),
    });
    await ambiguousList(api);

    await act(async () => {
      fireEvent.click(asked());
    });

    expect(api.read).toHaveBeenCalledWith('an-id');
    expect(screen.queryByText('Confirmé')).not.toBeNull();
  });

  it('keeps the choice open, with the rate-limit message, when too many requests were made', async () => {
    const api = anApi({
      reconcile: books(ambiguous(0, 'La Chute')),
      decide: { status: 'error', failure: 'rateLimited' },
    });
    await ambiguousList(api);

    await act(async () => {
      fireEvent.click(asked());
    });

    expect(screen.queryByText(/Trop de demandes/u)).not.toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(3);
  });

  it('keeps the choice open, with a message, when the server cannot be reached', async () => {
    const api = anApi({
      reconcile: books(ambiguous(0, 'La Chute')),
      decide: { status: 'error', failure: 'offline' },
    });
    await ambiguousList(api);

    await act(async () => {
      fireEvent.click(asked());
    });

    expect(screen.queryByText(/Impossible de joindre le serveur/u)).not.toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(3);
  });
});
