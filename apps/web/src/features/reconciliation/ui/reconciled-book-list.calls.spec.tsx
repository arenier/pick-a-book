import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { anApi, books, confirmed, withoutVerdict } from './testing';

const DETECTED = [{ title: 'La Peste', author: 'Albert Camus' }, { title: 'Rien' }];
const DONE = books(
  confirmed(0, { title: 'La Peste', author: 'Albert Camus' }),
  withoutVerdict(1, 'Rien', 'not_found'),
);
const NEVER_TRIED = books(
  withoutVerdict(0, 'La Peste', 'pending', 'Albert Camus'),
  withoutVerdict(1, 'Rien', 'pending'),
);

describe('ReconciledBookList, right after an analysis', () => {
  it('reconciles the analysis, and reads nothing first', async () => {
    const api = anApi({ reconcile: DONE });

    render(<ReconciledBookList scanId="an-id" books={DETECTED} mode="afterAnalysis" api={api} />);

    await screen.findByText('Confirmé');
    expect(api.reconcile).toHaveBeenCalledWith('an-id');
    expect(api.read).not.toHaveBeenCalled();
  });

  // StrictMode mounts the component twice in development: one request still, not two.
  it('sends a single request even when the component is mounted twice', async () => {
    const api = anApi({ reconcile: DONE });

    render(
      <StrictMode>
        <ReconciledBookList scanId="an-id" books={DETECTED} mode="afterAnalysis" api={api} />
      </StrictMode>,
    );

    await screen.findByText('Confirmé');
    expect(api.reconcile).toHaveBeenCalledOnce();
  });
});

describe('ReconciledBookList, on opening the detail of an upload', () => {
  it('reads the kept state, and reconciles nothing when every book has its status', async () => {
    const api = anApi({ read: DONE });

    render(<ReconciledBookList scanId="an-id" books={DETECTED} mode="detail" api={api} />);

    await screen.findByText('Confirmé');
    expect(api.read).toHaveBeenCalledWith('an-id');
    expect(api.reconcile).not.toHaveBeenCalled();
  });

  it('reconciles in turn when a book was never tried (FR-024)', async () => {
    const api = anApi({ read: NEVER_TRIED, reconcile: DONE });

    render(<ReconciledBookList scanId="an-id" books={DETECTED} mode="detail" api={api} />);

    await screen.findByText('Confirmé');
    expect(api.read).toHaveBeenCalledOnce();
    expect(api.reconcile).toHaveBeenCalledOnce();
  });

  it('sends a single read and a single reconciliation even when mounted twice', async () => {
    const api = anApi({ read: NEVER_TRIED, reconcile: DONE });

    render(
      <StrictMode>
        <ReconciledBookList scanId="an-id" books={DETECTED} mode="detail" api={api} />
      </StrictMode>,
    );

    await screen.findByText('Confirmé');
    expect(api.read).toHaveBeenCalledOnce();
    expect(api.reconcile).toHaveBeenCalledOnce();
  });
});

describe('ReconciledBookList, on opening the detail of an upload, part 2', () => {
  it('shows the books never tried as being checked, while it reconciles', async () => {
    const api = anApi({ read: books(withoutVerdict(0, 'La Peste', 'pending')) });
    api.reconcile.mockImplementation(
      async () =>
        new Promise<never>(() => {
          // Never answers: the books stay « being checked ».
        }),
    );

    render(<ReconciledBookList scanId="an-id" books={DETECTED} mode="detail" api={api} />);

    await waitFor(() => {
      expect(api.reconcile).toHaveBeenCalledOnce();
    });
    expect(screen.getAllByText('Vérification en cours…')).toHaveLength(1);
  });
});
