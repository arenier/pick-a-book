import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { EntryDetailScreen } from './entry-detail-screen';
import { HistoryScreen, type HistoryScreenProps } from './history-screen';
import { createHistoryUpdates } from './history-updates';
import type { LoadDetail, RescanShelfScan } from './use-entry-detail';

export interface UploadHistoryProps extends Omit<HistoryScreenProps, 'updates'> {
  /** The upload whose detail to show; absent: the list. The shell reads it from the route. */
  readonly entryId?: string;
  /** Loads an upload; injected by the specs, the real API client otherwise. */
  readonly load?: LoadDetail;
  /** Runs the analysis of an upload again; injected by the specs, the real API client otherwise. */
  readonly rescan?: RescanShelfScan;
}

/**
 * The two screens of the history, and what ties them together (specs/002-upload-history, US2,
 * research.md §3): the list and the detail of one upload.
 *
 * The list stays **mounted**, hidden, while a detail is shown, so that coming back finds the pages
 * already loaded — no request is made again — and puts the user back at the position they left
 * (scenario 4). It is only mounted once the user has been to it: opening an upload from its address
 * asks for that upload, not for a list nobody sees.
 */
export function UploadHistory({ entryId, load, rescan, list, observeEnd }: UploadHistoryProps) {
  // The channel from the detail to the list: one, for as long as the history is on screen.
  const [updates] = useState(createHistoryUpdates);
  const [listMounted, setListMounted] = useState(entryId === undefined);
  if (entryId === undefined && !listMounted) {
    setListMounted(true);
  }
  useRememberedScroll(entryId === undefined);

  return (
    <>
      {listMounted && (
        <div hidden={entryId !== undefined}>
          <HistoryScreen list={list} observeEnd={observeEnd} updates={updates} />
        </div>
      )}
      {entryId !== undefined && (
        // One screen per upload: what a run in flight left in the state of the last one — its
        // books, its "running" guard — must not follow the user to the next.
        <EntryDetailScreen
          key={entryId}
          id={entryId}
          load={load}
          rescan={rescan}
          onRescanned={updates.publish}
        />
      )}
    </>
  );
}

/**
 * Remembers where the list was scrolled to, and goes back there when it is shown again. The
 * position is followed while the list is on screen, not read when it is left: hiding it shortens
 * the page, and the browser clamps the scroll before anything can read it.
 */
function useRememberedScroll(listShown: boolean): void {
  const position = useRef(0);

  useEffect(() => {
    const remember = () => {
      // Only while the list is what is on screen: the scrolling of a detail is not its position.
      if (listShown) {
        position.current = window.scrollY;
      }
    };
    window.addEventListener('scroll', remember, { passive: true });

    return () => {
      window.removeEventListener('scroll', remember);
    };
  }, [listShown]);

  const wasShown = useRef(listShown);
  useLayoutEffect(() => {
    // Back to the list from a detail: its position, once the list is on screen again.
    if (listShown && !wasShown.current) {
      window.scrollTo(0, position.current);
    }
    wasShown.current = listShown;
  }, [listShown]);
}
