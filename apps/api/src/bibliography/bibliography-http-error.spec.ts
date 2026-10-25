import {
  BookNotAmbiguous,
  BookReconciliationNotFound,
  CatalogRecordId,
  ScanRef,
  ShelfBookRef,
  UnknownCandidate,
} from '@pick-a-book/bibliography-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { toHttpException } from './bibliography-http-error';

const bookRef = unwrap(
  ShelfBookRef.of(unwrap(ScanRef.of('1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b')), 3),
);

// The bibliography context's errors, said in HTTP (contracts/reconciliation-api.md): one switch,
// checked for exhaustiveness by the compiler.
describe('toHttpException, bibliography', () => {
  it('says a book never reconciled as 404', () => {
    const http = toHttpException(new BookReconciliationNotFound(bookRef));

    expect(http.getStatus()).toBe(404);
    expect(http.getResponse()).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('says a book that is not ambiguous as 409 BOOK_NOT_AMBIGUOUS', () => {
    const http = toHttpException(new BookNotAmbiguous(bookRef));

    expect(http.getStatus()).toBe(409);
    expect(http.getResponse()).toMatchObject({ statusCode: 409, code: 'BOOK_NOT_AMBIGUOUS' });
  });

  it('says a record that is not a candidate as 400 UNKNOWN_CANDIDATE', () => {
    const http = toHttpException(new UnknownCandidate(unwrap(CatalogRecordId.of('ark:/1'))));

    expect(http.getStatus()).toBe(400);
    expect(http.getResponse()).toMatchObject({ statusCode: 400, code: 'UNKNOWN_CANDIDATE' });
  });
});
