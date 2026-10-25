import { normalizeText, similarity } from '@pick-a-book/shared-text-match';

import type { CatalogRecord } from './catalog-record.js';
import { MatchScore } from './match-score.js';

/** Initial articles (research §5.1): « Cuisine évasion » against « La Cuisine évasion » is 0.83. */
const INITIAL_ARTICLES = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'the', 'a', 'an']);

const CUT_BEFORE = /\s[:/]\s/u;

/** The forms a record can be compared through: its title, with its complement, cut short. */
export function recordTitleForms(record: CatalogRecord): readonly string[] {
  const withComplement =
    record.titleComplement === undefined
      ? record.title
      : `${record.title} : ${record.titleComplement}`;

  return unique([
    record.title,
    withComplement,
    cutBeforeSeparator(record.title),
    cutBeforeSeparator(withComplement),
  ]);
}

/**
 * How well a text read from a book matches the title of a record, in [0, 1]: the best of the
 * forms of the record (research §5.2).
 */
export function titleScore(text: string, record: CatalogRecord): MatchScore {
  return MatchScore.fromComputed(
    Math.max(0, ...recordTitleForms(record).map((form) => pairScore(text, form))),
  );
}

/**
 * The similarity of two titles, with and without their initial article, and 0 when they do not
 * carry the same numbers: « 17 lunes » and « 18 lunes » are 0.875 alike and two different works.
 */
export function pairScore(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a.length === 0 || b.length === 0 || !sameNumbers(a, b)) {
    return 0;
  }

  return Math.max(similarity(a, b), similarity(withoutArticle(a), withoutArticle(b)));
}

/** The numbers a title carries, in order, for the rule that a number tells two titles apart. */
export function numbersOf(text: string): readonly string[] {
  return normalizeText(text).match(/\d+/gu) ?? [];
}

function sameNumbers(a: string, b: string): boolean {
  const left = numbersOf(a);
  const right = numbersOf(b);

  return left.length === right.length && left.every((number, index) => number === right[index]);
}

function withoutArticle(normalized: string): string {
  const [first, ...rest] = normalized.split(' ');

  return rest.length > 0 && INITIAL_ARTICLES.has(first) ? rest.join(' ') : normalized;
}

function cutBeforeSeparator(text: string): string {
  return text.split(CUT_BEFORE)[0].trim();
}

function unique(forms: readonly string[]): readonly string[] {
  return [...new Set(forms.filter((form) => form.length > 0))];
}
