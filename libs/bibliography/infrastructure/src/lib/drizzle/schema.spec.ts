import { migrateDatabase } from '@pick-a-book/shared-sql-migrations';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER, MIGRATIONS_TABLE, testDatabaseUrl } from './test-database.js';

/**
 * The rules of the reconciliation schema (specs/003, data-model.md §Stockage), held by the
 * database itself and not only by the adapter. Runs against the Postgres of docker-compose, on
 * the committed migrations.
 */
interface AttemptRow {
  verdict: string;
  cascadeStep: string | null;
  score: number | null;
  cause: string | null;
  position: number;
}

const confirmed = { verdict: 'confirmed', cascadeStep: 'title_only', score: 0.9, cause: null };
const notVerified = { verdict: 'not_verified', cascadeStep: null, score: null, cause: 'timeout' };
const REFUSED = /violates|duplicate/u;

/** Inserts an attempt of a fresh analysis, or of the given one. */
async function insertAttemptInto(pool: Pool, row: Partial<AttemptRow>, scanRef: string) {
  const { verdict, cascadeStep, score, cause, position } = { ...confirmed, position: 0, ...row };
  const { rows } = await pool.query<{ id: string }>(
    `insert into reconciliation_attempts
       (scan_ref, position, query_title, catalog, verdict, cascade_step, reconciliation_score,
        not_verified_cause)
     values ($1, $2, 'La Peste', 'stub', $3, $4, $5, $6) returning id`,
    [scanRef, position, verdict, cascadeStep, score, cause],
  );
  return { id: rows[0].id, scanRef };
}

/** A migrated pool, and the inserts the specs below try; registers its own set-up and teardown. */
function aMigratedSchema() {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  beforeAll(async () => {
    await migrateDatabase(pool, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsTable: MIGRATIONS_TABLE,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  const insertAttempt = async (row: Partial<AttemptRow>, scanRef: string = crypto.randomUUID()) =>
    insertAttemptInto(pool, row, scanRef);

  const insertCandidate = async (attemptId: string, overrides: Record<string, unknown> = {}) => {
    const row = {
      rank: 1,
      format: 'unimarc',
      titleScore: 1,
      authorScore: 1,
      score: 1,
      ...overrides,
    };
    await pool.query(
      `insert into reconciliation_candidates
         (attempt_id, rank, record_id, title, authors, context, raw, format, title_score,
          author_score, score, retained)
       values ($1, $2, 'ark:/12148/cb1', 'La peste', '[]', '{}', '<record/>', $3, $4, $5, $6, true)`,
      [attemptId, row.rank, row.format, row.titleScore, row.authorScore, row.score],
    );
  };

  const insertDecision = async (attemptId: string, kind: string, recordId: string | null) => {
    await pool.query(
      'insert into reconciliation_decisions (attempt_id, kind, record_id) values ($1, $2, $3)',
      [attemptId, kind, recordId],
    );
  };

  return { pool, insertAttempt, insertCandidate, insertDecision };
}

describe('the schema', () => {
  const { pool } = aMigratedSchema();

  it('holds the three tables of the context', async () => {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*) from information_schema.tables where table_name like 'reconciliation_%'",
    );

    expect(rows[0].count).toBe('3');
  });
});

describe('reconciliation_attempts', () => {
  const { insertAttempt } = aMigratedSchema();

  it.each([
    ['a confirmed attempt', confirmed],
    ['an ambiguous attempt', { ...confirmed, verdict: 'ambiguous' }],
    [
      'a not found attempt after the whole cascade',
      { ...confirmed, verdict: 'not_found', cascadeStep: null },
    ],
    ['a not verified attempt', notVerified],
  ])('accepts %s', async (_name, row) => {
    await expect(insertAttempt(row)).resolves.toBeDefined();
  });

  it('refuses a second final attempt on the same book', async () => {
    const { scanRef } = await insertAttempt({});

    await expect(
      insertAttempt({ verdict: 'not_found', cascadeStep: null }, scanRef),
    ).rejects.toThrow(REFUSED);
  });

  it('accepts a final attempt for another position of the same analysis', async () => {
    const { scanRef } = await insertAttempt({ position: 0 });

    await expect(insertAttempt({ position: 1 }, scanRef)).resolves.toBeDefined();
  });

  it('accepts several not verified attempts, then a final one', async () => {
    const { scanRef } = await insertAttempt(notVerified);
    await insertAttempt(notVerified, scanRef);

    await expect(insertAttempt(confirmed, scanRef)).resolves.toBeDefined();
  });
});

describe('reconciliation_attempts, refused rows', () => {
  const { insertAttempt } = aMigratedSchema();

  it.each([
    ['an unknown verdict', { verdict: 'perhaps' }],
    ['a confirmed attempt without a step', { cascadeStep: null }],
    ['an ambiguous attempt without a step', { verdict: 'ambiguous', cascadeStep: null }],
    ['an unknown step', { cascadeStep: 'luck' }],
    ['a confirmed attempt without a score', { score: null }],
    ['a score above 1', { score: 1.5 }],
    ['a negative score', { score: -0.1 }],
    ['a not verified attempt with a score', { ...notVerified, score: 0.5 }],
    ['a not verified attempt without a cause', { ...notVerified, cause: null }],
    ['a not verified attempt with an unknown cause', { ...notVerified, cause: 'sulking' }],
    ['a confirmed attempt with a cause', { cause: 'timeout' }],
    ['a negative position', { position: -1 }],
  ])('refuses %s', async (_name, row) => {
    await expect(insertAttempt(row)).rejects.toThrow(REFUSED);
  });
});

describe('reconciliation_candidates', () => {
  const { insertAttempt, insertCandidate } = aMigratedSchema();

  it('accepts a candidate without an author score', async () => {
    const { id } = await insertAttempt({});

    await expect(insertCandidate(id, { authorScore: null })).resolves.toBeUndefined();
  });

  it.each([
    ['a rank of zero', { rank: 0 }],
    ['an unknown format', { format: 'marc21' }],
    ['a title score above 1', { titleScore: 1.2 }],
    ['an author score below 0', { authorScore: -0.5 }],
    ['a score above 1', { score: 2 }],
  ])('refuses %s', async (_name, overrides) => {
    const { id } = await insertAttempt({});

    await expect(insertCandidate(id, overrides)).rejects.toThrow(REFUSED);
  });

  it('refuses two candidates of the same rank on one attempt', async () => {
    const { id } = await insertAttempt({});
    await insertCandidate(id);

    await expect(insertCandidate(id)).rejects.toThrow(REFUSED);
  });

  it('refuses a candidate of an attempt that does not exist', async () => {
    await expect(insertCandidate(crypto.randomUUID())).rejects.toThrow(REFUSED);
  });
});

describe('reconciliation_decisions', () => {
  const { insertAttempt, insertDecision } = aMigratedSchema();

  it('accepts a chosen record and a rejection', async () => {
    const chosen = await insertAttempt({ verdict: 'ambiguous' });
    const rejected = await insertAttempt({ verdict: 'ambiguous' });

    await expect(insertDecision(chosen.id, 'chosen', 'ark:/12148/cb1')).resolves.toBeUndefined();
    await expect(insertDecision(rejected.id, 'rejected', null)).resolves.toBeUndefined();
  });

  it.each([
    ['a chosen decision without a record', 'chosen', null],
    ['a rejection with a record', 'rejected', 'ark:/12148/cb1'],
    ['an unknown kind', 'shrugged', null],
  ])('refuses %s', async (_name, kind, recordId) => {
    const { id } = await insertAttempt({ verdict: 'ambiguous' });

    await expect(insertDecision(id, kind, recordId)).rejects.toThrow(REFUSED);
  });

  it('refuses a second decision on the same attempt', async () => {
    const { id } = await insertAttempt({ verdict: 'ambiguous' });
    await insertDecision(id, 'rejected', null);

    await expect(insertDecision(id, 'chosen', 'ark:/12148/cb1')).rejects.toThrow(REFUSED);
  });
});
