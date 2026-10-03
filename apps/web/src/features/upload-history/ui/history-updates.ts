import type { HistoryOutcome } from '../model/history-entry';

export type HistoryUpdateListener = (id: string, outcome: HistoryOutcome) => void;

/**
 * What ties the two screens of the history together without either knowing the other
 * (specs/002-upload-history, US3, scenario 1): the detail says what an upload became, the list
 * already on screen listens. `UploadHistory`, the entry point of the slice, hands one to both.
 */
export interface HistoryUpdates {
  /** Starts telling `listener` what uploads become; answers how to stop. */
  subscribe(listener: HistoryUpdateListener): () => void;
  publish: HistoryUpdateListener;
}

export function createHistoryUpdates(): HistoryUpdates {
  const listeners = new Set<HistoryUpdateListener>();

  return {
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    publish: (id, outcome) => {
      listeners.forEach((listener) => {
        listener(id, outcome);
      });
    },
  };
}
