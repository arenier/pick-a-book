import { CatalogRecordId, type AmbiguityDecision } from '@pick-a-book/bibliography-domain';
import {
  aBookRef,
  aConfirmed,
  aMatch,
  anAmbiguous,
  anAttempt,
  aRecord,
} from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMigratedRepository } from './testing/test-repository.js';

const freshScan = () => crypto.randomUUID();
const first = aRecord({ id: 'ark:/12148/cb1', title: 'La chute' });
const second = aRecord({ id: 'ark:/12148/cb2', title: 'La chute' });
const at = new Date('2026-10-19T09:00:00Z');

const chosen = (recordId: string): AmbiguityDecision => ({
  kind: 'chosen',
  recordId: unwrap(CatalogRecordId.of(recordId)),
  decidedAt: at,
});
const rejected: AmbiguityDecision = { kind: 'rejected', decidedAt: at };

function anAmbiguousAttempt(bookRef: ReturnType<typeof aBookRef>) {
  return anAttempt(bookRef, aMatch(anAmbiguous([first, second]), 'title_only'));
}

describe('DrizzleBookReconciliationRepositoryAdapter, a decision', () => {
  const { repository, pool } = aMigratedRepository();

  it('keeps a chosen candidate, and the book reads as confirmed by the user', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAmbiguousAttempt(bookRef)));

    unwrap(await repository.saveDecision(bookRef, chosen('ark:/12148/cb2')));

    const found = await repository.findBook(bookRef);
    expect(found?.state).toMatchObject({
      status: 'confirmed',
      confirmedBy: 'user',
      record: { id: { value: 'ark:/12148/cb2' } },
    });
    expect(found?.decision).toStrictEqual(chosen('ark:/12148/cb2'));
  });

  it('keeps a rejection, and the book reads as not found', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAmbiguousAttempt(bookRef)));

    unwrap(await repository.saveDecision(bookRef, rejected));

    const found = await repository.findBook(bookRef);
    expect(found?.state.status).toBe('not_found');
    expect(found?.decision).toStrictEqual(rejected);
  });

  // FR-016: the decision is beside the attempt, which is never rewritten.
  it('leaves the ambiguous attempt and its candidates exactly as they were', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAmbiguousAttempt(bookRef)));
    const rows = async () =>
      pool.query(
        `select a.*, c.rank, c.record_id, c.score from reconciliation_attempts a
         join reconciliation_candidates c on c.attempt_id = a.id
         where a.scan_ref = $1 order by c.rank`,
        [bookRef.scanRef.value],
      );
    const before = await rows();

    unwrap(await repository.saveDecision(bookRef, chosen('ark:/12148/cb1')));

    expect((await rows()).rows).toStrictEqual(before.rows);
  });
});

describe('DrizzleBookReconciliationRepositoryAdapter, a decision refused', () => {
  const { repository } = aMigratedRepository();

  it('refuses a second decision on the same book', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAmbiguousAttempt(bookRef)));
    unwrap(await repository.saveDecision(bookRef, rejected));

    const again = await repository.saveDecision(bookRef, chosen('ark:/12148/cb1'));

    expect(again).toMatchObject({ ok: false, error: { kind: 'book-not-ambiguous' } });
    await expect(repository.findBook(bookRef)).resolves.toMatchObject({ decision: rejected });
  });

  it('refuses a decision on a book whose final attempt is not ambiguous', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(await repository.saveAttempt(anAttempt(bookRef, aMatch(aConfirmed()))));

    const result = await repository.saveDecision(bookRef, rejected);

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-not-ambiguous' } });
  });

  it('refuses a decision on a book never reconciled', async () => {
    const result = await repository.saveDecision(aBookRef(0, freshScan()), rejected);

    expect(result).toMatchObject({ ok: false, error: { kind: 'book-not-ambiguous' } });
  });
});
