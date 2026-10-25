import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { BookAlreadyReconciled } from './book-already-reconciled.error.js';
import { BookNotAmbiguous } from './book-not-ambiguous.error.js';
import { BookReconciliationNotFound } from './book-reconciliation-not-found.error.js';
import { CatalogUnavailable } from './catalog-unavailable.error.js';
import { CatalogRecordId } from './catalog-record-id.js';
import { ScanRef } from './scan-ref.js';
import { ShelfBookRef } from './shelf-book-ref.js';
import { UnknownCandidate } from './unknown-candidate.error.js';

const bookRef = unwrap(
  ShelfBookRef.of(unwrap(ScanRef.of('0e1d6d5c-0b5e-4f5b-8f5b-3c8d3b7a9a11')), 4),
);

describe('the errors of the context', () => {
  it('names a catalogue that cannot answer, with why', () => {
    const error = new CatalogUnavailable('invalid_response');

    expect(error.kind).toBe('catalog-unavailable');
    expect(error.cause).toBe('invalid_response');
    expect(error).toBeInstanceOf(Error);
  });

  it('names a book already reconciled', () => {
    const error = new BookAlreadyReconciled(bookRef);

    expect(error.kind).toBe('book-already-reconciled');
    expect(error.message).toContain('#4');
  });

  it('names a book that is not ambiguous', () => {
    expect(new BookNotAmbiguous(bookRef).kind).toBe('book-not-ambiguous');
  });

  it('names a candidate that is not one', () => {
    const error = new UnknownCandidate(unwrap(CatalogRecordId.of('ark:/12148/cb1')));

    expect(error.kind).toBe('unknown-candidate');
    expect(error.message).toContain('ark:/12148/cb1');
  });

  it('names a book that was never reconciled', () => {
    expect(new BookReconciliationNotFound(bookRef).kind).toBe('book-reconciliation-not-found');
  });
});
