import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  type ShelfPhoto,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';

import { ScanShelfUseCase } from './scan-shelf.use-case.js';

/** The use case is tested without infrastructure: a double of the port is enough (ADR 0002). */
class ShelfScannerStub implements ShelfScannerPort {
  seen: ShelfPhoto | undefined;

  constructor(private readonly books: DetectedBook[]) {}

  scan(photo: ShelfPhoto): Promise<DetectedBook[]> {
    this.seen = photo;
    return Promise.resolve(this.books);
  }
}

const aBook = (author: string, title: string, confidence: number) =>
  DetectedBook.of(Author.of(author), BookTitle.of(title), Confidence.of(confidence));

const aJpeg = { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' };

describe('ScanShelfUseCase', () => {
  it('translates detected books into boundary DTOs', async () => {
    const scanner = new ShelfScannerStub([aBook('Annie Ernaux', 'Les Annees', 0.91)]);

    const result = await new ScanShelfUseCase(scanner).execute(aJpeg);

    expect(result.books).toEqual([
      { author: 'Annie Ernaux', title: 'Les Annees', confidence: 0.91 },
    ]);
  });

  it('reports weak detections without filtering them out', async () => {
    const scanner = new ShelfScannerStub([aBook('Auteur incertain', 'Titre incertain', 0.12)]);

    const result = await new ScanShelfUseCase(scanner).execute(aJpeg);

    expect(result.books).toHaveLength(1);
    expect(result.books[0].confidence).toBe(0.12);
  });

  it('returns an empty list when nothing is readable', async () => {
    const result = await new ScanShelfUseCase(new ShelfScannerStub([])).execute(aJpeg);

    expect(result.books).toEqual([]);
  });

  it('rejects an off-contract image before calling the port', async () => {
    const scanner = new ShelfScannerStub([]);

    await expect(
      new ScanShelfUseCase(scanner).execute({ bytes: new Uint8Array(0), mediaType: 'image/jpeg' }),
    ).rejects.toThrow(/empty/u);
    expect(scanner.seen).toBeUndefined();
  });
});
