import { useEffect, useRef, useState } from 'react';

import {
  decide,
  readReconciliation,
  reconcile,
  type DecisionAnswer,
  type ReconciliationAnswer,
} from '../api/reconciliation-api';
import type { ReconciledBook } from '../model/reconciled-book';
import type { AmbiguityChoice, ReconciliationFailure } from '../model/reconciliation-failure';
import type { ReconciliationState } from '../model/reconciliation-state';

/**
 * The calls the list makes; injected by the specs, the real API client otherwise.
 */
export interface ReconciliationApi {
  readonly reconcile: (scanId: string) => Promise<ReconciliationAnswer>;
  readonly read: (scanId: string) => Promise<ReconciliationAnswer>;
  readonly decide: (
    scanId: string,
    position: number,
    choice: AmbiguityChoice,
  ) => Promise<DecisionAnswer>;
}

export const realApi: ReconciliationApi = {
  reconcile: async (scanId) => reconcile(scanId),
  read: async (scanId) => readReconciliation(scanId),
  decide: async (scanId, position, choice) => decide(scanId, position, choice),
};

/** What the list works with: the state, and how to record the choice for an ambiguous book. */
export interface Reconciliation {
  readonly state: ReconciliationState;
  /** The last choice that could not be recorded, and why — the choice stays open. */
  readonly refusal:
    | { readonly position: number; readonly failure: ReconciliationFailure }
    | undefined;
  readonly choose: (position: number, choice: AmbiguityChoice) => Promise<void>;
  /** Asks again for the books not verified; `retrying` while the answer is awaited. */
  readonly retry: () => Promise<void>;
  readonly retrying: boolean;
  /** Why the last retry failed, the books of the previous state staying on screen. */
  readonly retryFailure: ReconciliationFailure | undefined;
}

/**
 * `afterAnalysis`: the analysis has just ended, so the books are reconciled straight away.
 * `detail`: the detail of an upload is opened — the kept state is read first, and the books never
 * tried (an upload from before the feature, a screen left before the answer) are reconciled
 * after (FR-024).
 */
export type ReconciliationMode = 'afterAnalysis' | 'detail';

/**
 * Asks for the reconciliation of an analysis, **once** per analysis and mode: the component may
 * be mounted twice (`StrictMode`), and the second mount must not send the request again — a refs
 * survives that remount, a flag in an effect's closure does not.
 */
export function useReconciliation(
  scanId: string,
  mode: ReconciliationMode,
  api: ReconciliationApi,
): Reconciliation {
  const [state, setState] = useState<ReconciliationState>({ status: 'checking' });
  const [refusal, setRefusal] = useState<Reconciliation['refusal']>(undefined);
  const asked = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const key = `${mode}:${scanId}`;
    if (asked.current === key) {
      return;
    }
    asked.current = key;
    void run(scanId, mode, api, (next) => {
      if (mounted.current) {
        setState(next);
      }
    });
  }, [scanId, mode, api]);

  const [retrying, setRetrying] = useState(false);
  const [retryFailure, setRetryFailure] = useState<ReconciliationFailure | undefined>(undefined);

  const retry = async (): Promise<void> => {
    setRetrying(true);
    setRetryFailure(undefined);
    const answer = await api.reconcile(scanId);
    if (!mounted.current) {
      return;
    }
    setRetrying(false);
    if (answer.status === 'books') {
      setState({ status: 'ready', books: answer.books });
    } else if (state.status === 'ready') {
      setRetryFailure(answer.failure);
    } else {
      setState({ status: 'failed', failure: answer.failure });
    }
  };

  const choose = async (position: number, choice: AmbiguityChoice): Promise<void> => {
    setRefusal(undefined);
    const answer = await api.decide(scanId, position, choice);
    if (!mounted.current) {
      return;
    }
    if (answer.status === 'book') {
      setState((current) => replaced(current, answer.book));
    } else if (answer.failure === 'conflict') {
      // The book was decided elsewhere: what the server keeps is the truth.
      const kept = stateOf(await api.read(scanId));
      if (mounted.current && kept.status === 'ready') {
        setState(kept);
      }
    } else {
      setRefusal({ position, failure: answer.failure });
    }
  };

  return { state, refusal, choose, retry, retrying, retryFailure };
}

function replaced(state: ReconciliationState, book: ReconciledBook): ReconciliationState {
  return state.status === 'ready'
    ? {
        status: 'ready',
        books: state.books.map((one) => (one.position === book.position ? book : one)),
      }
    : state;
}

async function run(
  scanId: string,
  mode: ReconciliationMode,
  api: ReconciliationApi,
  show: (state: ReconciliationState) => void,
): Promise<void> {
  if (mode === 'afterAnalysis') {
    show(stateOf(await api.reconcile(scanId)));
    return;
  }

  const kept = stateOf(await api.read(scanId));
  show(kept);
  if (kept.status !== 'ready' || !kept.books.some((book) => book.status === 'pending')) {
    return;
  }

  // Some books were never tried: they are being checked now. If that fails, they are not verified.
  const reconciled = stateOf(await api.reconcile(scanId));
  show(
    reconciled.status === 'ready' ? reconciled : { status: 'ready', books: untried(kept.books) },
  );
}

function stateOf(answer: ReconciliationAnswer): ReconciliationState {
  return answer.status === 'books'
    ? { status: 'ready', books: answer.books }
    : { status: 'failed', failure: answer.failure };
}

/** The books that were never tried, once trying them has failed: not verified, like any other. */
function untried(books: readonly ReconciledBook[]): readonly ReconciledBook[] {
  return books.map((book) =>
    book.status === 'pending'
      ? { position: book.position, read: book.read, status: 'not_verified' }
      : book,
  );
}
