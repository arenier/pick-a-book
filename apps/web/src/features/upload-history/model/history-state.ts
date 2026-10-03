import type { EntryDetail } from './entry-detail';
import type { HistoryEntry } from './history-entry';

/**
 * Why the history, or a page of it, or the detail of an upload, could not be loaded
 * (specs/002-upload-history, data-model.md). A kind, never a sentence (ADR 0011). A 404 is not one:
 * it is the `notFound` state of the detail.
 */
export const HISTORY_FAILURES = ['offline', 'rateLimited', 'unexpected'] as const;

export type HistoryFailure = (typeof HISTORY_FAILURES)[number];

/**
 * What a request for one page of the history comes back with — never a rejection, never a
 * sentence (ADR 0011).
 */
export type PageAnswer =
  | {
      readonly status: 'page';
      readonly entries: readonly HistoryEntry[];
      /** The cursor of the next page; `null` on the last one. */
      readonly next: string | null;
    }
  | { readonly status: 'error'; readonly failure: HistoryFailure };

/**
 * What a request for the detail of one upload comes back with. A 404 is not a failure: the link
 * is stale or wrong, and the screen says so (spec, Edge Cases).
 */
export type DetailAnswer =
  | ({ readonly status: 'found' } & EntryDetail)
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly failure: HistoryFailure };

/**
 * What the history screen shows — one state at a time. `error` is never `empty` (FR-010): an
 * history that could not be loaded must not read as an history with nothing in it.
 */
export type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | {
      readonly status: 'loaded';
      readonly entries: readonly HistoryEntry[];
      /** The cursor of the next page; `null` once the last one is loaded. */
      readonly next: string | null;
      readonly loadingMore: boolean;
      /** Set when the next page could not be loaded: the entries stay, with a local retry. */
      readonly moreFailure?: HistoryFailure;
    }
  | { readonly status: 'error'; readonly failure: HistoryFailure };

/**
 * What the detail screen shows — one state at a time. `notFound` and `error` are told apart: a
 * stale link and a server out of reach are not the same thing to the user.
 */
export type EntryDetailState =
  | { readonly status: 'loading' }
  | ({ readonly status: 'loaded' } & EntryDetail)
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly failure: HistoryFailure };
