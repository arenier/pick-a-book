import { nameSimilarity } from './author-forms.js';
import { combinedScore, type Assessment } from './assessment.js';
import type { CatalogRecord } from './catalog-record.js';
import type { MatchingSettings } from './matching-settings.js';
import type { ReadBook } from './read-book.js';
import { pairScore, recordTitleForms } from './title-forms.js';

/** The records that describe one work, and the one that stands for it. */
export interface Work {
  readonly members: readonly Assessment[];
  readonly representative: Assessment;
  readonly score: number;
  readonly solid: boolean;
}

/**
 * A record that names a series by one of its volumes outranks the record of the series alone
 * (FR-019): the volume is the book on the shelf, the series is not a candidate of its own.
 */
export function dropSeriesOutranked(
  kept: readonly Assessment[],
  settings: MatchingSettings,
): readonly Assessment[] {
  return kept.filter(
    (series) =>
      series.record.context.volume !== undefined ||
      !kept.some(
        (volume) =>
          volume !== series &&
          volume.record.context.volume !== undefined &&
          namesTheSeries(volume.record, series.record, settings),
      ),
  );
}

function namesTheSeries(
  volume: CatalogRecord,
  series: CatalogRecord,
  settings: MatchingSettings,
): boolean {
  const named = [volume.title, volume.context.series].filter((text) => text !== undefined);

  return named.some((name) =>
    recordTitleForms(series).some((form) => pairScore(name, form) >= settings.titleThreshold),
  );
}

/** Union of the records that describe the same work, one by one (single linkage). */
export function groupIntoWorks(
  kept: readonly Assessment[],
  read: ReadBook,
  settings: MatchingSettings,
): readonly Work[] {
  const groups: Assessment[][] = [];
  for (const assessment of kept) {
    const joined = groups.filter((group) =>
      group.some((member) => sameWork(member.record, assessment.record, settings)),
    );
    const merged = [assessment, ...joined.flat()];
    for (const group of joined) {
      groups.splice(groups.indexOf(group), 1);
    }
    groups.push(merged);
  }

  return groups.map((members) => {
    const ordered = members.toSorted((a, b) => compareRepresentatives(a, b, read, settings));
    const representative = ordered[0];

    return {
      members,
      representative,
      score: Math.max(...members.map((member) => combinedScore(member, settings, read))),
      solid: members.some((member) => member.solid),
    };
  });
}

/**
 * The same work: titles alike (with the same numbers), authors that overlap — any role, so that
 * a novel and its adaptation by another hand are one work (FR-020) — and the same
 * volume. Never the catalogue's own work identifier — it fabricated false ambiguities (§5.6).
 */
function sameWork(left: CatalogRecord, right: CatalogRecord, settings: MatchingSettings): boolean {
  const titlesAlike = recordTitleForms(left).some((a) =>
    recordTitleForms(right).some((b) => pairScore(a, b) >= settings.titleThreshold),
  );

  return (
    titlesAlike &&
    left.context.volume === right.context.volume &&
    authorsOverlap(left, right, settings)
  );
}

function authorsOverlap(
  left: CatalogRecord,
  right: CatalogRecord,
  settings: MatchingSettings,
): boolean {
  const a = authorNames(left);
  const b = authorNames(right);
  if (a.length === 0 || b.length === 0) {
    return true;
  }

  return a.some((x) => b.some((y) => nameSimilarity(x, y) >= settings.authorThreshold));
}

function authorNames(record: CatalogRecord): readonly string[] {
  return record.authors.map((author) => author.name);
}

function mainAuthors(record: CatalogRecord): readonly string[] {
  return record.authors.filter((author) => author.role === 'main').map((author) => author.name);
}

/**
 * The representative record of a work (§5.7): the one whose main authors are those that were
 * read, then the best scored, then the smallest ARK — never the order of the answer.
 */
function compareRepresentatives(
  a: Assessment,
  b: Assessment,
  read: ReadBook,
  settings: MatchingSettings,
): number {
  return (
    unmatchedMainAuthors(a.record, read, settings) -
      unmatchedMainAuthors(b.record, read, settings) ||
    combinedScore(b, settings, read) - combinedScore(a, settings, read) ||
    compareIds(a.record, b.record)
  );
}

function unmatchedMainAuthors(
  record: CatalogRecord,
  read: ReadBook,
  settings: MatchingSettings,
): number {
  if (read.author === undefined) {
    return 0;
  }
  const names = [read.author, ...read.names];

  return mainAuthors(record).filter(
    (author) => !names.some((name) => nameSimilarity(name, author) >= settings.authorThreshold),
  ).length;
}

export function compareWorks(a: Work, b: Work): number {
  return b.score - a.score || compareIds(a.representative.record, b.representative.record);
}

function compareIds(a: CatalogRecord, b: CatalogRecord): number {
  return a.id.value < b.id.value ? -1 : a.id.value > b.id.value ? 1 : 0;
}
