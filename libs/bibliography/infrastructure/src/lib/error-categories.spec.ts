import { CatalogRecordId, type MatchOutcome } from '@pick-a-book/bibliography-domain';
import {
  aBookRef,
  aMatch,
  anAttempt,
  aReading,
  aRecord,
  aScored,
} from '@pick-a-book/bibliography-domain/testing';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMigratedRepository } from './testing/test-repository.js';

/**
 * SC-007, from the database alone: every book falls in exactly one category of data-model.md
 * §Catégories d'écart, with the rank of the candidate chosen and the step of the cascade — by a
 * query written here, with no analysis code in production (FR-018).
 */
const CATEGORIES_SQL = `
  with last as (
    select distinct on (a.position) a.*
      from reconciliation_attempts a
     where a.scan_ref = $1
     order by a.position, (a.verdict <> 'not_verified') desc, a.attempted_at desc
  )
  select l.position,
         case
           when d.kind = 'chosen' then 'resolved_by_user'
           when d.kind = 'rejected' then 'rejected'
           when l.verdict = 'confirmed' and k.title_score = 1
                and (l.query_author is null or k.author_score = 1) then 'read_as_is'
           when l.verdict = 'confirmed' then 'corrected_by_catalog'
           when l.verdict = 'ambiguous' then 'ambiguity_open'
           when l.verdict = 'not_found' then 'unknown_to_catalog'
           else 'not_verified'
         end as category,
         (l.verdict = 'confirmed' and l.query_author is null) as author_completed,
         l.cascade_step as step,
         c.rank as chosen_rank,
         l.not_verified_cause as cause,
         (select b.score from reconciliation_candidates b
           where b.attempt_id = l.id and not b.retained order by b.rank limit 1) as best_aside
    from last l
    left join reconciliation_decisions d on d.attempt_id = l.id
    left join reconciliation_candidates k on k.attempt_id = l.id and k.rank = 1 and k.retained
    left join reconciliation_candidates c on c.attempt_id = l.id and c.record_id = d.record_id
   order by l.position`;

const record = (id: string) => aRecord({ id: `ark:/12148/${id}`, title: 'La chute' });
const confirmed = (id: string, titleScore: number, authorScore?: number): MatchOutcome => ({
  verdict: 'confirmed',
  retained: aScored(record(id), {
    titleScore,
    ...(authorScore === undefined ? {} : { authorScore }),
    score: 0.75,
  }),
  examined: [],
  needsAuthorityCheck: [],
});
const ambiguous: MatchOutcome = {
  verdict: 'ambiguous',
  candidates: [
    aScored(record('a'), { titleScore: 1, score: 0.75, rank: 1 }),
    aScored(record('b'), { titleScore: 1, score: 0.5, rank: 2 }),
  ],
  partial: false,
  examined: [],
  needsAuthorityCheck: [],
};
const notFound: MatchOutcome = {
  verdict: 'not_found',
  examined: [aScored(record('z'), { titleScore: 0.25, score: 0.125, rank: 1, retained: false })],
  needsAuthorityCheck: [],
};

describe('the categories of gap, by SQL alone (SC-007)', () => {
  const { repository, pool } = aMigratedRepository();

  it('ranges every book in exactly its category, with its step, rank and cause', async () => {
    const scan = crypto.randomUUID();
    const save = async (
      position: number,
      ...rest: Parameters<typeof anAttempt> extends [unknown, ...infer R] ? R : never
    ) => unwrap(await repository.saveAttempt(anAttempt(aBookRef(position, scan), ...rest)));
    const read = { read: aReading('La Chute', 'Albert Camus') };
    const unread = { read: aReading('La Chute') };
    await save(0, aMatch(confirmed('p0', 1, 1), 'title_and_author', 1), read);
    await save(1, aMatch(confirmed('p1', 0.5, 1), 'author_only', 0.5), read);
    await save(2, aMatch(confirmed('p2', 1), 'title_only', 0.5), unread);
    await save(3, aMatch(ambiguous, 'title_only', 0.5), unread);
    await save(4, aMatch(ambiguous, 'title_only', 0.5), unread);
    await save(5, aMatch(ambiguous, 'title_only', 0.5), unread);
    await save(6, aMatch(notFound, null, 0), read);
    await save(7, { kind: 'not_verified', cause: 'timeout' }, read);
    await save(
      8,
      { kind: 'not_verified', cause: 'unavailable' },
      { ...read, attemptedAt: new Date('2026-10-18T09:00:00Z') },
    );
    await save(8, aMatch(confirmed('p8', 1, 1), 'title_and_author', 1), read);
    unwrap(
      await repository.saveDecision(aBookRef(4, scan), {
        kind: 'chosen',
        recordId: unwrap(CatalogRecordId.of('ark:/12148/b')),
        decidedAt: new Date('2026-10-19T09:00:00Z'),
      }),
    );
    unwrap(
      await repository.saveDecision(aBookRef(5, scan), {
        kind: 'rejected',
        decidedAt: new Date('2026-10-19T09:00:00Z'),
      }),
    );

    const { rows } = await pool.query(CATEGORIES_SQL, [scan]);

    expect(
      rows.map((row) => [
        row.position,
        row.category,
        row.author_completed,
        row.step,
        row.chosen_rank,
        row.cause,
      ]),
    ).toStrictEqual([
      [0, 'read_as_is', false, 'title_and_author', null, null],
      [1, 'corrected_by_catalog', false, 'author_only', null, null],
      [2, 'read_as_is', true, 'title_only', null, null],
      [3, 'ambiguity_open', false, 'title_only', null, null],
      [4, 'resolved_by_user', false, 'title_only', 2, null],
      [5, 'rejected', false, 'title_only', null, null],
      [6, 'unknown_to_catalog', false, null, null, null],
      [7, 'not_verified', false, null, null, 'timeout'],
      [8, 'read_as_is', false, 'title_and_author', null, null],
    ]);
    expect(rows[6]?.best_aside).toBe(0.125);
  });
});
