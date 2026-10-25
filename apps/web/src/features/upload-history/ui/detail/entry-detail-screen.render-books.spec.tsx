import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DetectedBook } from '../../model/detected-book';
import type { HistoryOutcome } from '../../model/history-entry';
import type { DetailAnswer } from '../../model/history-state';
import { EntryDetailScreen, type EntryDetailScreenProps } from './entry-detail-screen';
import type { LoadDetail, RescanShelfScan } from './use-entry-detail';

/**
 * The books of an upload, worded by the shell when it hands over a renderer (specs/003, research
 * §11): the detail knows only the id of the upload and its books.
 */
const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const LA_PESTE: DetectedBook[] = [{ author: 'Albert Camus', title: 'La Peste', confidence: 0.9 }];

type RenderBooks = NonNullable<EntryDetailScreenProps['renderBooks']>;
const reconciledList = () => <p>reconciled list</p>;
const aRenderer = () => vi.fn<RenderBooks>(reconciledList);

const found = (outcome: HistoryOutcome, books?: readonly DetectedBook[]): DetailAnswer => ({
  status: 'found',
  entry: { id: anId, sentAt: new Date('2026-09-27T14:03:12.481Z'), outcome, hasThumbnail: false },
  books,
});

const loadOf = (...answers: DetailAnswer[]) =>
  vi.fn<LoadDetail>(async () => answers.shift() ?? { status: 'error', failure: 'unexpected' });

const neverRescanned = vi.fn<RescanShelfScan>(async () => ({
  status: 'error',
  failure: 'unexpected',
}));

function renderDetail(
  load: LoadDetail,
  renderBooks?: EntryDetailScreenProps['renderBooks'],
  rescan: RescanShelfScan = neverRescanned,
) {
  return render(
    <EntryDetailScreen id={anId} load={load} rescan={rescan} renderBooks={renderBooks} />,
  );
}

describe('EntryDetailScreen, rendering the books', () => {
  it('hands the id of the upload and its books to the renderer, in place of the list', async () => {
    const renderBooks = aRenderer();

    renderDetail(loadOf(found({ kind: 'books', count: 1 }, LA_PESTE)), renderBooks);

    await screen.findByText('reconciled list');
    expect(renderBooks).toHaveBeenCalledWith({ id: anId, books: LA_PESTE });
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('shows the plain list when nothing renders the books', async () => {
    renderDetail(loadOf(found({ kind: 'books', count: 1 }, LA_PESTE)));

    expect((await screen.findByRole('listitem')).textContent).toBe('La Peste — Albert Camus');
  });

  it('hands the new books over once an analysis run again completes', async () => {
    const renderBooks = aRenderer();
    const rescan = vi.fn<RescanShelfScan>(async () => ({ status: 'completed', books: LA_PESTE }));

    renderDetail(loadOf(found({ kind: 'failed' })), renderBooks, rescan);
    fireEvent.click(await screen.findByRole('button', { name: 'Relancer l’analyse' }));

    await screen.findByText('reconciled list');
    expect(renderBooks).toHaveBeenCalledWith({ id: anId, books: LA_PESTE });
  });
});

describe('EntryDetailScreen, an upload with no books to word', () => {
  it.each([
    [
      'an analysis with no book',
      found({ kind: 'none' }, []),
      'Aucun livre détecté sur cette photo.',
    ],
    ['an analysis that failed', found({ kind: 'failed' }), 'L’analyse de cette photo a échoué.'],
    [
      'an analysis never started',
      found({ kind: 'notStarted' }),
      'L’analyse de cette photo n’a pas été lancée.',
    ],
  ])(
    'does not call the renderer for %s, which keeps its message',
    async (_name, answer, message) => {
      const renderBooks = aRenderer();

      renderDetail(loadOf(answer), renderBooks);

      await screen.findByText(message);
      expect(renderBooks).not.toHaveBeenCalled();
    },
  );
});
