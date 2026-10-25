import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMatch, anAttempt } from '../testing/attempts.js';
import { aBookRef, anAmbiguous, aRecord } from '../testing/builders.js';
import type { AmbiguityDecision } from './ambiguity-decision.js';
import { BookReconciliation } from './book-reconciliation.js';
import { CatalogRecordId } from './catalog-record-id.js';

const first = aRecord({ id: 'ark:/12148/cb1', title: 'La chute' });
const second = aRecord({ id: 'ark:/12148/cb2', title: 'La chute' });
const DECIDED_AT = new Date('2026-10-19T09:00:00Z');

const chosen = (recordId: string): AmbiguityDecision => ({
  kind: 'chosen',
  recordId: unwrap(CatalogRecordId.of(recordId)),
  decidedAt: DECIDED_AT,
});
const rejected: AmbiguityDecision = { kind: 'rejected', decidedAt: DECIDED_AT };

function ambiguousBook(): BookReconciliation {
  const bookRef = aBookRef();
  const attempt = anAttempt(bookRef, aMatch(anAmbiguous([first, second]), 'title_only'));

  return unwrap(BookReconciliation.start(bookRef).recordAttempt(attempt));
}

describe('BookReconciliation.decide, choosing a candidate (FR-010)', () => {
  it('confirms the book with the record chosen, by the user', () => {
    const decided = unwrap(ambiguousBook().decide(chosen('ark:/12148/cb2')));

    expect(decided.state).toMatchObject({
      status: 'confirmed',
      confirmedBy: 'user',
      record: { id: { value: 'ark:/12148/cb2' } },
    });
  });

  it('keeps the ambiguous attempt as it was, and the decision beside it (FR-016)', () => {
    const before = ambiguousBook();

    const decided = unwrap(before.decide(chosen('ark:/12148/cb1')));

    expect(decided.attempts).toStrictEqual(before.attempts);
    expect(decided.decision).toStrictEqual(chosen('ark:/12148/cb1'));
  });

  it('refuses a record that is not one of the candidates', () => {
    const result = ambiguousBook().decide(chosen('ark:/12148/cb9'));

    expect(result).toMatchObject({ ok: false, error: { kind: 'unknown-candidate' } });
  });
});

describe('BookReconciliation.decide, rejecting every candidate', () => {
  it('makes the book not found', () => {
    const decided = unwrap(ambiguousBook().decide(rejected));

    expect(decided.state.status).toBe('not_found');
    expect(decided.decision).toStrictEqual(rejected);
  });

  it('is not searched again, and takes no further attempt', () => {
    const decided = unwrap(ambiguousBook().decide(rejected));

    expect(decided.needsAttempt()).toBe(false);
    expect(decided.recordAttempt(decided.attempts[0])).toMatchObject({ ok: false });
  });
});

describe('BookReconciliation.decide, when there is nothing to decide', () => {
  it('refuses a second decision: the book is not ambiguous any more', () => {
    const decided = unwrap(ambiguousBook().decide(rejected));

    expect(decided.decide(chosen('ark:/12148/cb1'))).toMatchObject({
      ok: false,
      error: { kind: 'book-not-ambiguous' },
    });
  });

  it('refuses a book that was never reconciled', () => {
    const result = BookReconciliation.start(aBookRef()).decide(rejected);

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-not-ambiguous' } });
  });
});

describe('BookReconciliation.restore, with a decision', () => {
  it('rebuilds the status the decision gives', () => {
    const book = ambiguousBook();

    const restored = BookReconciliation.restore(
      book.bookRef,
      book.attempts,
      chosen('ark:/12148/cb1'),
    );

    expect(restored.state).toMatchObject({ status: 'confirmed', confirmedBy: 'user' });
  });
});
