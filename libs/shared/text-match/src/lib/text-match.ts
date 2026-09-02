/**
 * Comparison of short human-typed or machine-read strings — author names, titles — that
 * tolerates the differences that do not change meaning: case, accents, punctuation, spacing,
 * and the odd OCR typo.
 *
 * A shared primitive on purpose (ADR 0002): the recognition bench (#10) uses it to score a
 * detection against the ground truth, and bibliographic reconciliation, when it lands, will
 * match a read title against a reference the same way. Neither should carry its own copy.
 */

/**
 * The default similarity above which two strings are considered the same thing.
 *
 * 0.85 leaves room for a one- or two-character slip on a normal-length title while still
 * separating genuinely different works. Callers that need a different bar pass their own.
 */
const DEFAULT_THRESHOLD = 0.85;

/**
 * Folds a string to its comparable core: lower case, no diacritics, alphanumerics separated
 * by single spaces. Everything else — punctuation, symbols, runs of space — collapses.
 *
 * Exposed, not private: reconciliation will want the same canonical form to key on.
 */
export function normalizeText(raw: string): string {
  return (
    raw
      .normalize('NFD')
      // Strip the combining marks NFD split off, so "é" becomes "e".
      .replaceAll(/\p{Diacritic}/gu, '')
      .toLowerCase()
      // Anything that is not a letter or a digit becomes a separator.
      .replaceAll(/[^\p{Letter}\p{Number}]+/gu, ' ')
      .trim()
  );
}

/**
 * How alike two strings are once normalized, in [0, 1]: 1 is identical, 0 is nothing in
 * common. Built on the Levenshtein edit distance, scaled by the longer length so that one
 * edit weighs less on a long title than on a short surname.
 */
export function similarity(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (left.length === 0 && right.length === 0) {
    return 1;
  }

  const distance = levenshtein(left, right);
  const longest = Math.max(left.length, right.length);

  return 1 - distance / longest;
}

/** Whether two strings name the same thing, allowing for OCR-level noise. */
export function fuzzyEquals(a: string, b: string, threshold: number = DEFAULT_THRESHOLD): boolean {
  return similarity(a, b) >= threshold;
}

/**
 * Levenshtein edit distance with a rolling pair of rows — O(min length) memory rather than
 * the full matrix, which is all this comparison of short strings needs.
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_unused, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      // Insertion, deletion, substitution — the cheapest of the three.
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    previous = current;
  }

  return previous[b.length];
}
