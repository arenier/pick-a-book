import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HistoryEntry } from '../model/history-entry';
import type { DetailAnswer, PageAnswer } from '../model/history-state';
import type { ObserveEnd } from './history-screen';
import { UploadHistory } from './upload-history';
import type { LoadDetail } from './use-entry-detail';
import type { ListPage } from './use-history';

const idOf = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const anEntry = (index: number): HistoryEntry => ({
  id: idOf(index),
  sentAt: new Date(Date.UTC(2026, 8, 27, 14, 0, 0) - index * 60_000),
  outcome: { kind: 'books', count: index + 1 },
  hasThumbnail: false,
});

const firstPage: PageAnswer = {
  status: 'page',
  entries: [0, 1].map((index) => anEntry(index)),
  next: 'cursor-1',
};
const secondPage: PageAnswer = {
  status: 'page',
  entries: [2].map((index) => anEntry(index)),
  next: null,
};

const aDetail: DetailAnswer = {
  status: 'found',
  entry: anEntry(1),
  books: [{ author: undefined, title: 'La Peste', confidence: 0.9 }],
};

function aServer() {
  const pages = [firstPage, secondPage];
  const list = vi.fn<ListPage>(async () => pages.shift() ?? firstPage);
  const load = vi.fn<LoadDetail>(async () => aDetail);

  return { list, load };
}

/** The observer of the end of the list is not what is under test here. */
const stopWatching = (): void => {
  // Nothing watched.
};
const observeEnd: ObserveEnd = () => stopWatching;

function renderHistory(server: ReturnType<typeof aServer>, entryId?: string) {
  const view = (id?: string) => (
    <UploadHistory entryId={id} list={server.list} load={server.load} observeEnd={observeEnd} />
  );
  const { rerender } = render(view(entryId));

  return {
    goTo: (id?: string) => {
      rerender(view(id));
    },
  };
}

/** Both pages of the history on screen — the user has scrolled down to the second. */
async function withTwoPagesLoaded(server: ReturnType<typeof aServer>) {
  const view = renderHistory(server);
  fireEvent.click(await screen.findByRole('button', { name: 'Afficher plus' }));
  await waitFor(() => {
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  return view;
}

/** The user scrolls the page to `y`: what the browser reports, and the event that says so. */
const scrolledTo = (y: number) => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
};

describe('UploadHistory, from the history to an upload and back', () => {
  it('shows the detail of the upload, and hides the list behind it', async () => {
    const server = aServer();
    const { goTo } = await withTwoPagesLoaded(server);

    goTo(idOf(1));

    await screen.findByText('La Peste');
    expect(screen.queryByRole('link', { name: /livres? détectés?/u })).toBeNull();
  });

  // US2, scenario 4: the user finds the history where they left it.
  it('makes no new request for the list, and keeps both pages, when coming back', async () => {
    const server = aServer();
    const { goTo } = await withTwoPagesLoaded(server);

    goTo(idOf(1));
    await screen.findByText('La Peste');
    goTo();

    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(server.list).toHaveBeenCalledTimes(2);
  });
});

describe('UploadHistory, the position on the page', () => {
  const scrollTo = vi.fn<(x: number, y: number) => void>();

  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    scrollTo.mockReset();
  });

  it('puts the user back where they were when they return to the list', async () => {
    const server = aServer();
    const { goTo } = await withTwoPagesLoaded(server);
    scrolledTo(640);

    goTo(idOf(1));
    await screen.findByText('La Peste');
    goTo();

    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });

  it('does not take the scrolling of the detail for a position in the list', async () => {
    const server = aServer();
    const { goTo } = await withTwoPagesLoaded(server);
    scrolledTo(640);
    goTo(idOf(1));
    await screen.findByText('La Peste');

    scrolledTo(15);
    goTo();

    expect(scrollTo).toHaveBeenLastCalledWith(0, 640);
  });
});

describe('UploadHistory, an upload opened from its address', () => {
  it('asks for the upload, and for no page of the list the user has not seen', async () => {
    const server = aServer();

    renderHistory(server, idOf(1));

    await screen.findByText('La Peste');
    expect(server.list).not.toHaveBeenCalled();
  });

  it('loads the list when the user goes there', async () => {
    const server = aServer();
    const { goTo } = renderHistory(server, idOf(1));
    await screen.findByText('La Peste');

    goTo();

    await waitFor(() => {
      expect(screen.getAllByRole('link')).toHaveLength(2);
    });
  });
});
