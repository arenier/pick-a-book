import type { Result } from '@pick-a-book/shared-result';

import type { AmbiguityDecision } from './ambiguity-decision.js';
import type { BookAlreadyReconciled } from './book-already-reconciled.error.js';
import type { BookNotAmbiguous } from './book-not-ambiguous.error.js';
import type { BookReconciliation, ReconciliationAttempt } from './book-reconciliation.js';
import type { ScanRef } from './scan-ref.js';
import type { ShelfBookRef } from './shelf-book-ref.js';

export const BOOK_RECONCILIATION_REPOSITORY_PORT = 'BookReconciliationRepositoryPort';

/**
 * Outbound port that keeps the reconciliation of every book (ADR 0006: Postgres).
 *
 * `saveAttempt` refuses a second final attempt on a book — the rule is enforced where the write
 * happens, so two reconciliations of the same analysis at once cannot both settle a book
 * (research §3). A database that is down is not part of that vocabulary: the promise rejects.
 */
export interface BookReconciliationRepositoryPort {
  /** Every book of the analysis that has at least one attempt, by position. */
  findByScan(scanRef: ScanRef): Promise<readonly BookReconciliation[]>;
  findBook(bookRef: ShelfBookRef): Promise<BookReconciliation | undefined>;
  /** Writes the attempt and the records it examined, all or nothing. */
  saveAttempt(attempt: ReconciliationAttempt): Promise<Result<void, BookAlreadyReconciled>>;
  /**
   * Attaches the decision to the one final attempt of the book, the ambiguous one. Refuses a
   * second decision.
   */
  saveDecision(
    bookRef: ShelfBookRef,
    decision: AmbiguityDecision,
  ): Promise<Result<void, BookNotAmbiguous>>;
}
