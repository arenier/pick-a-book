import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { ScanRef } from './scan-ref.js';
import { ShelfBookRef } from './shelf-book-ref.js';

const scanRef = unwrap(ScanRef.of('0e1d6d5c-0b5e-4f5b-8f5b-3c8d3b7a9a11'));

describe('ShelfBookRef', () => {
  it('accepts a position of zero or more', () => {
    expect(ShelfBookRef.of(scanRef, 0).ok).toBe(true);
    expect(ShelfBookRef.of(scanRef, 29).ok).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the position %s',
    (position) => {
      expect(ShelfBookRef.of(scanRef, position).ok).toBe(false);
    },
  );

  it('compares by value', () => {
    const a = unwrap(ShelfBookRef.of(scanRef, 2));

    expect(a.equals(unwrap(ShelfBookRef.of(scanRef, 2)))).toBe(true);
    expect(a.equals(unwrap(ShelfBookRef.of(scanRef, 3)))).toBe(false);
  });
});
