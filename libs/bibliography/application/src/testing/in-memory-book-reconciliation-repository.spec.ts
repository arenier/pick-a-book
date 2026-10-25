import { CatalogRecordId, ScanRef } from '@pick-a-book/bibliography-domain';
import {
  aBookRef,
  aConfirmed,
  aMatch,
  aNotFound,
  anAmbiguous,
  aRecord,
  anAttempt,
} from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { InMemoryBookReconciliationRepository } from './in-memory-book-reconciliation-repository.js';

const A_SCAN = '0e1d6d5c-0b5e-4f5b-8f5b-3c8d3b7a9a11';
const unavailable = { kind: 'not_verified', cause: 'unavailable' } as const;

// The double holds the rules of the Postgres adapter, or the specs built on it prove nothing.
describe('InMemoryBookReconciliationRepository', () => {
  it('refuses a second final attempt on a book', async () => {
    const repository = new InMemoryBookReconciliationRepository();
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(0), aMatch(aConfirmed()))));

    const second = await repository.saveAttempt(
      anAttempt(aBookRef(0), aMatch(aNotFound(), null, 0)),
    );

    expect(second).toMatchObject({ ok: false, error: { kind: 'book-already-reconciled' } });
  });

  it('accepts a final attempt after not verified ones, and keeps all of them', async () => {
    const repository = new InMemoryBookReconciliationRepository();
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(0), unavailable)));
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(0), aMatch(aConfirmed()))));

    expect(repository.attemptsOf(aBookRef(0))).toHaveLength(2);
  });

  it('gives the books of an analysis by position', async () => {
    const repository = new InMemoryBookReconciliationRepository();
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(3), unavailable)));
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(1), unavailable)));

    const books = await repository.findByScan(unwrap(ScanRef.of(A_SCAN)));

    expect(books.map((book) => book.bookRef.position)).toStrictEqual([1, 3]);
  });
});

const decision = (kind: 'chosen' | 'rejected') =>
  kind === 'rejected'
    ? ({ kind, decidedAt: new Date() } as const)
    : ({ kind, recordId: unwrap(CatalogRecordId.of('ark:/1')), decidedAt: new Date() } as const);

describe('InMemoryBookReconciliationRepository, a decision', () => {
  const ambiguous = anAttempt(
    aBookRef(0),
    aMatch(anAmbiguous([aRecord({ id: 'ark:/1' }), aRecord({ id: 'ark:/2' })]), 'title_only'),
  );

  it('is kept beside the ambiguous attempt', async () => {
    const repository = new InMemoryBookReconciliationRepository();
    unwrap(await repository.saveAttempt(ambiguous));

    unwrap(await repository.saveDecision(aBookRef(0), decision('chosen')));

    await expect(repository.findBook(aBookRef(0))).resolves.toMatchObject({
      state: { status: 'confirmed', confirmedBy: 'user' },
    });
  });

  it('is refused a second time', async () => {
    const repository = new InMemoryBookReconciliationRepository();
    unwrap(await repository.saveAttempt(ambiguous));
    unwrap(await repository.saveDecision(aBookRef(0), decision('rejected')));

    await expect(repository.saveDecision(aBookRef(0), decision('rejected'))).resolves.toMatchObject(
      {
        ok: false,
        error: { kind: 'book-not-ambiguous' },
      },
    );
  });

  it('is refused for a book that is not ambiguous', async () => {
    const repository = new InMemoryBookReconciliationRepository();
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(0), aMatch(aConfirmed()))));

    await expect(repository.saveDecision(aBookRef(0), decision('rejected'))).resolves.toMatchObject(
      {
        ok: false,
      },
    );
  });
});
