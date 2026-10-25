import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

const MAX_TITLE_LENGTH = 500;

/** Separators of a composed title (« Percy Jackson - La Mer des Monstres »), spaced on purpose. */
const SEGMENT_SEPARATOR = /\s[-–—:/]\s/u;

/** Separators of several names (« D. Pennac - J. Ferrandez »); a hyphen inside a name stays. */
const NAME_SEPARATOR = /\s[-–—/&]\s|\s&\s|\s+et\s+|\s*[/&,]\s*/u;

const WORD_BOUNDARY_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const WORD_BOUNDARY_AFTER = String.raw`(?![\p{L}\p{N}])`;

/** « tome 3 », « vol. 2 », « T2 ». */
const EXPLICIT_VOLUME = new RegExp(
  `${WORD_BOUNDARY_BEFORE}(?:tome|volume|vol|t)\\s*\\.?\\s*(\\d{1,3})${WORD_BOUNDARY_AFTER}`,
  'giu',
);

/** « 2e », « 2ème », « 2ème tome ». */
const ORDINAL_VOLUME = new RegExp(
  `${WORD_BOUNDARY_BEFORE}(\\d{1,2})\\s*(?:ème|eme|er|ère|è|e)(?:\\s+(?:tome|volume))?${WORD_BOUNDARY_AFTER}`,
  'giu',
);

/** A number closing the title after at least one word: « Harry Potter 3 ». */
const TRAILING_NUMBER = /^(.*\p{L}.*?)\s+(\d{1,2})$/u;

/**
 * What the recognition read on a spine, taken apart for the matching rule (research §5.1).
 *
 * The reading is kept as it came (`title`, `author`); the rest is what the rule compares:
 * the segments of a composed title, the mention of a volume — extracted and **kept**, never
 * dropped, because dropping it points « Éternels (tome 3) » at the first volume — and one name
 * per author.
 */
export class ReadBook {
  private constructor(
    readonly title: string,
    readonly author: string | undefined,
    /** The title without parentheses nor volume mention, cut on its separators. */
    readonly segments: readonly string[],
    /** The whole title as one comparable string, plus the same without a trailing bare number. */
    readonly forms: readonly string[],
    readonly volume: number | undefined,
    /** One name per author read; empty when no author was read. */
    readonly names: readonly string[],
  ) {}

  static of(rawTitle: string, rawAuthor?: string): Result<ReadBook, InvalidValue> {
    const title = collapse(rawTitle);
    if (title.length === 0) {
      return err(new InvalidValue('ReadBook: the title read cannot be empty'));
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return err(
        new InvalidValue(
          `ReadBook: title too long (${title.length} characters, ${MAX_TITLE_LENGTH} at most)`,
        ),
      );
    }

    let author: string | undefined;
    if (rawAuthor !== undefined) {
      author = collapse(rawAuthor);
      if (author.length === 0) {
        return err(new InvalidValue('ReadBook: an author that was read cannot be blank'));
      }
    }

    const { text, volume: explicitVolume } = takeExplicitVolume(title);
    const withoutParentheses = collapse(text.replaceAll(/\([^)]*\)/gu, ' '));
    const bare = explicitVolume === undefined ? TRAILING_NUMBER.exec(withoutParentheses) : null;

    const segments = splitSegments(withoutParentheses, title);
    const forms = [segments.join(' ')];
    if (bare !== null) {
      forms.push(collapse(`${segments.slice(0, -1).join(' ')} ${stripTrailingNumber(segments)}`));
    }

    return ok(
      new ReadBook(
        title,
        author,
        segments,
        forms,
        explicitVolume ?? (bare === null ? undefined : Number(bare[2])),
        author === undefined ? [] : splitNames(author),
      ),
    );
  }
}

function collapse(raw: string): string {
  return raw.trim().replaceAll(/\s+/gu, ' ');
}

/** Pulls every explicit mention of a volume out of the title; the first one gives the number. */
function takeExplicitVolume(title: string): { text: string; volume: number | undefined } {
  let volume: number | undefined;
  const remember = (_match: string, digits: string): string => {
    volume ??= Number(digits);
    return ' ';
  };

  const text = title.replaceAll(EXPLICIT_VOLUME, remember).replaceAll(ORDINAL_VOLUME, remember);

  return { text, volume };
}

function splitSegments(cleaned: string, fallback: string): readonly string[] {
  const segments = cleaned
    .split(SEGMENT_SEPARATOR)
    // A separator left dangling by a removed mention (« Astérix - 2ème tome ») goes with it.
    .map((segment) => collapse(segment).replaceAll(/^[-–—:/\s]+|[-–—:/\s]+$/gu, ''))
    .filter((segment) => segment.length > 0);

  return segments.length === 0 ? [fallback] : segments;
}

function stripTrailingNumber(segments: readonly string[]): string {
  const last = segments.at(-1) ?? '';
  const match = TRAILING_NUMBER.exec(last);

  return match === null ? last : match[1];
}

function splitNames(author: string): readonly string[] {
  return author
    .split(NAME_SEPARATOR)
    .map((name) => collapse(name))
    .filter((name) => name.length > 0);
}
