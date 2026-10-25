import { err, ok, type Result } from '@pick-a-book/shared-result';

import type { AmbiguityDecision } from './ambiguity-decision.js';
import { BookAlreadyReconciled } from './book-already-reconciled.error.js';
import { BookNotAmbiguous } from './book-not-ambiguous.error.js';
import type { CatalogRecord } from './catalog-record.js';
import type { ReconciliationAttempt } from './reconciliation-attempt.js';
import type { ShelfBookRef } from './shelf-book-ref.js';
import { UnknownCandidate } from './unknown-candidate.error.js';

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
    /** What the user decided on the ambiguous attempt, beside it and never over it (FR-016). */
    readonly decision: AmbiguityDecision | undefined,
  ) {}

  /** A book nobody tried to reconcile yet. */
  static start(bookRef: ShelfBookRef): BookReconciliation {
    return new BookReconciliation(bookRef, [], undefined);
  }

  /** A book as storage holds it. */
  static restore(
    bookRef: ShelfBookRef,
    attempts: readonly ReconciliationAttempt[],
    decision?: AmbiguityDecision,
  ): BookReconciliation {
    return new BookReconciliation(bookRef, attempts, decision);
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
      return this.ambiguousState(outcome.candidates.map((candidate) => candidate.record));
    }

    return { status: 'not_found' };
  }

  /** An ambiguity, or what the user's decision made of it. */
  private ambiguousState(candidates: readonly CatalogRecord[]): BookState {
    if (this.decision?.kind === 'rejected') {
      return { status: 'not_found' };
    }
    const { decision } = this;
    const record =
      decision?.kind === 'chosen'
        ? candidates.find((candidate) => candidate.id.equals(decision.recordId))
        : undefined;

    return record === undefined
      ? { status: 'ambiguous', candidates }
      : { status: 'confirmed', record, confirmedBy: 'user' };
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

    return ok(new BookReconciliation(this.bookRef, [...this.attempts, attempt], undefined));
  }

  /**
   * The user's decision on an ambiguous book: the work they recognise among the candidates, or
   * that none is it (FR-010). Once only — the book is no longer ambiguous after — and the
   * attempt it answers is left as it was (FR-016).
   */
  decide(
    decision: AmbiguityDecision,
  ): Result<BookReconciliation, BookNotAmbiguous | UnknownCandidate> {
    const { state } = this;
    if (state.status !== 'ambiguous') {
      return err(new BookNotAmbiguous(this.bookRef));
    }
    if (
      decision.kind === 'chosen' &&
      !state.candidates.some((candidate) => candidate.id.equals(decision.recordId))
    ) {
      return err(new UnknownCandidate(decision.recordId));
    }

    return ok(new BookReconciliation(this.bookRef, this.attempts, decision));
  }
}
