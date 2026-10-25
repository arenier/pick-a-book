import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { aPendingApi, anApi, books, confirmed, withoutVerdict } from './testing';

const BOTH = [{ title: 'La Peste', author: 'Albert Camus' }, { title: 'Rien' }];
const retryButton = () => screen.queryByRole('button', { name: 'Relancer la vérification' });
const PESTE = { title: 'La Peste', author: 'Albert Camus' };

// US4: trying again without sending the photo again.
describe('ReconciledBookList, trying the check again (US4)', () => {
  it('offers it when a book is not verified', async () => {
    const api = anApi({
      reconcile: books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_verified')),
    });

    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);
    await screen.findByText('Non vérifié');

    expect(retryButton()).not.toBeNull();
  });

  it('offers it when the whole call failed', async () => {
    const api = anApi({ reconcile: { status: 'error', failure: 'offline' } });

    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);
    await screen.findByText(/Impossible de joindre le serveur/u);

    expect(retryButton()).not.toBeNull();
  });

  it('is absent when every status is final', async () => {
    const api = anApi({
      reconcile: books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_found')),
    });

    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);
    await screen.findByText('Inconnu du catalogue');

    expect(retryButton()).toBeNull();
  });

  it('is absent while the first answer is awaited', () => {
    const { api } = aPendingApi();

    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);

    expect(retryButton()).toBeNull();
  });

  it('asks again, is disabled meanwhile, then replaces the state', async () => {
    const api = anApi({
      reconcile: books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_verified')),
    });
    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);
    await screen.findByText('Non vérifié');
    let answer: (value: Awaited<ReturnType<typeof api.reconcile>>) => void = () => undefined;
    api.reconcile.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );

    await act(async () => {
      fireEvent.click(retryButton() as HTMLElement);
    });
    expect(retryButton()).toHaveProperty('disabled', true);

    await act(async () => {
      answer(books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_found')));
    });

    expect(api.reconcile).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Inconnu du catalogue')).not.toBeNull();
    expect(retryButton()).toBeNull();
  });

  it('keeps the books on screen when trying again fails, with the reason', async () => {
    const api = anApi({
      reconcile: books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_verified')),
    });
    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);
    await screen.findByText('Non vérifié');
    api.reconcile.mockResolvedValueOnce({ status: 'error', failure: 'rateLimited' });

    await act(async () => {
      fireEvent.click(retryButton() as HTMLElement);
    });

    expect(screen.queryByText('Confirmé')).not.toBeNull();
    expect(screen.queryByText(/Trop de demandes/u)).not.toBeNull();
    expect(retryButton()).toHaveProperty('disabled', false);
  });

  it('is offered in the detail of an upload too', async () => {
    const api = anApi({
      read: books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_verified')),
    });

    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="detail" api={api} />);
    await screen.findByText('Non vérifié');

    expect(retryButton()).not.toBeNull();
  });
});
