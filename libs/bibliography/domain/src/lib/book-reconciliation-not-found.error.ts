import type { ShelfBookRef } from './shelf-book-ref.js';

/** The book was never reconciled */
export class BookReconciliationNotFound extends Error {
  readonly kind = 'book-reconciliation-not-found';

  constructor(readonly bookRef: ShelfBookRef) {
    super(`ShelfBookRef:No reconciliation for book: ${bookRef.toString()}`);
    this.name = 'BookReconciliationNotFound';
  }
}
