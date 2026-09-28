import { Confidence, ShelfPhoto } from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { StubShelfScannerAdapter } from './stub-shelf-scanner.adapter.js';

describe('StubShelfScannerAdapter', () => {
  const photo = unwrap(ShelfPhoto.of(new Uint8Array([1, 2, 3]), 'image/jpeg'));

  it('honours the port contract', async () => {
    const books = unwrap(await new StubShelfScannerAdapter().scan(photo));

    expect(books.length).toBeGreaterThan(0);
    for (const book of books) {
      expect(book.author?.value).not.toHaveLength(0);
      expect(book.title.value).not.toHaveLength(0);
      expect(book.confidence.value).toBeGreaterThanOrEqual(0);
      expect(book.confidence.value).toBeLessThanOrEqual(1);
    }
  });

  it('includes a weak detection, so downstream filtering can be exercised', async () => {
    const books = unwrap(await new StubShelfScannerAdapter().scan(photo));
    const half = unwrap(Confidence.of(0.5));

    expect(books.some((book) => !book.isAtLeast(half))).toBe(true);
  });
});
