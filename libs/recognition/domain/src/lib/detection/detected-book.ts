import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';

/**
 * An (author, title) pair read off a shelf photo, with its confidence.
 *
 * This is the output contract of the recognition context (ADR 0005). Nothing here is
 * reconciled: a `DetectedBook` may perfectly well name a work that does not exist. The
 * safety net against hallucination is bibliographic reconciliation, downstream.
 *
 * The title identifies the book and is always present; the author is optional (ADR 0005,
 * 2026-09-04 amendment) — many spines do not print it, and inventing one is the very
 * hallucination the design refuses. `undefined` means "not on the spine", never "we failed":
 * reconciliation attaches the author downstream, where the obligation belongs.
 */
export class DetectedBook {
  private constructor(
    readonly author: Author | undefined,
    readonly title: BookTitle,
    readonly confidence: Confidence,
  ) {}

  static of(author: Author | undefined, title: BookTitle, confidence: Confidence): DetectedBook {
    return new DetectedBook(author, title, confidence);
  }

  isAtLeast(threshold: Confidence): boolean {
    return this.confidence.isAtLeast(threshold);
  }
}
