import { useCallback, useEffect, useRef, useState } from 'react';

import type { HistoryEntry } from '../model/history-entry';
import type { HistoryState, PageAnswer } from '../model/history-state';

export type ListPage = (request: { readonly cursor?: string }) => Promise<PageAnswer>;

/**
 * The state of the history screen and its transitions (specs/002-upload-history, data-model.md):
 * the first page, the next ones, and a retry of whichever failed.
 *
 * A page that arrives after a newer request was made — a retry, a remount — is dropped: the last
 * request wins, so a slow answer never overwrites a fresher one.
 */
export function useHistory(list: ListPage) {
  const [state, setState] = useState<HistoryState>({ status: 'loading' });
  const latest = useRef(0);
  const current = useRef(state);
  current.current = state;

  const loadFirst = useCallback(async () => {
    latest.current += 1;
    const request = latest.current;
    setState({ status: 'loading' });

    const answer = await list({});
    if (request !== latest.current) {
      return;
    }
    setState(firstPageOf(answer));
  }, [list]);

  const loadMore = useCallback(async () => {
    const before = current.current;
    // One page at a time: a second call while one is on its way, or past the last page, does nothing.
    if (before.status !== 'loaded' || before.next === null || before.loadingMore) {
      return;
    }
    // Set at once, not after the next render: two calls in the same tick must not both pass.
    current.current = { ...before, loadingMore: true, moreFailure: undefined };
    setState(current.current);
    const request = latest.current;

    const answer = await list({ cursor: before.next });
    if (request !== latest.current) {
      return;
    }
    setState((now) => (now.status === 'loaded' ? withNextPage(now, answer) : now));
  }, [list]);

  // Once per `list`, not once per run of the effect: in development React runs it twice to flush
  // out the ones that are not safe to repeat, and the API would be asked for the same page twice.
  // A real remount is a new component, and starts from nothing.
  const startedFor = useRef<ListPage | null>(null);
  useEffect(() => {
    if (startedFor.current !== list) {
      startedFor.current = list;
      void loadFirst();
    }
  }, [list, loadFirst]);

  return { state, loadFirst, loadMore };
}

function firstPageOf(answer: PageAnswer): HistoryState {
  if (answer.status === 'error') {
    return { status: 'error', failure: answer.failure };
  }
  if (answer.entries.length === 0) {
    return { status: 'empty' };
  }

  return { status: 'loaded', entries: answer.entries, next: answer.next, loadingMore: false };
}

/** The loaded history after a next page came back: appended, or the failure kept beside it. */
function withNextPage(
  loaded: Extract<HistoryState, { status: 'loaded' }>,
  answer: PageAnswer,
): HistoryState {
  if (answer.status === 'error') {
    return { ...loaded, loadingMore: false, moreFailure: answer.failure };
  }

  return {
    status: 'loaded',
    entries: concat(loaded.entries, answer.entries),
    next: answer.next,
    loadingMore: false,
  };
}

const concat = (first: readonly HistoryEntry[], second: readonly HistoryEntry[]) => [
  ...first,
  ...second,
];
