import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReconciledBookList } from './reconciled-book-list';
import { aPendingApi, anApi, books, confirmed, withoutVerdict } from './testing';

const PESTE = { title: 'La Pest', author: 'Albert Camus' };
const RIEN = { title: 'Rien', author: undefined };
const BOTH = [PESTE, RIEN];
const ONLY_PESTE = [PESTE];
const ONLY_RIEN = [RIEN];

const TITLE_ONLY = [{ title: 'La Peste' }];
const SAME_AS_REFERENCE = [{ title: 'La peste', author: 'Albert Camus' }];

const item = (index: number) => screen.getAllByRole('listitem')[index];
const mention = (text: string) => screen.queryByText(text);

describe('ReconciledBookList, while the catalogue is being asked', () => {
  it('shows the detected books at once, each « vérification en cours »', () => {
    const { api } = aPendingApi();

    render(<ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={api} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(item(0).textContent).toContain('La Pest');
    expect(item(0).textContent).toContain('Albert Camus');
    expect(within(item(0)).queryByText('Vérification en cours…')).not.toBeNull();
    expect(within(item(1)).queryByText('Vérification en cours…')).not.toBeNull();
  });

  it('replaces the mention with the status once the answer comes', async () => {
    const pending = aPendingApi();
    render(
      <ReconciledBookList scanId="an-id" books={BOTH} mode="afterAnalysis" api={pending.api} />,
    );

    await act(async () => {
      pending.answer(
        books(
          confirmed(0, { title: 'La Pest', author: 'Albert Camus' }),
          withoutVerdict(1, 'Rien', 'not_found'),
        ),
      );
    });

    expect(within(item(0)).queryByText('Confirmé')).not.toBeNull();
    expect(within(item(1)).queryByText('Inconnu du catalogue')).not.toBeNull();
    expect(mention('Vérification en cours…')).toBeNull();
  });
});

describe('ReconciledBookList, a confirmed book (FR-006, FR-022, FR-023)', () => {
  it('shows the reference form, and what was read after it when it differs', async () => {
    const answer = books(confirmed(0, PESTE));
    render(
      <ReconciledBookList
        scanId="an-id"
        books={ONLY_PESTE}
        mode="afterAnalysis"
        api={anApi({ reconcile: answer })}
      />,
    );

    await screen.findByText('Confirmé');

    expect(item(0).textContent).toContain('La peste — Albert Camus');
    expect(item(0).textContent).toContain('Lu : La Pest — Albert Camus');
  });

  it('does not repeat what was read when it is the reference', async () => {
    const answer = books(confirmed(0, { title: 'La peste', author: 'Albert Camus' }));
    render(
      <ReconciledBookList
        scanId="an-id"
        books={SAME_AS_REFERENCE}
        mode="afterAnalysis"
        api={anApi({ reconcile: answer })}
      />,
    );

    await screen.findByText('Confirmé');

    expect(mention('Lu : La peste — Albert Camus')).toBeNull();
    expect(item(0).textContent).not.toContain('Lu :');
  });
});

describe('ReconciledBookList, a confirmed book (FR-006, FR-022, FR-023), part 2', () => {
  it('says « confirmé sur le titre seul » when no author was read', async () => {
    const answer = books(confirmed(0, { title: 'La Peste' }, { titleOnly: true }));
    render(
      <ReconciledBookList
        scanId="an-id"
        books={TITLE_ONLY}
        mode="afterAnalysis"
        api={anApi({ reconcile: answer })}
      />,
    );

    await screen.findByText('Confirmé sur le titre seul');

    expect(item(0).textContent).toContain('Confirmé');
  });
});

describe('ReconciledBookList, the source (FR-023)', () => {
  it('cites the catalogue where a reference is shown', async () => {
    const answer = books(confirmed(0, PESTE));
    render(
      <ReconciledBookList
        scanId="an-id"
        books={ONLY_PESTE}
        mode="afterAnalysis"
        api={anApi({ reconcile: answer })}
      />,
    );

    await screen.findByText('Source : catalogue général de la BnF');

    expect(item(0).textContent).toContain('Confirmé');
  });

  it('cites no source when nothing from the catalogue is shown', async () => {
    const answer = books(withoutVerdict(0, 'Rien', 'not_found'));
    render(
      <ReconciledBookList
        scanId="an-id"
        books={ONLY_RIEN}
        mode="afterAnalysis"
        api={anApi({ reconcile: answer })}
      />,
    );

    await screen.findByText('Inconnu du catalogue');

    expect(mention('Source : catalogue général de la BnF')).toBeNull();
  });
});
