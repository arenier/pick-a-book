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

type BibliographyErrorKind =
  | 'book-reconciliation-not-found'
  | 'book-not-ambiguous'
  | 'unknown-candidate';

export const aBibliographyError = (kind: BibliographyErrorKind) => {
  const errors = {
    'book-reconciliation-not-found': () => new BookReconciliationNotFound(aBookRef()),
    'book-not-ambiguous': () => new BookNotAmbiguous(aBookRef()),
    'unknown-candidate': () => new UnknownCandidate(unwrap(CatalogRecordId.of('ark:/12148/x'))),
  } satisfies Record<BibliographyErrorKind, () => Error>;

  return errors[kind]();
};
