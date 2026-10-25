import type { CatalogRecord } from './catalog-record.js';
import { MatchScore } from './match-score.js';
import type { AuthorityCheck, MatchOutcome, ScoredRecord } from './match-outcome.js';
import type { MatchingSettings } from './matching-settings.js';
import type { ReadBook } from './read-book.js';
import {
  assess,
  authorMatches,
  combinedScore,
  type Assessment,
  type RejectedForms,
} from './assessment.js';
import { compareWorks, dropSeriesOutranked, groupIntoWorks } from './work-grouping.js';

export type { RejectedForms } from './assessment.js';

/**
 * The matching rule of ADR 0014: what a page of records says about a book that was read.
 *
 * A pure function of the reading, the records and the settings — whatever the catalogue, the
 * same page gives the same verdict, and the application stays out of it. Its steps (research
 * §5): compare the title, then the author when one was read; set aside the volumes the reading
 * contradicts and the series that its own volumes outrank; group the records that describe the
 * same work by **our** rule, never the catalogue's work identifier; keep the works close enough
 * to the best; pick one representative record per work; give the verdict.
 *
 * `rejectedForms` holds what the authorities answered after an earlier call listed them in
 * `needsAuthorityCheck` (§5.4).
 */
export function matchBook(
  read: ReadBook,
  records: readonly CatalogRecord[],
  settings: MatchingSettings,
  rejectedForms: RejectedForms = new Map(),
): MatchOutcome {
  const assessments = records.map((record) => assess(read, record, settings, rejectedForms));
  const matched = assessments.filter(
    (assessment) => assessment.titleScore >= settings.titleThreshold && assessment.volumeOk,
  );
  const authorFailures =
    read.author === undefined ? [] : matched.filter((a) => !authorMatches(a, settings));
  const kept = matched.filter((assessment) => !authorFailures.includes(assessment));

  const works = groupIntoWorks(dropSeriesOutranked(kept, settings), read, settings)
    .toSorted(compareWorks)
    .filter((work, _index, all) => work.score >= (all[0]?.score ?? 0) - settings.margin - EPSILON)
    .slice(0, settings.maxCandidates);

  const scored = works.map((work, index) =>
    scoredRecord(work.representative, index + 1, settings, read),
  );
  const first = works.at(0);

  if (first === undefined) {
    return {
      verdict: 'not_found',
      examined: [],
      needsAuthorityCheck: authorityChecks(authorFailures, rejectedForms),
    };
  }
  if (works.length === 1 && first.solid) {
    return {
      verdict: 'confirmed',
      retained: scored[0],
      examined: [],
      needsAuthorityCheck: [],
    };
  }

  return {
    verdict: 'ambiguous',
    candidates: scored,
    // The doubt comes from the title, not from a rival work: one work, one unexplained segment.
    partial: works.length === 1,
    examined: [],
    needsAuthorityCheck: authorityChecks(authorFailures, rejectedForms),
  };
}

/** Float noise must not push a work out of the margin it sits exactly on. */
const EPSILON = 1e-9;

/**
 * The authorities worth asking about: those of the records discarded **only** for their author.
 * Asked for nothing when the book is confirmed anyway — the author read is on a record, and the
 * others could only add rivals nobody read.
 */
function authorityChecks(
  failures: readonly Assessment[],
  rejectedForms: RejectedForms,
): readonly AuthorityCheck[] {
  const checks: AuthorityCheck[] = [];
  for (const { record } of failures) {
    const authorityIds = record.authors.flatMap((author) =>
      author.authorityId === undefined || rejectedForms.has(author.authorityId.value)
        ? []
        : [author.authorityId],
    );
    if (authorityIds.length > 0) {
      checks.push({ record, authorityIds });
    }
  }

  return checks;
}

function scoredRecord(
  assessment: Assessment,
  rank: number,
  settings: MatchingSettings,
  read: ReadBook,
): ScoredRecord {
  return {
    record: assessment.record,
    titleScore: MatchScore.fromComputed(assessment.titleScore),
    authorScore:
      assessment.authorScore === undefined
        ? undefined
        : MatchScore.fromComputed(assessment.authorScore),
    score: MatchScore.fromComputed(combinedScore(assessment, settings, read)),
    rank,
    retained: true,
  };
}
