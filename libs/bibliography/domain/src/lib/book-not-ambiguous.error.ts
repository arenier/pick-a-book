import type { ShelfBookRef } from './shelf-book-ref.js';

/** The book is not ambiguous (any more) */
export class BookNotAmbiguous extends Error {
  readonly kind = 'book-not-ambiguous';

  constructor(readonly bookRef: ShelfBookRef) {
    super(`ShelfBookRef:Book is not ambiguous: ${bookRef.toString()}`);
    this.name = 'BookNotAmbiguous';
  }
}
