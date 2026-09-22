import { describe, expect, it } from 'vitest';

import { Author } from './author.js';
import { BookTitle } from './book-title.js';
import { Confidence } from './confidence.js';
import { DetectedBook } from './detected-book.js';
import {
  SHELF_SCAN_REPOSITORY_PORT,
  type NewShelfScan,
  type ShelfScanId,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
} from './shelf-scan-repository.port.js';

/**
 * Same intent as the storage port spec: an implementation proves the shape is usable, where
 * restating the type would prove nothing.
 *
 * It also pins the one rule the interface cannot express — `pending` is left exactly once,
 * towards `completed` or `failed` (specs/001-photo-upload/data-model.md#ShelfScanRecord).
 * Every adapter owes that rule; this is where it is written down.
 */
function inMemoryRepository(): ShelfScanRepositoryPort {
  const records = new Map<ShelfScanId, ShelfScanRecord>();

  const leavePending = (id: ShelfScanId): ShelfScanRecord => {
    const record = records.get(id);
    if (record === undefined || record.status !== 'pending') {
      throw new Error(`No pending scan ${id}`);
    }

    return record;
  };

  return {
    createPending: async (scan: NewShelfScan) => {
      records.set(scan.id, {
        ...scan,
        status: 'pending',
        detectedBooks: undefined,
        createdAt: new Date(),
      });
    },
    get: async (id: ShelfScanId) => records.get(id),
    markCompleted: async (id: ShelfScanId, books: readonly DetectedBook[]) => {
      records.set(id, { ...leavePending(id), status: 'completed', detectedBooks: [...books] });
    },
    markFailed: async (id: ShelfScanId) => {
      records.set(id, { ...leavePending(id), status: 'failed', detectedBooks: undefined });
    },
  };
}

const newScan = {
  id: '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
  ownerId: 'default',
  photoBucketKey: 'default/shelf_photo/1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b',
  photoMediaType: 'image/jpeg',
  photoSizeBytes: 4,
  originalFilename: 'IMG_0001.jpg',
} satisfies NewShelfScan;

const book = DetectedBook.of(
  Author.of('Albert Camus'),
  BookTitle.of('La Peste'),
  Confidence.of(0.92),
);

describe('ShelfScanRepositoryPort, a submission before its analysis', () => {
  it('creates a record the photo can be found by, pending and without books', async () => {
    const repository = inMemoryRepository();

    await repository.createPending(newScan);
    const record = await repository.get(newScan.id);

    expect(record?.status).toBe('pending');
    expect(record?.detectedBooks).toBeUndefined();
    expect(record?.photoBucketKey).toBe(newScan.photoBucketKey);
    expect(record?.photoSizeBytes).toBe(4);
    expect(record?.originalFilename).toBe('IMG_0001.jpg');
  });

  it('reports an unknown id as absent rather than failing', async () => {
    const repository = inMemoryRepository();

    await expect(repository.get('no-such-id')).resolves.toBeUndefined();
  });

  it('names a token the composition root binds the port with', () => {
    expect(SHELF_SCAN_REPOSITORY_PORT).toBe('ShelfScanRepositoryPort');
  });
});

describe('ShelfScanRepositoryPort, once the analysis answered', () => {
  // An empty list is a result, not an absence: "no book on this shelf" is `completed` with
  // zero books, never `failed` (spec.md, US1 scenario 3).
  it('completes a scan with the books read', async () => {
    const repository = inMemoryRepository();
    await repository.createPending(newScan);

    await repository.markCompleted(newScan.id, [book]);
    const record = await repository.get(newScan.id);

    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual([book]);
  });

  it('fails a scan without books', async () => {
    const repository = inMemoryRepository();
    await repository.createPending(newScan);

    await repository.markFailed(newScan.id);
    const record = await repository.get(newScan.id);

    expect(record?.status).toBe('failed');
    expect(record?.detectedBooks).toBeUndefined();
  });

  // The guard behind the 409: a second call must not overwrite a result already posted, nor
  // pay for a VLM call that already answered (research.md §7).
  it('leaves pending exactly once', async () => {
    const repository = inMemoryRepository();
    await repository.createPending(newScan);
    await repository.markCompleted(newScan.id, []);

    await expect(repository.markCompleted(newScan.id, [book])).rejects.toThrow(/No pending scan/u);
    await expect(repository.markFailed(newScan.id)).rejects.toThrow(/No pending scan/u);
  });
});
