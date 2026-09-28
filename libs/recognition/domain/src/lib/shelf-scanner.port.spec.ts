import type { Result } from '@pick-a-book/shared-result';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { DetectedBook } from './detected-book.js';
import type { ShelfPhoto } from './shelf-photo.js';
import {
  SHELF_SCANNER_PORT,
  ShelfScanFailed,
  type ShelfScannerPort,
} from './shelf-scanner.port.js';

describe('ShelfScannerPort', () => {
  // A source that is down or off-contract is an expected failure, said in the type: the
  // caller must handle it (ADR 0013). A photo with no readable book is not one — it is `ok([])`.
  it('answers with the detected books, or with why it could not', () => {
    expectTypeOf<ShelfScannerPort['scan']>().toEqualTypeOf<
      (photo: ShelfPhoto) => Promise<Result<DetectedBook[], ShelfScanFailed>>
    >();
  });

  it('exposes a string injection token', () => {
    expect(SHELF_SCANNER_PORT).toBe('ShelfScannerPort');
  });
});

describe('ShelfScanFailed', () => {
  it('carries the reason and the cause, under a discriminant', () => {
    const cause = new Error('socket hang up');
    const error = new ShelfScanFailed('provider unavailable', { cause });

    expect(error.kind).toBe('shelf-scan-failed');
    expect(error.message).toBe('Shelf scan failed: provider unavailable');
    expect(error.cause).toBe(cause);
  });
});
