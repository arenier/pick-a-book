import {
  aBookRef,
  aConfirmed,
  aMatch,
  anAttempt,
  aNotFound,
  aRecord,
  aScored,
} from '@pick-a-book/bibliography-domain/testing';
import { ScanRef } from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMigratedRepository } from './testing/test-repository.js';

const freshScan = () => crypto.randomUUID();
const unavailable = { kind: 'not_verified', cause: 'unavailable' } as const;

describe('DrizzleBookReconciliationRepositoryAdapter, one final attempt per book', () => {
  const { repository } = aMigratedRepository();

  it('refuses a second final attempt on the same book', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAttempt(bookRef, aMatch(aConfirmed()))));

    const second = await repository.saveAttempt(anAttempt(bookRef, aMatch(aNotFound(), null, 0)));

    expect(second).toMatchObject({ ok: false, error: { kind: 'book-already-reconciled' } });
  });

  it('keeps nothing of a refused attempt', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAttempt(bookRef, aMatch(aConfirmed()))));

    await repository.saveAttempt(anAttempt(bookRef, aMatch(aNotFound(), null, 0)));

    expect((await repository.findBook(bookRef))?.attempts).toHaveLength(1);
  });

  it('accepts a final attempt after not verified ones, and keeps the history', async () => {
    const bookRef = aBookRef(1, freshScan());
    unwrap(await repository.saveAttempt(anAttempt(bookRef, unavailable)));
    unwrap(await repository.saveAttempt(anAttempt(bookRef, unavailable)));
    unwrap(await repository.saveAttempt(anAttempt(bookRef, aMatch(aConfirmed()))));

    const found = await repository.findBook(bookRef);

    expect(found?.attempts.map((attempt) => attempt.result.kind)).toStrictEqual([
      'not_verified',
      'not_verified',
      'matched',
    ]);
    expect(found?.state.status).toBe('confirmed');
  });

  it('lets two reconciliations of one analysis race: exactly one settles the book', async () => {
    const bookRef = aBookRef(3, freshScan());

    const results = await Promise.all([
      repository.saveAttempt(anAttempt(bookRef, aMatch(aConfirmed()))),
      repository.saveAttempt(anAttempt(bookRef, aMatch(aConfirmed()))),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await repository.findBook(bookRef))?.attempts).toHaveLength(1);
  });
});

describe('DrizzleBookReconciliationRepositoryAdapter, atomic writes', () => {
  const { repository } = aMigratedRepository();

  // The attempt and its records go in together or not at all.
  it('writes nothing when one of the records cannot be written', async () => {
    const bookRef = aBookRef(0, freshScan());
    const record = aRecord();
    const twice = {
      verdict: 'ambiguous',
      candidates: [aScored(record, { rank: 1 }), aScored(record, { rank: 1 })],
      partial: false,
      examined: [],
      needsAuthorityCheck: [],
    } as const;

    await expect(repository.saveAttempt(anAttempt(bookRef, aMatch(twice)))).rejects.toThrow(
      /Failed query/u,
    );

    await expect(repository.findBook(bookRef)).resolves.toBeUndefined();
  });
});

describe('DrizzleBookReconciliationRepositoryAdapter.findByScan', () => {
  const { repository } = aMigratedRepository();

  it('gives the books that have an attempt, by position', async () => {
    const scan = freshScan();
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(4, scan), aMatch(aConfirmed()))));
    unwrap(
      await repository.saveAttempt(anAttempt(aBookRef(1, scan), aMatch(aNotFound(), null, 0))),
    );
    unwrap(await repository.saveAttempt(anAttempt(aBookRef(2, scan), unavailable)));

    const books = await repository.findByScan(unwrap(ScanRef.of(scan)));

    expect(books.map((book) => [book.bookRef.position, book.state.status])).toStrictEqual([
      [1, 'not_found'],
      [2, 'not_verified'],
      [4, 'confirmed'],
    ]);
  });

  it('gives nothing for an analysis never reconciled', async () => {
    await expect(repository.findByScan(unwrap(ScanRef.of(freshScan())))).resolves.toStrictEqual([]);
  });

  it('orders the attempts of a book by date', async () => {
    const bookRef = aBookRef(0, freshScan());
    const later = new Date('2026-10-18T12:00:00Z');
    unwrap(
      await repository.saveAttempt(
        anAttempt(bookRef, aMatch(aConfirmed()), { attemptedAt: later }),
      ),
    );
    unwrap(
      await repository.saveAttempt(
        anAttempt(bookRef, unavailable, { attemptedAt: new Date('2026-10-18T09:00:00Z') }),
      ),
    );

    const found = await repository.findBook(bookRef);

    expect(found?.attempts.map((attempt) => attempt.result.kind)).toStrictEqual([
      'not_verified',
      'matched',
    ]);
  });
});
