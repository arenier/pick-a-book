import type { CatalogRecordId } from './catalog-record-id.js';

/** The record chosen is not one of the candidates kept for the book. */
export class UnknownCandidate extends Error {
  readonly kind = 'unknown-candidate';

  constructor(readonly recordId: CatalogRecordId) {
    super(`Not a candidate of this book: ${recordId.toString()}`);
    this.name = 'UnknownCandidate';
  }
}
