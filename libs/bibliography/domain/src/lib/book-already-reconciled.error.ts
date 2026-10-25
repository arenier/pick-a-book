import type { ShelfBookRef } from './shelf-book-ref.js';

/** The book already has a final status */
export class BookAlreadyReconciled extends Error {
  readonly kind = 'book-already-reconciled';

  constructor(readonly bookRef: ShelfBookRef) {
    super(`ShelfBookRef:Book already reconciled: ${bookRef.toString()}`);
    this.name = 'BookAlreadyReconciled';
  }
}
