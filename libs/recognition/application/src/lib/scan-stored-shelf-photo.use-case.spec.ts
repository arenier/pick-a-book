import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  ShelfPhoto,
  ShelfScanFailed,
  type NewShelfScan,
  type ShelfPhotoStoragePort,
  type ShelfScanId,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScannerPort,
} from '@pick-a-book/recognition-domain';
import { describe, expect, it } from 'vitest';

import { ScanStoredShelfPhotoUseCase } from './scan-stored-shelf-photo.use-case.js';
import { ShelfScanAlreadyProcessed } from './shelf-scan-already-processed.error.js';
import { ShelfScanNotFound } from './shelf-scan-not-found.error.js';

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const storedId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const storedScan = {
  id: storedId,
  ownerId: 'default',
  photoBucketKey: `default/shelf_photo/${storedId}`,
  photoMediaType: 'image/jpeg',
  photoSizeBytes: jpegBytes.byteLength,
  originalFilename: 'IMG_0001.jpg',
} satisfies NewShelfScan;

const pendingRecord: ShelfScanRecord = {
  ...storedScan,
  status: 'pending',
  detectedBooks: undefined,
  createdAt: new Date('2026-09-21T10:00:00Z'),
};

const camus = DetectedBook.of(
  Author.of('Albert Camus'),
  BookTitle.of('La Peste'),
  Confidence.of(0.92),
);
/** A spine with no readable author — the optional half of the contract (ADR 0005). */
const anonymous = DetectedBook.of(undefined, BookTitle.of('Les Choses'), Confidence.of(0.71));

const unusedHere = (name: string) => (): never => {
  throw new Error(`${name} is not part of scanning a stored photo`);
};

/**
 * The use case under test, its three ports recorded.
 *
 * `answer` is what the scanner gives back — books, or the failure it raises.
 */
function useCaseWith(
  answer: DetectedBook[] | ShelfScanFailed,
  records: readonly ShelfScanRecord[] = [pendingRecord],
) {
  // A list rather than an optional record: "no scan answers to this id" is then an empty
  // repository, which needs no `undefined` to stand for it.
  const stored = new Map(records.map((record) => [record.id, record]));
  const retrieved: string[] = [];
  const completed: { id: ShelfScanId; books: readonly DetectedBook[] }[] = [];
  const failed: ShelfScanId[] = [];
  const scanned: ShelfPhoto[] = [];

  const storage: ShelfPhotoStoragePort = {
    store: unusedHere('store'),
    retrieve: async (key: string, mediaType: string) => {
      retrieved.push(key);

      return ShelfPhoto.of(jpegBytes, mediaType);
    },
  };
  const repository: ShelfScanRepositoryPort = {
    createPending: unusedHere('createPending'),
    get: async (id: ShelfScanId) => stored.get(id),
    markCompleted: async (id: ShelfScanId, books: readonly DetectedBook[]) => {
      completed.push({ id, books });
    },
    markFailed: async (id: ShelfScanId) => {
      failed.push(id);
    },
  };
  const scanner: ShelfScannerPort = {
    scan: async (photo: ShelfPhoto) => {
      scanned.push(photo);
      if (answer instanceof ShelfScanFailed) {
        throw answer;
      }

      return answer;
    },
  };

  return {
    retrieved,
    completed,
    failed,
    scanned,
    useCase: new ScanStoredShelfPhotoUseCase(storage, repository, scanner),
  };
}

describe('ScanStoredShelfPhotoUseCase', () => {
  it('reads the stored photo back and answers with the books found', async () => {
    const { useCase, retrieved } = useCaseWith([camus, anonymous]);

    const result = await useCase.execute({ id: storedId });

    expect(retrieved).toStrictEqual([`default/shelf_photo/${storedId}`]);
    expect(result.books).toStrictEqual([
      { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
      { author: undefined, title: 'Les Choses', confidence: 0.71 },
    ]);
  });

  it('marks the scan completed with the very books it answered', async () => {
    const { useCase, completed, failed } = useCaseWith([camus]);

    await useCase.execute({ id: storedId });

    expect(completed).toStrictEqual([{ id: storedId, books: [camus] }]);
    expect(failed).toStrictEqual([]);
  });

  // A shelf that held nothing readable is a completed scan with no book, never a failure
  // (spec.md, US1 scenario 3).
  it('treats a shelf with no readable book as a result, not a failure', async () => {
    const { useCase, completed } = useCaseWith([]);

    const result = await useCase.execute({ id: storedId });

    expect(result.books).toStrictEqual([]);
    expect(completed).toStrictEqual([{ id: storedId, books: [] }]);
  });
});

describe('ScanStoredShelfPhotoUseCase, when the provider fails (US2, US3)', () => {
  it('lets the failure through, for the controller to map to 502', async () => {
    const { useCase } = useCaseWith(new ShelfScanFailed('provider unavailable'));

    await expect(useCase.execute({ id: storedId })).rejects.toBeInstanceOf(ShelfScanFailed);
  });

  // FR-011: the photo stays, and the record says what became of it. A failed scan is worth
  // keeping — it is what a later retry would start from (US3 scenario 2).
  it('records the failure against the photo, and no books', async () => {
    const { useCase, failed, completed } = useCaseWith(new ShelfScanFailed('provider down'));

    await expect(useCase.execute({ id: storedId })).rejects.toBeInstanceOf(ShelfScanFailed);

    expect(failed).toStrictEqual([storedId]);
    expect(completed).toStrictEqual([]);
  });
});

describe('ScanStoredShelfPhotoUseCase, a scan it will not run', () => {
  it('refuses an id no submission answers to (404)', async () => {
    const { useCase, scanned } = useCaseWith([camus], []);

    await expect(useCase.execute({ id: storedId })).rejects.toBeInstanceOf(ShelfScanNotFound);
    expect(scanned).toStrictEqual([]);
  });

  // The guard behind the 409: never pay twice for a VLM call that already answered, and
  // never overwrite the answer it gave (research.md §7).
  it('refuses a scan that already answered, without calling the provider again', async () => {
    const completedRecord = {
      ...pendingRecord,
      status: 'completed',
      detectedBooks: [camus],
    } satisfies ShelfScanRecord;
    const { useCase, scanned } = useCaseWith([camus], [completedRecord]);

    await expect(useCase.execute({ id: storedId })).rejects.toBeInstanceOf(
      ShelfScanAlreadyProcessed,
    );
    expect(scanned).toStrictEqual([]);
  });

  it('refuses a scan that already failed, just the same', async () => {
    const failedRecord = {
      ...pendingRecord,
      status: 'failed',
      detectedBooks: undefined,
    } satisfies ShelfScanRecord;
    const { useCase, scanned } = useCaseWith([camus], [failedRecord]);

    await expect(useCase.execute({ id: storedId })).rejects.toBeInstanceOf(
      ShelfScanAlreadyProcessed,
    );
    expect(scanned).toStrictEqual([]);
  });
});
