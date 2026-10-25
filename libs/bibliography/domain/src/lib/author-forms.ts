import { normalizeText, similarity } from '@pick-a-book/shared-text-match';

import type { CatalogRecord } from './catalog-record.js';
import { MatchScore } from './match-score.js';
import type { ReadBook } from './read-book.js';

/** How much an initial that is not the first name counts: it cannot reach the threshold alone. */
const WRONG_INITIAL_FACTOR = 0.5;

interface ParsedName {
  /** Every comparable writing of the whole name, in either order. */
  readonly orders: readonly string[];
  readonly family: string;
  readonly given: readonly string[];
}

/**
 * How well a name read from a book matches an author of the record, in [0, 1] — the best of
 * all the authors, main and secondary, and of the rejected forms of their authorities
 * (research §5.2, §5.4).
 */
export function authorScore(
  name: string,
  record: CatalogRecord,
  rejectedForms: readonly string[] = [],
): MatchScore {
  const read = parseName(name);
  const candidates = [...record.authors.map((author) => author.name), ...rejectedForms];

  return MatchScore.fromComputed(
    Math.max(0, ...candidates.map((candidate) => nameScore(read, parseName(candidate)))),
  );
}

/**
 * The score of what was read as the author of a book: the best of the names it holds, or of the
 * whole author as read. Absent when no author was read.
 */
export function readAuthorScore(
  read: ReadBook,
  record: CatalogRecord,
  rejectedForms: readonly string[] = [],
): MatchScore | undefined {
  if (read.author === undefined) {
    return undefined;
  }

  const names = [read.author, ...read.names];

  return MatchScore.fromComputed(
    Math.max(...names.map((name) => authorScore(name, record, rejectedForms).value)),
  );
}

/** How alike two names are, in [0, 1]: the comparison of `authorScore`, between two strings. */
export function nameSimilarity(left: string, right: string): number {
  return nameScore(parseName(left), parseName(right));
}

function nameScore(read: ParsedName, candidate: ParsedName): number {
  let best = 0;
  for (const left of read.orders) {
    for (const right of candidate.orders) {
      best = Math.max(best, similarity(left, right));
    }
  }

  return Math.max(best, familyScore(read, candidate));
}

/**
 * The family name alone, or with an abbreviated first name (« A. Camus »). A first name that
 * is spelled out on both sides is left to the comparison of the whole names.
 */
function familyScore(read: ParsedName, candidate: ParsedName): number {
  if (read.family.length === 0 || candidate.family.length === 0) {
    return 0;
  }
  const family = similarity(read.family, candidate.family);
  const readGiven = read.given.at(0);
  const candidateGiven = candidate.given.at(0);

  if (readGiven === undefined || candidateGiven === undefined) {
    return family;
  }
  if (readGiven.length > 1 && candidateGiven.length > 1) {
    return 0;
  }

  return readGiven[0] === candidateGiven[0] ? family : family * WRONG_INITIAL_FACTOR;
}

/** « Camus, Albert (1913-1960) » and « Albert Camus » both become family, given and orders. */
function parseName(raw: string): ParsedName {
  const withoutDates = raw.replaceAll(/\([^)]*\)/gu, ' ');
  const comma = withoutDates.indexOf(',');

  if (comma >= 0) {
    const family = normalizeText(withoutDates.slice(0, comma));
    const given = normalizeText(withoutDates.slice(comma + 1));

    return {
      orders: [`${given} ${family}`.trim(), `${family} ${given}`.trim()],
      family,
      given: tokens(given),
    };
  }

  const all = tokens(withoutDates);
  const family = all.at(-1) ?? '';
  const given = all.slice(0, -1);

  return {
    orders: [all.join(' '), [family, ...given].join(' ')],
    family,
    given,
  };
}

function tokens(text: string): readonly string[] {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 0);
}
