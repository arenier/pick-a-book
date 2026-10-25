import type { Result } from '@pick-a-book/shared-result';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { AmbiguityDecision } from './ambiguity-decision.js';
import type { BookAlreadyReconciled } from './book-already-reconciled.error.js';
import type { BookNotAmbiguous } from './book-not-ambiguous.error.js';
import {
  BOOK_RECONCILIATION_REPOSITORY_PORT,
  type BookReconciliationRepositoryPort,
} from './book-reconciliation-repository.port.js';
import type { BookReconciliation } from './book-reconciliation.js';
import type { ReconciliationAttempt } from './reconciliation-attempt.js';
import type { ScanRef } from './scan-ref.js';
import type { ShelfBookRef } from './shelf-book-ref.js';

describe('BookReconciliationRepositoryPort', () => {
  it('refuses a second final attempt and a second decision with an Err', () => {
    expectTypeOf<BookReconciliationRepositoryPort['saveAttempt']>().toEqualTypeOf<
      (attempt: ReconciliationAttempt) => Promise<Result<void, BookAlreadyReconciled>>
    >();
    expectTypeOf<BookReconciliationRepositoryPort['saveDecision']>().toEqualTypeOf<
      (
        bookRef: ShelfBookRef,
        decision: AmbiguityDecision,
      ) => Promise<Result<void, BookNotAmbiguous>>
    >();
  });

  it('reads the books of an analysis, or one book', () => {
    expectTypeOf<BookReconciliationRepositoryPort['findByScan']>().toEqualTypeOf<
      (scanRef: ScanRef) => Promise<readonly BookReconciliation[]>
    >();
    expectTypeOf<BookReconciliationRepositoryPort['findBook']>().toEqualTypeOf<
      (bookRef: ShelfBookRef) => Promise<BookReconciliation | undefined>
    >();
  });

  it('exposes a string injection token', () => {
    expect(BOOK_RECONCILIATION_REPOSITORY_PORT).toBe('BookReconciliationRepositoryPort');
  });
});
