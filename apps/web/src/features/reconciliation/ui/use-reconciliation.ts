import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

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

type SetState = Dispatch<SetStateAction<ReconciliationState>>;

/** What the list works with: the state, and how to act on it. */
export interface Reconciliation {
  readonly state: ReconciliationState;
  /** The last choice that could not be recorded, and why — the choice stays open. */
  readonly refusal:
    | { readonly position: number; readonly failure: ReconciliationFailure }
    | undefined;
  /** Records the user's choice for an ambiguous book. */
  readonly choose: (position: number, choice: AmbiguityChoice) => void;
  /** Asks again for the books not verified; `retrying` while the answer is awaited. */
  readonly retry: () => void;
  readonly retrying: boolean;
  /** Why the last retry failed, the books of the state staying on screen. */
  readonly retryFailure: ReconciliationFailure | undefined;
}

/**
 * `afterAnalysis`: the analysis has just ended, so the books are reconciled straight away.
 * `detail`: the detail of an upload is opened — the kept state is read first, and the books never
 * tried (an upload from before the feature, a screen left before the answer) are reconciled
 * after (FR-024).
 */
export type ReconciliationMode = 'afterAnalysis' | 'detail';

/** Whether the component is still on screen: an answer that comes late is dropped. */
function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  return mounted;
}

/**
 * Asks for the reconciliation of an analysis, **once** per analysis and mode: the component may
 * be mounted twice (`StrictMode`), and the second mount must not send the request again — a ref
 * survives that remount, a flag in an effect's closure does not.
 */
export function useReconciliation(
  scanId: string,
  mode: ReconciliationMode,
  api: ReconciliationApi,
): Reconciliation {
  const [state, setState] = useState<ReconciliationState>({ status: 'checking' });
  const mounted = useMounted();
  const asked = useRef<string | null>(null);

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
  }, [scanId, mode, api, mounted]);

  const effects = { mounted, setState };

  return { state, ...useChoice(scanId, api, effects), ...useRetry(scanId, api, effects) };
}

interface Effects {
  readonly mounted: { current: boolean };
  readonly setState: SetState;
}

function useChoice(scanId: string, api: ReconciliationApi, effects: Effects) {
  const [refusal, setRefusal] = useState<Reconciliation['refusal']>();
  const { mounted, setState } = effects;
  const choose = useCallback(
    (position: number, choice: AmbiguityChoice): void => {
      setRefusal(undefined);
      void applyChoice(scanId, api, { position, choice }, { mounted, setState, setRefusal });
    },
    [scanId, api, mounted, setState],
  );

  return { refusal, choose };
}

/** Read through a function: the flag changes while an answer is awaited, which a narrowing cannot see. */
function isMounted(effects: Effects): boolean {
  return effects.mounted.current;
}

async function applyChoice(
  scanId: string,
  api: ReconciliationApi,
  chosen: { readonly position: number; readonly choice: AmbiguityChoice },
  effects: Effects & { readonly setRefusal: Dispatch<SetStateAction<Reconciliation['refusal']>> },
): Promise<void> {
  const answer = await api.decide(scanId, chosen.position, chosen.choice);
  if (!isMounted(effects)) {
    return;
  }
  if (answer.status === 'book') {
    effects.setState((current) => replaced(current, answer.book));
  } else if (answer.failure === 'conflict') {
    // The book was decided elsewhere: what the server keeps is the truth.
    const kept = stateOf(await api.read(scanId));
    if (isMounted(effects) && kept.status === 'ready') {
      effects.setState(kept);
    }
  } else {
    effects.setRefusal({ position: chosen.position, failure: answer.failure });
  }
}

function useRetry(scanId: string, api: ReconciliationApi, effects: Effects) {
  const [retrying, setRetrying] = useState(false);
  const [retryFailure, setRetryFailure] = useState<ReconciliationFailure>();
  const { mounted, setState } = effects;
  const retry = useCallback((): void => {
    setRetrying(true);
    setRetryFailure(undefined);
    void applyRetry(scanId, api, { mounted, setState, setRetrying, setRetryFailure });
  }, [scanId, api, mounted, setState]);

  return { retry, retrying, retryFailure };
}

async function applyRetry(
  scanId: string,
  api: ReconciliationApi,
  effects: Effects & {
    readonly setRetrying: Dispatch<SetStateAction<boolean>>;
    readonly setRetryFailure: Dispatch<SetStateAction<ReconciliationFailure | undefined>>;
  },
): Promise<void> {
  const answer = await api.reconcile(scanId);
  if (!effects.mounted.current) {
    return;
  }
  effects.setRetrying(false);
  if (answer.status === 'books') {
    effects.setState({ status: 'ready', books: answer.books });
  } else {
    effects.setRetryFailure(answer.failure);
  }
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
