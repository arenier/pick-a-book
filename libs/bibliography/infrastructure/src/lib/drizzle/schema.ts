import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Postgres schema of the bibliography context (ADR 0006, specs/003 data-model.md §Stockage).
 *
 * Three tables, none of them with a foreign key to `recognition`: the book is designated by the
 * analysis and its position, an opaque reference whose coherence the orchestrator guarantees
 * (research §4). The status of a book is deduced from these rows, never stored.
 *
 * The rules of the domain that the database can hold are held here too — a final attempt per
 * book, a score if and only if the call answered — so that a bug in the adapter cannot write
 * what the domain forbids.
 */

/** The authors of a record as stored in `reconciliation_candidates.authors` — plain JSON. */
export interface StoredRecordAuthor {
  readonly name: string;
  readonly role: 'main' | 'secondary';
  readonly authorityId?: string;
}

/** The context of a record as stored in `reconciliation_candidates.context` — plain JSON. */
export interface StoredRecordContext {
  readonly series?: string;
  readonly volume?: number;
  readonly collection?: string;
  readonly publisher?: string;
}

export const reconciliationAttempts = pgTable(
  'reconciliation_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The analysis of `recognition` and the index of the book in it. No foreign key.
    scanRef: uuid('scan_ref').notNull(),
    position: integer('position').notNull(),
    // What was read, copied: the analysis of errors needs no other table.
    queryTitle: text('query_title').notNull(),
    queryAuthor: text('query_author'),
    catalog: text('catalog').notNull(),
    verdict: text('verdict').notNull(),
    cascadeStep: text('cascade_step'),
    reconciliationScore: real('reconciliation_score'),
    notVerifiedCause: text('not_verified_cause'),
    // The date of consultation.
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('reconciliation_attempts_position_check', sql`${table.position} >= 0`),
    check(
      'reconciliation_attempts_verdict_check',
      sql`${table.verdict} in ('confirmed', 'ambiguous', 'not_found', 'not_verified')`,
    ),
    check(
      'reconciliation_attempts_cascade_step_check',
      sql`${table.cascadeStep} is null or ${table.cascadeStep} in ('title_and_author', 'author_only', 'title_only', 'segment')`,
    ),
    // A verdict that rests on a record says which step found it.
    check(
      'reconciliation_attempts_step_required_check',
      sql`${table.verdict} not in ('confirmed', 'ambiguous') or ${table.cascadeStep} is not null`,
    ),
    check(
      'reconciliation_attempts_score_range_check',
      sql`${table.reconciliationScore} is null or ${table.reconciliationScore} between 0 and 1`,
    ),
    // There is a score if and only if the catalogue answered.
    check(
      'reconciliation_attempts_score_iff_answered_check',
      sql`(${table.reconciliationScore} is null) = (${table.verdict} = 'not_verified')`,
    ),
    check(
      'reconciliation_attempts_cause_check',
      sql`${table.notVerifiedCause} is null or ${table.notVerifiedCause} in ('unavailable', 'timeout', 'invalid_response')`,
    ),
    // There is a cause if and only if the book is not verified.
    check(
      'reconciliation_attempts_cause_iff_not_verified_check',
      sql`(${table.notVerifiedCause} is not null) = (${table.verdict} = 'not_verified')`,
    ),
    index('reconciliation_attempts_book_idx').on(table.scanRef, table.position),
    // At most one final attempt per book: two reconciliations of the same analysis at once
    // cannot both settle it (research §3). « Not verified » is not final and may repeat.
    uniqueIndex('reconciliation_attempts_one_final_per_book_idx')
      .on(table.scanRef, table.position)
      .where(sql`${table.verdict} <> 'not_verified'`),
  ],
);

export const reconciliationCandidates = pgTable(
  'reconciliation_candidates',
  {
    attemptId: uuid('attempt_id').notNull(),
    // 1 is the best; the retained records come first, the examined ones follow.
    rank: integer('rank').notNull(),
    recordId: text('record_id').notNull(),
    title: text('title').notNull(),
    titleComplement: text('title_complement'),
    authors: jsonb('authors').$type<readonly StoredRecordAuthor[]>().notNull(),
    context: jsonb('context').$type<StoredRecordContext>().notNull(),
    // The record as received, for the enrichment that comes later (spec 004).
    raw: text('raw').notNull(),
    format: text('format').notNull(),
    titleScore: real('title_score').notNull(),
    authorScore: real('author_score'),
    score: real('score').notNull(),
    retained: boolean('retained').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.attemptId, table.rank] }),
    foreignKey({
      columns: [table.attemptId],
      foreignColumns: [reconciliationAttempts.id],
      name: 'reconciliation_candidates_attempt_fk',
    }),
    check('reconciliation_candidates_rank_check', sql`${table.rank} >= 1`),
    check(
      'reconciliation_candidates_format_check',
      sql`${table.format} in ('unimarc', 'dublin-core')`,
    ),
    check(
      'reconciliation_candidates_scores_check',
      sql`${table.titleScore} between 0 and 1 and ${table.score} between 0 and 1 and (${table.authorScore} is null or ${table.authorScore} between 0 and 1)`,
    ),
  ],
);

export const reconciliationDecisions = pgTable(
  'reconciliation_decisions',
  {
    // One decision per attempt: the primary key says so.
    attemptId: uuid('attempt_id').primaryKey(),
    kind: text('kind').notNull(),
    recordId: text('record_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.attemptId],
      foreignColumns: [reconciliationAttempts.id],
      name: 'reconciliation_decisions_attempt_fk',
    }),
    check('reconciliation_decisions_kind_check', sql`${table.kind} in ('chosen', 'rejected')`),
    // A record if and only if the user chose one.
    check(
      'reconciliation_decisions_record_iff_chosen_check',
      sql`(${table.recordId} is not null) = (${table.kind} = 'chosen')`,
    ),
  ],
);
