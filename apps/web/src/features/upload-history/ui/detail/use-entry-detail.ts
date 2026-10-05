import { useCallback, useEffect, useRef, useState } from 'react';

import type { HistoryOutcome } from '../../model/history-entry';
import type { DetailAnswer, EntryDetailState, RescanAnswer } from '../../model/history-state';
import { useRescan } from './use-rescan';

export type LoadDetail = (id: string) => Promise<DetailAnswer>;

/** Runs the analysis of an upload again; injected by the specs, the real API client otherwise. */
export type RescanShelfScan = (id: string) => Promise<RescanAnswer>;

/**
 * The state of the detail screen: the upload of the route, loaded when it comes up and again when
 * the route moves to another, with a retry — and running its analysis again when that is offered
 * (specs/002-upload-history, US3). An answer that arrives after a newer request was made is
 * dropped — the last request wins, so a slow answer never overwrites a fresher one.
 *
 * `onRescanned` says what the upload now is, for whoever shows the list to keep it in step.
 */
export function useEntryDetail(
  id: string,
  load: LoadDetail,
  rescan: RescanShelfScan,
  onRescanned?: (id: string, outcome: HistoryOutcome) => void,
) {
  const [state, setState] = useState<EntryDetailState>({ status: 'loading' });
  const latest = useRef(0);

  const reload = useCallback(async () => {
    latest.current += 1;
    const request = latest.current;
    setState({ status: 'loading' });

    const answer = await load(id);
    if (request === latest.current) {
      setState(stateOf(answer));
    }
  }, [id, load]);

  // Once per upload, not once per run of the effect: in development React runs it twice to flush
  // out the ones that are not safe to repeat. A move to another upload, or another loader, is
  // what asks again.
  const startedFor = useRef<{ readonly id: string; readonly load: LoadDetail } | null>(null);
  useEffect(() => {
    if (startedFor.current?.id !== id || startedFor.current.load !== load) {
      startedFor.current = { id, load };
      void reload();
    }
  }, [id, load, reload]);

  const runAgain = useRescan({ id, rescan, reload, setState, onRescanned });

  return { state, reload, runAgain };
}

function stateOf(answer: DetailAnswer): EntryDetailState {
  switch (answer.status) {
    case 'found': {
      return { status: 'loaded', entry: answer.entry, books: answer.books, rescan: 'idle' };
    }
    case 'notFound': {
      return { status: 'notFound' };
    }
    case 'error': {
      return { status: 'error', failure: answer.failure };
    }
    default: {
      const unhandled: never = answer;

      return unhandled;
    }
  }
}
