import { normalizeText, similarity } from '@pick-a-book/shared-text-match';

import { readAuthorScore } from './author-forms.js';
import type { CatalogRecord } from './catalog-record.js';
import type { MatchingSettings } from './matching-settings.js';
import type { ReadBook } from './read-book.js';
import { recordTitleForms, titleScore } from './title-forms.js';

/** The rejected forms of the authorities the application has fetched, by authority identifier. */
export type RejectedForms = ReadonlyMap<string, readonly string[]>;

/** A segment is explained by a context string that is this long at least, found inside it. */
const MIN_CONTAINED_LENGTH = 3;

/** What the matching rule found out about one record, against one reading. */
export interface Assessment {
  readonly record: CatalogRecord;
  readonly titleScore: number;
  /** The title is matched whole, or by a segment whose companions the record explains. */
  readonly solid: boolean;
  /** The volume read, when there is one, does not contradict the record's. */
  readonly volumeOk: boolean;
  readonly authorScore: number | undefined;
}

export function assess(
  read: ReadBook,
  record: CatalogRecord,
  settings: MatchingSettings,
  rejectedForms: RejectedForms,
): Assessment {
  const title = assessTitle(read, record, settings);

  return {
    record,
    titleScore: title.score,
    solid: title.solid,
    volumeOk:
      read.volume === undefined ||
      record.context.volume === undefined ||
      read.volume === record.context.volume,
    authorScore: readAuthorScore(read, record, formsOf(record, rejectedForms))?.value,
  };
}

/**
 * The title read, whole or by segments. A whole match is solid. A segment alone is solid only if
 * the record explains the other segments — series, collection, volume, publisher — otherwise
 * the book is ambiguous, never confirmed (FR-004).
 */
function assessTitle(
  read: ReadBook,
  record: CatalogRecord,
  settings: MatchingSettings,
): { score: number; solid: boolean } {
  const whole = Math.max(...read.forms.map((form) => titleScore(form, record).value));
  if (whole >= settings.titleThreshold) {
    return { score: whole, solid: true };
  }

  const segments = read.segments.map((segment) => ({
    segment,
    score: titleScore(segment, record).value,
  }));
  const best = segments.reduce((a, b) => (b.score > a.score ? b : a), segments[0]);
  if (best.score < settings.titleThreshold) {
    return { score: Math.max(whole, best.score), solid: false };
  }

  const others = segments.filter((candidate) => candidate !== best);

  return {
    score: best.score,
    solid: others.every((other) => isExplained(other.segment, record, settings)),
  };
}

function isExplained(segment: string, record: CatalogRecord, settings: MatchingSettings): boolean {
  const wanted = normalizeText(segment);
  const around = [
    record.context.series,
    record.context.collection,
    record.context.publisher,
    record.titleComplement,
    ...recordTitleForms(record),
  ];

  return around.some((text) => {
    if (text === undefined) {
      return false;
    }
    const normalized = normalizeText(text);

    return (
      similarity(wanted, normalized) >= settings.titleThreshold ||
      (normalized.length >= MIN_CONTAINED_LENGTH && wanted.includes(normalized)) ||
      (wanted.length >= MIN_CONTAINED_LENGTH && normalized.includes(wanted))
    );
  });
}

export function authorMatches(assessment: Assessment, settings: MatchingSettings): boolean {
  return (assessment.authorScore ?? 0) >= settings.authorThreshold;
}

export function formsOf(record: CatalogRecord, rejectedForms: RejectedForms): readonly string[] {
  return record.authors.flatMap((author) =>
    author.authorityId === undefined ? [] : (rejectedForms.get(author.authorityId.value) ?? []),
  );
}

export function combinedScore(
  assessment: Assessment,
  settings: MatchingSettings,
  read: ReadBook,
): number {
  return read.author === undefined || assessment.authorScore === undefined
    ? assessment.titleScore
    : settings.titleWeight * assessment.titleScore +
        (1 - settings.titleWeight) * assessment.authorScore;
}
