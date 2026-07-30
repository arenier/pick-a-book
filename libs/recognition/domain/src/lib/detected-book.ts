import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';

/**
 * Un couple (auteur, titre) lu sur une photo d'etagere, avec sa confiance.
 *
 * C'est le contrat de sortie du contexte de reconnaissance (ADR 0005). Rien n'y est
 * reconcilie : un `DetectedBook` peut parfaitement designer une oeuvre qui n'existe pas.
 * Le filet anti-hallucination est la reconciliation bibliographique, en aval.
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
