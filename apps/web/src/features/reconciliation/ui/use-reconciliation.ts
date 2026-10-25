import { useEffect, useRef, useState } from 'react';

import {
  readReconciliation,
  reconcile,
  type ReconciliationAnswer,
} from '../api/reconciliation-api';
import type { ReconciledBook } from '../model/reconciled-book';
import type { ReconciliationState } from '../model/reconciliation-state';

/**
 * The two calls the list makes; injected by the specs, the real API client otherwise.
 */
export interface ReconciliationApi {
  readonly reconcile: (scanId: string) => Promise<ReconciliationAnswer>;
  readonly read: (scanId: string) => Promise<ReconciliationAnswer>;
}

export const realApi: ReconciliationApi = {
  reconcile: async (scanId) => reconcile(scanId),
  read: async (scanId) => readReconciliation(scanId),
};

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
): ReconciliationState {
  const [state, setState] = useState<ReconciliationState>({ status: 'checking' });
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

  return state;
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
