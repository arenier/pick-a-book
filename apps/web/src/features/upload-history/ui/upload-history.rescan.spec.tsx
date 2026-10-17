import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DetectedBook } from '../model/detected-book';
import type { DetailAnswer, RescanAnswer } from '../model/history-state';
import type { ObserveEnd } from './list/history-screen';
import { UploadHistory } from './upload-history';
import type { LoadDetail, RescanShelfScan } from './detail/use-entry-detail';
import type { ListPage } from './list/use-history';

/**
 * Going from one upload to another while an analysis runs again (specs/002-upload-history, US3):
 * the answer belongs to the upload it was asked for, and the next upload is a screen of its own —
 * its button is not held by a run it knows nothing about.
 */
const idA = '00000000-0000-4000-8000-00000000000a';
const idB = '00000000-0000-4000-8000-00000000000b';

const LA_PESTE: DetectedBook[] = [{ author: 'Albert Camus', title: 'La Peste', confidence: 0.9 }];

const failedUpload = (id: string): DetailAnswer => ({
  status: 'found',
  entry: {
    id,
    sentAt: new Date('2026-09-27T14:03:12.481Z'),
    outcome: { kind: 'failed' },
    hasThumbnail: false,
  },
  books: undefined,
});

const button = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Relancer l’analyse' });

const stopWatching = (): void => {
  // Nothing watched.
};
const observeEnd: ObserveEnd = () => stopWatching;

/** A re-run of A that answers when the spec lets it, so that the user can move on meanwhile. */
function aRescanOfA() {
  const resolvers: (() => void)[] = [];
  const answer: RescanAnswer = { status: 'completed', books: LA_PESTE };
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

function renderOn(id: string, rescan: RescanShelfScan) {
  const load = vi.fn<LoadDetail>(async (wanted) => failedUpload(wanted));
  const list = vi.fn<ListPage>(async () => ({ status: 'page', entries: [], next: null }));
  const view = (entryId: string) => (
    <UploadHistory
      entryId={entryId}
      list={list}
      load={load}
      rescan={rescan}
      observeEnd={observeEnd}
    />
  );
  const { rerender } = render(view(id));

  return {
    goTo: (next: string) => {
      rerender(view(next));
    },
  };
}

describe('UploadHistory, an analysis running again while the user moves to another upload', () => {
  it('does not write its books into the next upload', async () => {
    const slow = aRescanOfA();
    const { goTo } = renderOn(idA, slow.rescan);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });
    fireEvent.click(button());
    goTo(idB);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    slow.answer();

    await waitFor(() => {
      expect(slow.rescan).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText('La Peste')).toBeNull();
    expect(button().disabled).toBe(false);
  });

  it('lets the next upload run its own analysis again', async () => {
    const slow = aRescanOfA();
    const { goTo } = renderOn(idA, slow.rescan);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });
    fireEvent.click(button());
    goTo(idB);
    await waitFor(() => {
      expect(button().disabled).toBe(false);
    });

    fireEvent.click(button());

    await waitFor(() => {
      expect(slow.rescan).toHaveBeenCalledWith(idB);
    });
    slow.answer();
  });
});
