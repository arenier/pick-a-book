import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanId,
  ShelfScanNotFound,
  type ShelfPhoto,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { describe, expect, it } from 'vitest';

import { ScanStoredShelfPhotoUseCase } from './scan-stored-shelf-photo.use-case.js';
import { StoreShelfPhotoUseCase } from './store-shelf-photo.use-case.js';
import { InMemoryShelfPhotoStorage } from './testing/in-memory-shelf-photo-storage.js';
import { InMemoryShelfScanRepository } from './testing/in-memory-shelf-scan-repository.js';

/** A double of the scanner port: answers with the given books, and records what it saw. */
class ShelfScannerStub implements ShelfScannerPort {
  readonly seen: ShelfPhoto[] = [];

  constructor(private readonly books: DetectedBook[]) {}

  async scan(photo: ShelfPhoto): Promise<DetectedBook[]> {
    this.seen.push(photo);
    return this.books;
  }
}

const aJpeg = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]),
  mediaType: 'image/jpeg',
  originalFilename: 'IMG_0001.jpg',
};

/** A photo already stored by the first step, and the second step wired to the same ports. */
async function aStoredPhoto(scanner: ShelfScannerPort) {
  const storage = new InMemoryShelfPhotoStorage();
  const repository = new InMemoryShelfScanRepository();
  const { id } = await new StoreShelfPhotoUseCase('default', storage, repository).execute(aJpeg);

  return {
    id,
    repository,
    useCase: new ScanStoredShelfPhotoUseCase(storage, repository, scanner),
  };
}

const books = [
  DetectedBook.of(Author.of('Annie Ernaux'), BookTitle.of('Les Annees'), Confidence.of(0.91)),
  DetectedBook.of(undefined, BookTitle.of('Les Choses'), Confidence.of(0.4)),
];

describe('ScanStoredShelfPhotoUseCase', () => {
  it('scans the photo stored under the id', async () => {
    const scanner = new ShelfScannerStub(books);
    const { id, useCase } = await aStoredPhoto(scanner);

    await useCase.execute({ id });

    expect(scanner.seen).toHaveLength(1);
    expect(scanner.seen[0]?.bytes).toStrictEqual(aJpeg.bytes);
    expect(scanner.seen[0]?.mediaType).toBe('image/jpeg');
  });

  it('answers with the detected books as boundary DTOs', async () => {
    const { id, useCase } = await aStoredPhoto(new ShelfScannerStub(books));

    const result = await useCase.execute({ id });

    expect(result.books).toStrictEqual([
      { author: 'Annie Ernaux', title: 'Les Annees', confidence: 0.91 },
      { author: undefined, title: 'Les Choses', confidence: 0.4 },
    ]);
  });

  it('records the scan as completed, with its books', async () => {
    const { id, repository, useCase } = await aStoredPhoto(new ShelfScannerStub(books));

    await useCase.execute({ id });

    const record = await repository.get(ShelfScanId.of(id));
    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual(books);
  });

  // "No book detected" is a result (US1, scenario 3), not an error.
  it('completes with an empty list when nothing is readable', async () => {
    const { id, repository, useCase } = await aStoredPhoto(new ShelfScannerStub([]));

    const result = await useCase.execute({ id });

    expect(result.books).toStrictEqual([]);
    expect((await repository.get(ShelfScanId.of(id)))?.status).toBe('completed');
  });
});

const failingScanner: ShelfScannerPort = {
  scan: async () => {
    throw new ShelfScanFailed('provider unavailable');
  },
};

describe('ScanStoredShelfPhotoUseCase, when the scanner fails', () => {
  // Passed through as is: HTTP maps it to 502, where "no book detected" would lie (FR-006).
  it('rejects with the scanner failure', async () => {
    const { id, useCase } = await aStoredPhoto(failingScanner);

    await expect(useCase.execute({ id })).rejects.toThrow(ShelfScanFailed);
  });

  // US3, scenario 2: the photo is kept, and its record says the scan failed (FR-011).
  it('records the scan as failed, never as completed', async () => {
    const { id, repository, useCase } = await aStoredPhoto(failingScanner);

    await expect(useCase.execute({ id })).rejects.toThrow(ShelfScanFailed);

    const record = await repository.get(ShelfScanId.of(id));
    expect(record?.status).toBe('failed');
    expect(record?.detectedBooks).toBeUndefined();
  });
});

describe('ScanStoredShelfPhotoUseCase, for an id it cannot scan', () => {
  // Mapped to 404: an id that is not even a UUID is just as unknown.
  it.each([
    ['an unknown UUID', ShelfScanId.generate().value],
    ['a malformed id', 'not-a-uuid'],
  ])('rejects %s with ShelfScanNotFound', async (_label, unknownId) => {
    const scanner = new ShelfScannerStub(books);
    const { useCase } = await aStoredPhoto(scanner);

    await expect(useCase.execute({ id: unknownId })).rejects.toThrow(ShelfScanNotFound);
    expect(scanner.seen).toHaveLength(0);
  });

  // Mapped to 409 (research.md §7): a second scan would overwrite a result, or pay for a
  // VLM call nobody asked for.
  it('rejects a scan already completed, without calling the scanner again', async () => {
    const scanner = new ShelfScannerStub(books);
    const { id, useCase } = await aStoredPhoto(scanner);
    await useCase.execute({ id });

    await expect(useCase.execute({ id })).rejects.toThrow(ShelfScanAlreadyProcessed);
    expect(scanner.seen).toHaveLength(1);
  });

  it('rejects a scan already failed, without calling the scanner again', async () => {
    const { id, useCase } = await aStoredPhoto(failingScanner);
    await expect(useCase.execute({ id })).rejects.toThrow(ShelfScanFailed);

    await expect(useCase.execute({ id })).rejects.toThrow(ShelfScanAlreadyProcessed);
  });
});
