import { useCallback, useEffect, useRef } from 'react';
import { useMessages } from '@pick-a-book/shared-i18n';
import { Button, Spinner, buttonVariants, cn } from '@pick-a-book/shared-ui';

import { listShelfScans } from '../../api/history-api';
import type { HistoryState } from '../../model/history-state';
import { HistoryEntryCard } from './history-entry-card';
import { HistoryFailureMessage } from '../history-failure-message';
import type { HistoryUpdates } from '../history-updates';
import { useHistory, type ListPage } from './use-history';

/**
 * Calls `onReach` when `element` comes into view, and answers how to stop. The browser's
 * `IntersectionObserver` by default; a spec hands in its own, jsdom having none.
 */
export type ObserveEnd = (element: Element, onReach: () => void) => () => void;

const stopWatching = (): void => {
  // Nothing is watched: there is nothing to stop.
};

const observeWithBrowser: ObserveEnd = (element, onReach) => {
  if (typeof IntersectionObserver === 'undefined') {
    // No observer: the « Show more » button is the way to the next page (research.md §4).
    return stopWatching;
  }
  const observer = new IntersectionObserver((records) => {
    if (records.some((record) => record.isIntersecting)) {
      onReach();
    }
  });
  observer.observe(element);

  return () => {
    observer.disconnect();
  };
};

const listFromApi: ListPage = async (request) => listShelfScans(request);

export interface HistoryScreenProps {
  /** Loads a page; injected by the specs, the real API client otherwise. */
  readonly list?: ListPage;
  /** Watches the end of the list; injected by the specs, the browser's otherwise. */
  readonly observeEnd?: ObserveEnd;
  /** What the detail says uploads became, to show it without loading the list again. */
  readonly updates?: HistoryUpdates;
}

/**
 * The history of the uploads: newest first, a page at a time, from the first photo ever sent
 * (specs/002-upload-history, US1, FR-003, FR-006, FR-010).
 */
export function HistoryScreen({
  list = listFromApi,
  observeEnd = observeWithBrowser,
  updates,
}: HistoryScreenProps) {
  const { t } = useMessages('upload-history');
  const { state, loadFirst, loadMore, updateOutcome } = useHistory(list);

  useEffect(() => updates?.subscribe(updateOutcome), [updates, updateOutcome]);

  if (state.status === 'loading') {
    return (
      <output className="flex items-start gap-2">
        <Spinner className="mt-1 shrink-0" />
        {t('history.loading')}
      </output>
    );
  }
  if (state.status === 'error') {
    return (
      <section className="flex flex-col gap-3">
        <HistoryFailureMessage failure={state.failure} />
        <RetryButton onRetry={loadFirst} />
      </section>
    );
  }
  if (state.status === 'empty') {
    return (
      <section className="flex flex-col gap-3">
        <p>{t('history.empty')}</p>
        <a className={cn(buttonVariants({ variant: 'outline' }), 'w-full')} href="#/">
          {t('history.upload')}
        </a>
      </section>
    );
  }

  return <LoadedHistory state={state} observeEnd={observeEnd} onLoadMore={loadMore} />;
}

function RetryButton({ onRetry }: { readonly onRetry: () => Promise<void> }) {
  const { t } = useMessages('upload-history');
  const onClick = useCallback(() => {
    void onRetry();
  }, [onRetry]);

  return (
    <Button variant="outline" className="w-full" onClick={onClick}>
      {t('history.retry')}
    </Button>
  );
}

interface LoadedHistoryProps {
  readonly state: Extract<HistoryState, { status: 'loaded' }>;
  readonly observeEnd: ObserveEnd;
  readonly onLoadMore: () => Promise<void>;
}

/** The entries, and what follows them: a failed page, the button, and the end the observer watches. */
function LoadedHistory({ state, observeEnd, onLoadMore }: LoadedHistoryProps) {
  const end = useRef<HTMLDivElement>(null);
  const failed = state.moreFailure !== undefined;
  // Not while a page is loading, nor after one failed (the retry is the user's to press), nor
  // when there is no page left.
  const watching = state.next !== null && !state.loadingMore && !failed;

  useEffect(() => {
    const element = end.current;

    return element !== null && watching
      ? observeEnd(element, () => {
          void onLoadMore();
        })
      : stopWatching;
  }, [observeEnd, onLoadMore, watching]);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {state.entries.map((entry) => (
          <li key={entry.id}>
            <HistoryEntryCard entry={entry} />
          </li>
        ))}
      </ul>
      <WhatFollows state={state} onLoadMore={onLoadMore} />
      <div ref={end} aria-hidden="true" />
    </section>
  );
}

/** After the entries: the page that failed and its retry, or the button to show more. */
function WhatFollows({
  state,
  onLoadMore,
}: {
  readonly state: LoadedHistoryProps['state'];
  readonly onLoadMore: () => Promise<void>;
}) {
  const { t } = useMessages('upload-history');
  const onClick = useCallback(() => {
    void onLoadMore();
  }, [onLoadMore]);

  if (state.moreFailure !== undefined) {
    return (
      <>
        <HistoryFailureMessage failure={state.moreFailure} />
        <RetryButton onRetry={onLoadMore} />
      </>
    );
  }

  return state.next === null ? null : (
    <Button variant="outline" className="w-full" disabled={state.loadingMore} onClick={onClick}>
      {state.loadingMore ? t('history.loadingMore') : t('history.loadMore')}
    </Button>
  );
}
