import type { ReconciledBook } from './reconciled-book';
import type { ReconciliationFailure } from './reconciliation-failure';

/**
 * What the list shows (data-model.md): the books are `checking` until the first answer, then
 * `ready` with the state the API gave, or `failed` — and the screen then shows the detected books
 * as « not verified » (FR-008).
 */
export type ReconciliationState =
  | { readonly status: 'checking' }
  | { readonly status: 'ready'; readonly books: readonly ReconciledBook[] }
  | { readonly status: 'failed'; readonly failure: ReconciliationFailure };
