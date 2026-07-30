import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';

/**
 * An (author, title) pair read off a shelf photo, with its confidence.
 *
 * This is the output contract of the recognition context (ADR 0005). Nothing here is
 * reconciled: a `DetectedBook` may perfectly well name a work that does not exist. The
 * safety net against hallucination is bibliographic reconciliation, downstream.
 */
export class DetectedBook {
  private constructor(
    readonly author: Author,
    readonly title: BookTitle,
    readonly confidence: Confidence,
  ) {}

  static of(author: Author, title: BookTitle, confidence: Confidence): DetectedBook {
    return new DetectedBook(author, title, confidence);
  }

  isAtLeast(threshold: Confidence): boolean {
    return this.confidence.isAtLeast(threshold);
  }
}
