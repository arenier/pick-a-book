import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aBookRef, aConfirmed, aNotFound, anAmbiguous, aRecord } from '../testing/builders.js';
import {
  BookReconciliation,
  type AttemptResult,
  type ReconciliationAttempt,
} from './book-reconciliation.js';
import { CatalogName } from './catalog-name.js';
import { ReadBook } from './read-book.js';
import { ReconciliationScore } from './reconciliation-score.js';

const read = unwrap(ReadBook.of('La Peste', 'Albert Camus'));
const score = ReconciliationScore.fromComputed(0.9);

function anAttempt(result: AttemptResult, position = 0): ReconciliationAttempt {
  return {
    bookRef: aBookRef(position),
    read,
    catalog: unwrap(CatalogName.of('stub')),
    attemptedAt: new Date('2026-10-18T10:00:00Z'),
    result,
  };
}

const confirmed = anAttempt({
  kind: 'matched',
  outcome: aConfirmed(),
  step: 'title_and_author',
  score,
});
const ambiguous = anAttempt({
  kind: 'matched',
  outcome: anAmbiguous([aRecord({ id: 'ark:/1' }), aRecord({ id: 'ark:/2' })]),
  step: 'title_only',
  score,
});
const notFound = anAttempt({ kind: 'matched', outcome: aNotFound(), step: null, score });
const notVerified = anAttempt({ kind: 'not_verified', cause: 'unavailable' });

function settledBy(attempt: ReconciliationAttempt): BookReconciliation {
  return unwrap(BookReconciliation.start(aBookRef()).recordAttempt(attempt));
}

describe('BookReconciliation status', () => {
  it('is pending before any attempt', () => {
    const book = BookReconciliation.start(aBookRef());

    expect(book.state.status).toBe('pending');
    expect(book.needsAttempt()).toBe(true);
  });

  it.each([
    ['not_verified', notVerified, true],
    ['confirmed', confirmed, false],
    ['ambiguous', ambiguous, false],
    ['not_found', notFound, false],
  ] as const)('is %s after a %s attempt', (status, attempt, needsAttempt) => {
    const book = settledBy(attempt);

    expect(book.state.status).toBe(status);
    expect(book.needsAttempt()).toBe(needsAttempt);
  });

  it('gives the retained record of an automatic confirmation', () => {
    expect(settledBy(confirmed).state).toMatchObject({
      status: 'confirmed',
      confirmedBy: 'automatic',
    });
  });

  it('gives the candidates of an ambiguity', () => {
    expect(settledBy(ambiguous).state).toMatchObject({
      status: 'ambiguous',
      candidates: [{ id: { value: 'ark:/1' } }, { id: { value: 'ark:/2' } }],
    });
  });
});

describe('BookReconciliation.recordAttempt', () => {
  it('keeps every attempt, in order, and settles on the last', () => {
    const first = unwrap(BookReconciliation.start(aBookRef()).recordAttempt(notVerified));
    const second = unwrap(first.recordAttempt(notVerified));
    const third = unwrap(second.recordAttempt(confirmed));

    expect(third.attempts).toStrictEqual([notVerified, notVerified, confirmed]);
    expect(third.state.status).toBe('confirmed');
  });

  it('does not change the aggregate it was called on', () => {
    const start = BookReconciliation.start(aBookRef());

    start.recordAttempt(confirmed);

    expect(start.attempts).toStrictEqual([]);
  });

  it.each([
    ['confirmed', confirmed],
    ['ambiguous', ambiguous],
    ['not_found', notFound],
  ] as const)('refuses another attempt on a %s book', (_status, attempt) => {
    const result = settledBy(attempt).recordAttempt(confirmed);

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-already-reconciled' } });
  });
});
