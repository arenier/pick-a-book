import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetailAnswer, EntryDetailState } from '../model/history-state';

export type LoadDetail = (id: string) => Promise<DetailAnswer>;

/**
 * The state of the detail screen: the upload of the route, loaded when it comes up and again when
 * the route moves to another, with a retry. An answer that arrives after a newer request was made
 * is dropped — the last request wins, so a slow answer never overwrites a fresher one.
 */
export function useEntryDetail(id: string, load: LoadDetail) {
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

  // Once per upload, not once per run of the effect (see `useHistory`): a move to another upload,
  // or another loader, is what asks again.
  const startedFor = useRef<{ readonly id: string; readonly load: LoadDetail } | null>(null);
  useEffect(() => {
    if (startedFor.current?.id !== id || startedFor.current.load !== load) {
      startedFor.current = { id, load };
      void reload();
    }
  }, [id, load, reload]);

  return { state, reload };
}

function stateOf(answer: DetailAnswer): EntryDetailState {
  switch (answer.status) {
    case 'found': {
      return { status: 'loaded', entry: answer.entry, books: answer.books };
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
