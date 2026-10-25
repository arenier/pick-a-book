import { CatalogRecordId, type MatchOutcome } from '@pick-a-book/bibliography-domain';
import {
  aBookRef,
  aMatch,
  anAttempt,
  aRecord,
  aScored,
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

/** The marks of each record, kept as the matching rule gave them (FR-015, FR-017). */
describe('DrizzleBookReconciliationRepositoryAdapter, the scores kept', () => {
  const { repository, pool } = aMigratedRepository();

  it('keeps the marks of the retained and examined records, and gives them back exactly', async () => {
    const bookRef = aBookRef(0, freshScan());
    unwrap(
      await repository.saveAttempt(
        anAttempt(bookRef, aMatch(confirmedWithExamined, 'author_only', 0.5)),
      ),
    );

    const found = await repository.findBook(bookRef);

    const result = found?.attempts[0]?.result;
    expect(result?.kind === 'matched' && result.outcome.verdict === 'confirmed').toBe(true);
    if (result?.kind !== 'matched' || result.outcome.verdict !== 'confirmed') {
      return;
    }
    const marks = (entry: {
      titleScore: { value: number };
      authorScore?: { value: number };
      score: { value: number };
      rank: number;
      retained: boolean;
    }) => ({
      titleScore: entry.titleScore.value,
      authorScore: entry.authorScore?.value,
      score: entry.score.value,
      rank: entry.rank,
      retained: entry.retained,
    });
    expect(marks(result.outcome.retained)).toStrictEqual({
      titleScore: 0.5,
      authorScore: 0.25,
      score: 0.75,
      rank: 1,
      retained: true,
    });
    expect(result.outcome.examined.map(marks)).toStrictEqual([
      { titleScore: 0.25, authorScore: undefined, score: 0.125, rank: 2, retained: false },
      { titleScore: 0.125, authorScore: 0.5, score: 0.0625, rank: 3, retained: false },
    ]);
    expect(result.step).toBe('author_only');
    expect(result.score.value).toBe(0.5);
  });

  it('writes the examined records after the retained ones, with a null author score when none was read', async () => {
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
      record_id: string;
    }>(
      `select c.rank, c.retained, c.author_score, c.record_id
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
    const ambiguous: MatchOutcome = {
      verdict: 'ambiguous',
      candidates: [
        aScored(retainedRecord, { titleScore: 1, score: 0.75, rank: 1 }),
        aScored(otherRecord, { titleScore: 1, score: 0.5, rank: 2 }),
      ],
      partial: false,
      examined: [aScored(setAside, { titleScore: 0.25, score: 0.125, rank: 3, retained: false })],
      needsAuthorityCheck: [],
    };
    unwrap(await repository.saveAttempt(anAttempt(bookRef, aMatch(ambiguous, 'title_only', 0.5))));
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
