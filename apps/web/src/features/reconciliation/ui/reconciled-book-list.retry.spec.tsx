import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { aPendingApi, anApi, books, confirmed, holdNextReconcile, withoutVerdict } from './testing';

const PESTE = { title: 'La Peste', author: 'Albert Camus' };
const BOTH = [PESTE, { title: 'Rien' }];
const retryButton = () => screen.queryByRole('button', { name: 'Relancer la vérification' });
const pressRetry = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Relancer la vérification' }));
  });
};
const unverified = () => books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_verified'));
const shown = async (api: ReturnType<typeof anApi>, mode: 'afterAnalysis' | 'detail') => {
  render(<ReconciledBookList scanId="an-id" books={BOTH} mode={mode} api={api} />);
};

// US4: trying again without sending the photo again.
describe('ReconciledBookList, when the check can be tried again (US4)', () => {
  it('offers it when a book is not verified', async () => {
    await shown(anApi({ reconcile: unverified() }), 'afterAnalysis');
    await screen.findByText('Non vérifié');

    expect(retryButton()).not.toBeNull();
  });

  it('offers it when the whole call failed', async () => {
    await shown(anApi({ reconcile: { status: 'error', failure: 'offline' } }), 'afterAnalysis');
    await screen.findByText(/Impossible de joindre le serveur/u);

    expect(retryButton()).not.toBeNull();
  });

  it('offers it in the detail of an upload too', async () => {
    await shown(anApi({ read: unverified() }), 'detail');
    await screen.findByText('Non vérifié');

    expect(retryButton()).not.toBeNull();
  });
});

describe('ReconciledBookList, when it cannot', () => {
  it('is absent when every status is final', async () => {
    const reconcile = books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_found'));
    await shown(anApi({ reconcile }), 'afterAnalysis');
    await screen.findByText('Inconnu du catalogue');

    expect(retryButton()).toBeNull();
  });

  it('is absent while the first answer is awaited', () => {
    const { api } = aPendingApi();

    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);

    expect(retryButton()).toBeNull();
  });
});

describe('ReconciledBookList, trying again', () => {
  it('is disabled meanwhile, then replaces the state', async () => {
    const api = anApi({ reconcile: unverified() });
    await shown(api, 'afterAnalysis');
    await screen.findByText('Non vérifié');
    const held = holdNextReconcile(api);

    await pressRetry();
    expect(retryButton()).toHaveProperty('disabled', true);
    await act(async () => {
      held.answer(books(confirmed(0, PESTE), withoutVerdict(1, 'Rien', 'not_found')));
    });

    expect(api.reconcile).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Inconnu du catalogue')).not.toBeNull();
    expect(retryButton()).toBeNull();
  });

  it('keeps the books on screen when it fails, with the reason', async () => {
    const api = anApi({ reconcile: unverified() });
    await shown(api, 'afterAnalysis');
    await screen.findByText('Non vérifié');
    api.reconcile.mockResolvedValueOnce({ status: 'error', failure: 'rateLimited' });

    await pressRetry();

    expect(screen.queryByText('Confirmé')).not.toBeNull();
    expect(screen.queryByText(/Trop de demandes/u)).not.toBeNull();
    expect(retryButton()).toHaveProperty('disabled', false);
  });
});
