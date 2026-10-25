import {
  BookNotAmbiguous,
  BookReconciliationNotFound,
  CatalogRecordId,
  ScanRef,
  ShelfBookRef,
  UnknownCandidate,
} from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';

/**
 * Real errors of `bibliography`, for the specs that translate or pass them on. Excluded from the
 * app build (`tsconfig.app.json`).
 */
export const aBookRef = () =>
  unwrap(ShelfBookRef.of(unwrap(ScanRef.of('0e1d6d5c-0b5e-4f5b-8f5b-3c8d3b7a9a11')), 2));

export const aBibliographyError = (
  kind: 'book-reconciliation-not-found' | 'book-not-ambiguous' | 'unknown-candidate',
) => {
  switch (kind) {
    case 'book-reconciliation-not-found': {
      return new BookReconciliationNotFound(aBookRef());
    }
    case 'book-not-ambiguous': {
      return new BookNotAmbiguous(aBookRef());
    }
    case 'unknown-candidate': {
      return new UnknownCandidate(unwrap(CatalogRecordId.of('ark:/12148/x')));
    }
  }
};
