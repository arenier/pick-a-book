import type { CascadeStep } from './cascade-step.js';
import type { CatalogName } from './catalog-name.js';
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
