import { err, ok, type Result } from '@pick-a-book/shared-result';

import { BookAlreadyReconciled } from './book-already-reconciled.error.js';
import type { CascadeStep } from './cascade-step.js';
import type { CatalogName } from './catalog-name.js';
import type { CatalogRecord } from './catalog-record.js';
import type { MatchOutcome } from './match-outcome.js';
import type { NotVerifiedCause } from './not-verified-cause.js';
import type { ReadBook } from './read-book.js';
import type { ReconciliationScore } from './reconciliation-score.js';
import type { ShelfBookRef } from './shelf-book-ref.js';

/** What an attempt concluded: a verdict of the matching rule, or no verdict for lack of answer. */
export type AttemptResult =
  | {
      readonly kind: 'matched';
      readonly outcome: MatchOutcome;
      /** The step of the cascade that concluded; `null` for « not found » after all of them. */
      readonly step: CascadeStep | null;
      readonly score: ReconciliationScore;
    }
  | { readonly kind: 'not_verified'; readonly cause: NotVerifiedCause };

/** One try at reconciling a book. Never changed afterwards (FR-016, FR-017). */
export interface ReconciliationAttempt {
  readonly bookRef: ShelfBookRef;
  /** What the recognition read, copied so that the analysis needs no other table. */
  readonly read: ReadBook;
  readonly catalog: CatalogName;
  /** The date of consultation. */
  readonly attemptedAt: Date;
  readonly result: AttemptResult;
}

/**
 * The status of a book, derived from its attempts and its decision, never stored. Each status
 * carries what it needs: the record a confirmation rests on, the candidates of an ambiguity.
 */
export type BookState =
  | { readonly status: 'pending' }
  | { readonly status: 'not_verified' }
  | { readonly status: 'not_found' }
  | {
      readonly status: 'confirmed';
      readonly record: CatalogRecord;
      readonly confirmedBy: 'automatic' | 'user';
    }
  | { readonly status: 'ambiguous'; readonly candidates: readonly CatalogRecord[] };

/**
 * A detected book and what the reconciliation knows about it (data-model.md).
 *
 * Immutable: each rule returns the next aggregate, and an attempt is never edited afterwards —
 * a retry adds one, so the history of a book stays whole (US5).
 */
export class BookReconciliation {
  private constructor(
    readonly bookRef: ShelfBookRef,
    readonly attempts: readonly ReconciliationAttempt[],
  ) {}

  /** A book nobody tried to reconcile yet. */
  static start(bookRef: ShelfBookRef): BookReconciliation {
    return new BookReconciliation(bookRef, []);
  }

  /** A book as storage holds it. */
  static restore(
    bookRef: ShelfBookRef,
    attempts: readonly ReconciliationAttempt[],
  ): BookReconciliation {
    return new BookReconciliation(bookRef, attempts);
  }

  get state(): BookState {
    const last = this.attempts.at(-1);
    if (last === undefined) {
      return { status: 'pending' };
    }
    if (last.result.kind === 'not_verified') {
      return { status: 'not_verified' };
    }

    const outcome = last.result.outcome;
    if (outcome.verdict === 'confirmed') {
      return { status: 'confirmed', record: outcome.retained.record, confirmedBy: 'automatic' };
    }
    if (outcome.verdict === 'ambiguous') {
      return {
        status: 'ambiguous',
        candidates: outcome.candidates.map((candidate) => candidate.record),
      };
    }

    return { status: 'not_found' };
  }

  /** Only a book with no final status is searched again (FR-014). */
  needsAttempt(): boolean {
    const { status } = this.state;

    return status === 'pending' || status === 'not_verified';
  }

  recordAttempt(attempt: ReconciliationAttempt): Result<BookReconciliation, BookAlreadyReconciled> {
    if (!this.needsAttempt()) {
      return err(new BookAlreadyReconciled(this.bookRef));
    }

    return ok(new BookReconciliation(this.bookRef, [...this.attempts, attempt]));
  }
}
