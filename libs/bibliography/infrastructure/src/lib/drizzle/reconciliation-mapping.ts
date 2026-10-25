import {
  CatalogName,
  CatalogRecord,
  MatchScore,
  ReadBook,
  ReconciliationScore,
  isCascadeStep,
  isNotVerifiedCause,
  type AttemptResult,
  type MatchOutcome,
  type ReconciliationAttempt,
  type ScoredRecord,
  type ShelfBookRef,
} from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { z } from 'zod';

import type {
  reconciliationAttempts,
  reconciliationCandidates,
  StoredRecordAuthor,
  StoredRecordContext,
} from './schema.js';

export type AttemptRow = typeof reconciliationAttempts.$inferSelect;
export type CandidateRow = typeof reconciliationCandidates.$inferSelect;
export type NewAttemptRow = typeof reconciliationAttempts.$inferInsert;
export type NewCandidateRow = typeof reconciliationCandidates.$inferInsert;

/**
 * What a read of the jsonb columns must prove (adapters.md): the shape is checked on the way
 * out, never asserted, so a row written by another revision cannot slip through half-read.
 */
const storedAuthors = z.array(
  z.object({
    name: z.string(),
    role: z.enum(['main', 'secondary']),
    authorityId: z.string().optional(),
  }),
);
const storedContext = z.object({
  series: z.string().optional(),
  volume: z.number().optional(),
  collection: z.string().optional(),
  publisher: z.string().optional(),
});

/** The rows that keep an attempt: the attempt itself, then every record it examined. */
export function toRows(attempt: ReconciliationAttempt): {
  readonly attempt: NewAttemptRow;
  readonly candidates: (attemptId: string) => NewCandidateRow[];
} {
  const { result } = attempt;
  const common = {
    scanRef: attempt.bookRef.scanRef.value,
    position: attempt.bookRef.position,
    queryTitle: attempt.read.title,
    queryAuthor: attempt.read.author ?? null,
    catalog: attempt.catalog.value,
    attemptedAt: attempt.attemptedAt,
  };

  if (result.kind === 'not_verified') {
    return {
      attempt: {
        ...common,
        verdict: 'not_verified',
        cascadeStep: null,
        reconciliationScore: null,
        notVerifiedCause: result.cause,
      },
      candidates: () => [],
    };
  }

  return {
    attempt: {
      ...common,
      verdict: result.outcome.verdict,
      cascadeStep: result.step,
      reconciliationScore: result.score.value,
      notVerifiedCause: null,
    },
    candidates: (attemptId) =>
      scoredRecordsOf(result.outcome).map((scored) => toCandidateRow(attemptId, scored)),
  };
}

function scoredRecordsOf(outcome: MatchOutcome): readonly ScoredRecord[] {
  const retained =
    outcome.verdict === 'confirmed'
      ? [outcome.retained]
      : outcome.verdict === 'ambiguous'
        ? outcome.candidates
        : [];

  return [...retained, ...outcome.examined];
}

function toCandidateRow(attemptId: string, scored: ScoredRecord): NewCandidateRow {
  const { record } = scored;

  return {
    attemptId,
    rank: scored.rank,
    recordId: record.id.value,
    title: record.title,
    titleComplement: record.titleComplement ?? null,
    authors: record.authors.map((author): StoredRecordAuthor => ({
      name: author.name,
      role: author.role,
      ...(author.authorityId === undefined ? {} : { authorityId: author.authorityId.value }),
    })),
    context: definedOnly(record.context),
    raw: record.raw,
    format: record.format,
    titleScore: scored.titleScore.value,
    authorScore: scored.authorScore?.value ?? null,
    score: scored.score.value,
    retained: scored.retained,
  };
}

function definedOnly(context: CatalogRecord['context']): StoredRecordContext {
  return {
    ...(context.series === undefined ? {} : { series: context.series }),
    ...(context.volume === undefined ? {} : { volume: context.volume }),
    ...(context.collection === undefined ? {} : { collection: context.collection }),
    ...(context.publisher === undefined ? {} : { publisher: context.publisher }),
  };
}

/** Rebuilds an attempt from its row and the rows of the records it examined. */
export function toAttempt(
  bookRef: ShelfBookRef,
  row: AttemptRow,
  candidates: readonly CandidateRow[],
): ReconciliationAttempt {
  return {
    bookRef,
    read: unwrap(ReadBook.of(row.queryTitle, row.queryAuthor ?? undefined)),
    catalog: unwrap(CatalogName.of(row.catalog)),
    attemptedAt: row.attemptedAt,
    result: toResult(row, candidates),
  };
}

function toResult(row: AttemptRow, candidates: readonly CandidateRow[]): AttemptResult {
  if (row.verdict === 'not_verified') {
    if (row.notVerifiedCause === null || !isNotVerifiedCause(row.notVerifiedCause)) {
      throw new Error(`reconciliation_attempts ${row.id}: unknown cause ${row.notVerifiedCause}`);
    }
    return { kind: 'not_verified', cause: row.notVerifiedCause };
  }
  if (row.reconciliationScore === null) {
    throw new Error(`reconciliation_attempts ${row.id}: a verdict without a score`);
  }
  const step = row.cascadeStep;
  if (step !== null && !isCascadeStep(step)) {
    throw new Error(`reconciliation_attempts ${row.id}: unknown step ${step}`);
  }

  return {
    kind: 'matched',
    outcome: toOutcome(row, candidates),
    step,
    score: unwrap(ReconciliationScore.of(row.reconciliationScore)),
  };
}

function toOutcome(row: AttemptRow, rows: readonly CandidateRow[]): MatchOutcome {
  const scored = rows
    .toSorted((a, b) => a.rank - b.rank)
    .map((candidate) => toScoredRecord(candidate));
  const retained = scored.filter((entry) => entry.retained);
  const examined = scored.filter((entry) => !entry.retained);
  const kept = { examined, needsAuthorityCheck: [] };

  if (row.verdict === 'confirmed' && retained.length === 1) {
    return { verdict: 'confirmed', retained: retained[0], ...kept };
  }
  if (row.verdict === 'ambiguous' && retained.length > 0) {
    // A single candidate is the ambiguity of a title no record explains (research §5.5).
    return { verdict: 'ambiguous', candidates: retained, partial: retained.length === 1, ...kept };
  }
  if (row.verdict === 'not_found') {
    return { verdict: 'not_found', ...kept };
  }

  throw new Error(
    `reconciliation_attempts ${row.id}: ${row.verdict} with ${retained.length} records`,
  );
}

function toScoredRecord(row: CandidateRow): ScoredRecord {
  const context = storedContext.parse(row.context);
  const record = unwrap(
    CatalogRecord.of({
      id: row.recordId,
      title: row.title,
      ...(row.titleComplement === null ? {} : { titleComplement: row.titleComplement }),
      authors: storedAuthors.parse(row.authors),
      context,
      raw: row.raw,
      format: formatOf(row.format),
    }),
  );

  return {
    record,
    titleScore: unwrap(MatchScore.of(row.titleScore)),
    authorScore: row.authorScore === null ? undefined : unwrap(MatchScore.of(row.authorScore)),
    score: unwrap(MatchScore.of(row.score)),
    rank: row.rank,
    retained: row.retained,
  };
}

function formatOf(format: string): 'unimarc' | 'dublin-core' {
  if (format === 'unimarc' || format === 'dublin-core') {
    return format;
  }
  throw new Error(`reconciliation_candidates: unknown format ${format}`);
}
