import { unwrap } from '@pick-a-book/shared-result';

import type { AttemptResult, ReconciliationAttempt } from '../lib/book-reconciliation.js';
import type { CascadeStep } from '../lib/cascade-step.js';
import { CatalogName } from '../lib/catalog-name.js';
import type { MatchOutcome } from '../lib/match-outcome.js';
import type { ShelfBookRef } from '../lib/shelf-book-ref.js';
import { ReconciliationScore } from '../lib/reconciliation-score.js';
import { aReading } from './builders.js';

/** An attempt on a book, at a fixed date, against the catalogue `stub`. */
export function anAttempt(
  bookRef: ShelfBookRef,
  result: AttemptResult,
  overrides: Partial<Pick<ReconciliationAttempt, 'read' | 'attemptedAt'>> = {},
): ReconciliationAttempt {
  return {
    bookRef,
    read: aReading('La Peste', 'Albert Camus'),
    catalog: unwrap(CatalogName.of('stub')),
    attemptedAt: new Date('2026-10-18T10:00:00Z'),
    result,
    ...overrides,
  };
}

/** A verdict of the matching rule reached at `step`, with its reconciliation score. */
export function aMatch(
  outcome: MatchOutcome,
  step: CascadeStep | null = 'title_and_author',
  score = 0.9,
): AttemptResult {
  return { kind: 'matched', outcome, step, score: ReconciliationScore.fromComputed(score) };
}
