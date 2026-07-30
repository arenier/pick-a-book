import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  type ShelfPhoto,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';

import { ScanShelfUseCase } from './scan-shelf.use-case.js';

/** Le use case se teste sans infrastructure : un double du port suffit (ADR 0002). */
class ShelfScannerStub implements ShelfScannerPort {
  seen: ShelfPhoto | undefined;

  constructor(private readonly books: DetectedBook[]) {}

  async scan(photo: ShelfPhoto): Promise<DetectedBook[]> {
    this.seen = photo;
    return this.books;
  }
}

const aBook = (author: string, title: string, confidence: number) =>
  DetectedBook.of(Author.of(author), BookTitle.of(title), Confidence.of(confidence));

const aJpeg = { bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/jpeg' };

describe('ScanShelfUseCase', () => {
  it('traduit les livres detectes en DTO de frontiere', async () => {
    const scanner = new ShelfScannerStub([aBook('Annie Ernaux', 'Les Annees', 0.91)]);

    const result = await new ScanShelfUseCase(scanner).execute(aJpeg);

    expect(result.books).toEqual([
      { author: 'Annie Ernaux', title: 'Les Annees', confidence: 0.91 },
    ]);
  });

  it('remonte les detections faibles sans les filtrer', async () => {
    const scanner = new ShelfScannerStub([aBook('Auteur incertain', 'Titre incertain', 0.12)]);

    const result = await new ScanShelfUseCase(scanner).execute(aJpeg);

    expect(result.books).toHaveLength(1);
    expect(result.books[0].confidence).toBe(0.12);
  });

  it('rend une liste vide quand rien n est lisible', async () => {
    const result = await new ScanShelfUseCase(new ShelfScannerStub([])).execute(aJpeg);

    expect(result.books).toEqual([]);
  });

  it('rejette une image hors contrat avant d appeler le port', async () => {
    const scanner = new ShelfScannerStub([]);

    await expect(
      new ScanShelfUseCase(scanner).execute({ bytes: new Uint8Array(0), mediaType: 'image/jpeg' }),
    ).rejects.toThrow(/vide/);
    expect(scanner.seen).toBeUndefined();
  });
});
