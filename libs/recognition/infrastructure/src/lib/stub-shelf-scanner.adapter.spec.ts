import { Confidence, ShelfPhoto } from '@pick-a-book/recognition-domain';

import { StubShelfScannerAdapter } from './stub-shelf-scanner.adapter.js';

describe('StubShelfScannerAdapter', () => {
  const photo = ShelfPhoto.of(new Uint8Array([1, 2, 3]), 'image/jpeg');

  it('honore le contrat du port', async () => {
    const books = await new StubShelfScannerAdapter().scan(photo);

    expect(books.length).toBeGreaterThan(0);
    for (const book of books) {
      expect(book.author.value).not.toHaveLength(0);
      expect(book.title.value).not.toHaveLength(0);
      expect(book.confidence.value).toBeGreaterThanOrEqual(0);
      expect(book.confidence.value).toBeLessThanOrEqual(1);
    }
  });

  it('inclut une detection faible, pour que le filtrage en aval soit exercable', async () => {
    const books = await new StubShelfScannerAdapter().scan(photo);

    expect(books.some((book) => !book.isAtLeast(Confidence.of(0.5)))).toBe(true);
  });
});
