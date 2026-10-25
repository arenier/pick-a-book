import {
  CatalogRecordId,
  type BookReconciliation,
  type MatchOutcome,
  type ScoredRecord,
} from '@pick-a-book/bibliography-domain';
import {
  aBookRef,
  aMatch,
  anAttempt,
  aRecord,
  aScored,
  confirmedOf,
} from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMigratedRepository } from './testing/test-repository.js';

const freshScan = () => crypto.randomUUID();
const retainedRecord = aRecord({ id: 'ark:/12148/kept', title: 'La chute' });
const otherRecord = aRecord({ id: 'ark:/12148/other', title: 'La chute' });
const setAside = aRecord({ id: 'ark:/12148/aside', title: 'Germinal' });

const confirmedWithExamined: MatchOutcome = {
  verdict: 'confirmed',
  retained: aScored(retainedRecord, { titleScore: 0.5, authorScore: 0.25, score: 0.75, rank: 1 }),
  examined: [
    aScored(setAside, { titleScore: 0.25, score: 0.125, rank: 2, retained: false }),
    aScored(otherRecord, {
      titleScore: 0.125,
      authorScore: 0.5,
      score: 0.0625,
      rank: 3,
      retained: false,
    }),
  ],
  needsAuthorityCheck: [],
};

const anAmbiguousWithAside: MatchOutcome = {
  verdict: 'ambiguous',
  candidates: [
    aScored(retainedRecord, { titleScore: 1, score: 0.75, rank: 1 }),
    aScored(otherRecord, { titleScore: 1, score: 0.5, rank: 2 }),
  ],
  partial: false,
  examined: [aScored(setAside, { titleScore: 0.25, score: 0.125, rank: 3, retained: false })],
  needsAuthorityCheck: [],
};

const marksOf = (entry: ScoredRecord) => ({
  titleScore: entry.titleScore.value,
  authorScore: entry.authorScore?.value,
  score: entry.score.value,
  rank: entry.rank,
  retained: entry.retained,
});

/** What the matching rule concluded, as read back from the database. */
function outcomeOf(book: BookReconciliation | undefined): MatchOutcome {
  const result = book?.attempts[0]?.result;
  if (result?.kind !== 'matched') {
    throw new Error('expected a matched attempt');
  }

  return result.outcome;
}

/** The marks of each record, kept as the matching rule gave them (FR-015, FR-017). */
describe('DrizzleBookReconciliationRepositoryAdapter, the scores kept', () => {
  const { repository } = aMigratedRepository();

  it('gives back exactly the marks of the retained record', async () => {
    const bookRef = aBookRef(0, freshScan());
    const attempt = anAttempt(bookRef, aMatch(confirmedWithExamined, 'author_only', 0.5));
    unwrap(await repository.saveAttempt(attempt));

    const outcome = outcomeOf(await repository.findBook(bookRef));

    expect(marksOf(confirmedOf(outcome))).toStrictEqual({
      titleScore: 0.5,
      authorScore: 0.25,
      score: 0.75,
      rank: 1,
      retained: true,
    });
  });

  it('gives back exactly the marks of the examined records', async () => {
    const bookRef = aBookRef(0, freshScan());
    const attempt = anAttempt(bookRef, aMatch(confirmedWithExamined, 'author_only', 0.5));
    unwrap(await repository.saveAttempt(attempt));

    const outcome = outcomeOf(await repository.findBook(bookRef));

    expect(outcome.examined.map(marksOf)).toStrictEqual([
      { titleScore: 0.25, authorScore: undefined, score: 0.125, rank: 2, retained: false },
      { titleScore: 0.125, authorScore: 0.5, score: 0.0625, rank: 3, retained: false },
    ]);
  });
});

describe('DrizzleBookReconciliationRepositoryAdapter, the scores kept, rows', () => {
  const { repository, pool } = aMigratedRepository();

  it('writes the examined records after the retained ones, a null author score when none was read', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(
      await repository.saveAttempt(
        anAttempt(bookRef, aMatch(confirmedWithExamined, 'title_only', 0.5)),
      ),
    );

    const { rows } = await pool.query<{
      rank: number;
      retained: boolean;
      author_score: number | null;
    }>(
      `select c.rank, c.retained, c.author_score
         from reconciliation_candidates c join reconciliation_attempts a on a.id = c.attempt_id
        where a.scan_ref = $1 order by c.rank`,
      [bookRef.scanRef.value],
    );

    expect(rows.map((row) => [row.rank, row.retained, row.author_score])).toStrictEqual([
      [1, true, 0.25],
      [2, false, null],
      [3, false, 0.5],
    ]);
  });
});

describe('DrizzleBookReconciliationRepositoryAdapter, the scores kept, part 2', () => {
  const { repository, pool } = aMigratedRepository();

  it('keeps the catalogue and the cause of a book not verified', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(
      await repository.saveAttempt(
        anAttempt(bookRef, { kind: 'not_verified', cause: 'invalid_response' }),
      ),
    );

    const { rows } = await pool.query<{
      catalog: string;
      not_verified_cause: string;
      reconciliation_score: number | null;
    }>(
      `select catalog, not_verified_cause, reconciliation_score from reconciliation_attempts where scan_ref = $1`,
      [bookRef.scanRef.value],
    );

    expect(rows).toStrictEqual([
      { catalog: 'stub', not_verified_cause: 'invalid_response', reconciliation_score: null },
    ]);
  });

  it('leaves the ambiguous attempt and its candidates unchanged after a decision (FR-016)', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(
      await repository.saveAttempt(
        anAttempt(bookRef, aMatch(anAmbiguousWithAside, 'title_only', 0.5)),
      ),
    );
    const before = await repository.findBook(bookRef);

    unwrap(
      await repository.saveDecision(bookRef, {
        kind: 'chosen',
        recordId: unwrap(CatalogRecordId.of('ark:/12148/other')),
        decidedAt: new Date('2026-10-19T09:00:00Z'),
      }),
    );
    const after = await repository.findBook(bookRef);

    expect(after?.attempts).toStrictEqual(before?.attempts);
  });
});
