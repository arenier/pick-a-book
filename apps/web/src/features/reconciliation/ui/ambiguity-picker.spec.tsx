import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { ambiguous, anApi, books, confirmed } from './testing';

const CHUTE = [{ title: 'La Chute' }];
const SECOND = 'ark:/12148/cb2';

const chosen = confirmed(0, { title: 'La Chute' }, { confirmedBy: 'user' });
const press = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

async function ambiguousList(answers: Omit<Parameters<typeof anApi>[0], 'reconcile'> = {}) {
  const api = anApi({ reconcile: books(ambiguous(0, 'La Chute')), ...answers });
  render(<ReconciledBookList scanId="an-id" books={CHUTE} mode="afterAnalysis" api={api} />);
  await screen.findByText('Plusieurs œuvres possibles');

  return api;
}

describe('the choice among candidates (US2), what is offered', () => {
  it('offers each candidate in the order received, then « none of them »', async () => {
    await ambiguousList();

    const buttons = screen.getAllByRole('button').map((button) => button.textContent);

    expect(buttons).toStrictEqual([
      'La peste — Albert Camus',
      'La peste — Autre Auteur',
      'Aucun ne correspond',
    ]);
  });

  it('keeps every button at a touch size of 44 px', async () => {
    await ambiguousList();

    const sizes = screen.getAllByRole('button').map((button) => button.className.includes('h-11'));

    expect(sizes).toStrictEqual([true, true, true]);
  });
});

describe('the choice among candidates (US2), what is sent', () => {
  it('sends the chosen candidate and shows the book as the answer gives it', async () => {
    const api = await ambiguousList({ decide: { status: 'book', book: chosen } });

    await press(/Autre Auteur/u);

    expect(api.decide).toHaveBeenCalledWith('an-id', 0, { choice: 'candidate', recordId: SECOND });
    expect(screen.queryByText('Confirmé')).not.toBeNull();
    expect(screen.queryByText('Plusieurs œuvres possibles')).toBeNull();
  });

  it('sends « none of them » as it is', async () => {
    const notFound = {
      position: 0,
      read: { title: 'La Chute', author: undefined },
      status: 'not_found',
    } as const;
    const api = await ambiguousList({ decide: { status: 'book', book: notFound } });

    await press('Aucun ne correspond');

    expect(api.decide).toHaveBeenCalledWith('an-id', 0, { choice: 'none' });
    expect(screen.queryByText('Inconnu du catalogue')).not.toBeNull();
  });
});

describe('the choice among candidates (US2), when it cannot be recorded', () => {
  it('reads the state again on a conflict, and shows what it says', async () => {
    const api = await ambiguousList({
      decide: { status: 'error', failure: 'conflict' },
      read: books(chosen),
    });

    await press(/Autre Auteur/u);

    expect(api.read).toHaveBeenCalledWith('an-id');
    expect(screen.queryByText('Confirmé')).not.toBeNull();
  });

  it.each([
    ['rateLimited', /Trop de demandes/u],
    ['offline', /Impossible de joindre le serveur/u],
  ] as const)('keeps the choice open, with a message, on %s', async (failure, message) => {
    await ambiguousList({ decide: { status: 'error', failure } });

    await press(/Autre Auteur/u);

    expect(screen.queryByText(message)).not.toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(3);
  });
});
