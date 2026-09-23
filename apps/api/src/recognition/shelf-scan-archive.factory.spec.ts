import {
  DrizzleShelfScanRepositoryAdapter,
  GcsShelfPhotoStorageAdapter,
} from '@pick-a-book/recognition-infrastructure';
import { afterEach, describe, expect, it } from 'vitest';

import { createShelfScanArchive, type ShelfScanArchive } from './shelf-scan-archive.factory';

const configuration = {
  databaseUrl: 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book',
  bucketName: 'pick-a-book-photos',
  storageEmulatorHost: undefined,
};

describe('createShelfScanArchive', () => {
  let archive: ShelfScanArchive | undefined;

  afterEach(async () => {
    await archive?.close();
  });

  // Nothing is contacted here: the pool connects lazily, on its first query.
  it('binds the bucket and the Postgres adapters', () => {
    archive = createShelfScanArchive(configuration);

    expect(archive.storage).toBeInstanceOf(GcsShelfPhotoStorageAdapter);
    expect(archive.repository).toBeInstanceOf(DrizzleShelfScanRepositoryAdapter);
  });

  it('points the storage client at the emulator when one is configured', () => {
    archive = createShelfScanArchive({
      ...configuration,
      storageEmulatorHost: 'http://localhost:4443',
    });

    expect(archive.bucket.name).toBe('pick-a-book-photos');
    expect(archive.bucket.storage.apiEndpoint).toBe('http://localhost:4443');
  });

  it('talks to the real API when no emulator is configured', () => {
    archive = createShelfScanArchive(configuration);

    expect(archive.bucket.storage.apiEndpoint).toBe('https://storage.googleapis.com');
  });
});
