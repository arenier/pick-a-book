import { describe, expect, it } from 'vitest';

import { aBibliographyError } from './testing/book-ref';
import { toHttpException } from './orchestration-http-error';
import { ShelfScanNotCompleted } from './shelf-scan-not-completed.error';

const ID = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

// The failures of the orchestrator, said in HTTP (contracts/reconciliation-api.md §Correspondance).
describe('toHttpException, orchestration', () => {
  it('says an analysis unknown, or someone else`s, as 404', () => {
    const http = toHttpException(
      Object.assign(new Error(`Shelf scan not found: ${ID}`), {
        kind: 'shelf-scan-not-found' as const,
      }),
    );

    expect(http.getStatus()).toBe(404);
    expect(http.getResponse()).toMatchObject({ statusCode: 404, error: 'Not Found' });
  });

  it('says an analysis that did not complete as 409 SCAN_NOT_COMPLETED', () => {
    const http = toHttpException(new ShelfScanNotCompleted(ID));

    expect(http.getStatus()).toBe(409);
    expect(http.getResponse()).toStrictEqual({
      statusCode: 409,
      message: `Shelf scan not completed: ${ID}`,
      error: 'Conflict',
      code: 'SCAN_NOT_COMPLETED',
    });
  });

  // The recognition proved the reference and the reading: an invalid one is a bug, not a request.
  it('says an invalid value as a 500 with a generic message', () => {
    const http = toHttpException(
      Object.assign(new Error('ScanRef: not a UUID (x)'), { kind: 'invalid-value' as const }),
    );

    expect(http.getStatus()).toBe(500);
    expect(JSON.stringify(http.getResponse())).not.toContain('ScanRef');
  });

  // The failures of bibliography are said by its own translator, through this one.
  it.each([
    ['book-reconciliation-not-found', 404],
    ['book-not-ambiguous', 409],
    ['unknown-candidate', 400],
  ] as const)('passes %s on to the translator of bibliography', (kind, status) => {
    const http = toHttpException(aBibliographyError(kind));

    expect(http.getStatus()).toBe(status);
  });
});

describe('toHttpException, orchestration, part 2', () => {
  it('keeps the stable codes of the translator of bibliography', () => {
    const conflict = toHttpException(aBibliographyError('book-not-ambiguous'));

    expect(conflict.getResponse()).toMatchObject({ code: 'BOOK_NOT_AMBIGUOUS' });
  });
});
