import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { ambiguous, anApi, books, withoutVerdict } from './testing';

const CHUTE = [{ title: 'La Chute' }];
const RIEN = [{ title: 'Rien' }];

// FR-009: a status a user understands, without jargon — and never « inexistant ».
describe('ReconciledBookList, the other statuses', () => {
  it('says an ambiguous book has several possible works, and cites the catalogue', async () => {
    const api = anApi({ reconcile: books(ambiguous(0, 'La Chute')) });

    render(<ReconciledBookList scanId="an-id" books={CHUTE} mode="afterAnalysis" api={api} />);

    await screen.findByText('Plusieurs œuvres possibles');

    expect(screen.queryByText('Source : catalogue général de la BnF')).not.toBeNull();
  });

  it('says a book not found is unknown to the catalogue, never that it does not exist', async () => {
    const api = anApi({ reconcile: books(withoutVerdict(0, 'Rien', 'not_found')) });

    render(<ReconciledBookList scanId="an-id" books={RIEN} mode="afterAnalysis" api={api} />);

    await screen.findByText('Inconnu du catalogue');

    expect(document.body.textContent).not.toMatch(/inexistant/iu);
  });

  it('says a book not verified is not verified', async () => {
    const api = anApi({ reconcile: books(withoutVerdict(0, 'Rien', 'not_verified')) });

    render(<ReconciledBookList scanId="an-id" books={RIEN} mode="afterAnalysis" api={api} />);

    await screen.findByText('Non vérifié');

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
