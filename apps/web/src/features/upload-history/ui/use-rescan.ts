import { useCallback, useRef, type Dispatch, type SetStateAction } from 'react';

import { outcomeOfCount, type HistoryOutcome } from '../model/history-entry';
import type { EntryDetailState, RescanAnswer } from '../model/history-state';

type Loaded = Extract<EntryDetailState, { status: 'loaded' }>;

interface UseRescanOptions {
  readonly id: string;
  /** Runs the analysis again. */
  readonly rescan: (id: string) => Promise<RescanAnswer>;
  /** Loads the upload again — for the one that turns out to have its books already. */
  readonly reload: () => Promise<void>;
  readonly setState: Dispatch<SetStateAction<EntryDetailState>>;
  readonly onRescanned?: (id: string, outcome: HistoryOutcome) => void;
}

/**
 * Running the analysis of an upload again, from its detail (specs/002-upload-history, US3): one at
 * a time, with the result — its books, or why it did not run — written into the state of the detail.
 */
export function useRescan({ id, rescan, reload, setState, onRescanned }: UseRescanOptions) {
  const running = useRef(false);

  return useCallback(async () => {
    // One analysis at a time: the button is disabled while one runs, and this covers a click that
    // slipped through before React re-rendered.
    if (running.current) {
      return;
    }
    running.current = true;
    setState((now) => (now.status === 'loaded' ? { ...now, rescan: 'running' } : now));

    const answer = await rescan(id);
    running.current = false;
    if (answer.status === 'alreadyCompleted') {
      // Another tab got there first: the upload has its books — load it to show them.
      await reload();
      return;
    }
    setState((now) => (now.status === 'loaded' ? afterRescan(now, answer) : now));
    if (answer.status === 'completed') {
      onRescanned?.(id, outcomeOfCount(answer.books.length));
    }
  }, [id, rescan, reload, setState, onRescanned]);
}

/** The detail after its analysis ran again: with its books, or with why it did not. */
function afterRescan(
  loaded: Loaded,
  answer: Exclude<RescanAnswer, { status: 'alreadyCompleted' }>,
): Loaded {
  if (answer.status === 'error') {
    return { ...loaded, rescan: { failure: answer.failure } };
  }

  return {
    ...loaded,
    entry: { ...loaded.entry, outcome: outcomeOfCount(answer.books.length) },
    books: answer.books,
    rescan: 'idle',
  };
}
