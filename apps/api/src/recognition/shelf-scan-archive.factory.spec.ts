import type {
  ShelfPhotoStoragePort,
  ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import {
  DrizzleShelfScanRepositoryAdapter,
  GcsShelfPhotoStorageAdapter,
} from '@pick-a-book/recognition-infrastructure';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';

import { createShelfScanArchive, type ShelfScanArchive } from './shelf-scan-archive.factory';

const configuration = {
  databaseUrl: 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book',
  bucketName: 'pick-a-book-photos',
  bucketEmulatorHost: undefined,
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

  // The use cases are handed ports: nothing past the composition root may reach for the
  // adapter behind one, nor for the bucket client it wraps.
  it('hands out ports, never the adapters or the clients behind them', () => {
    archive = createShelfScanArchive(configuration);

    expectTypeOf(archive.storage).toEqualTypeOf<ShelfPhotoStoragePort>();
    expectTypeOf(archive.repository).toEqualTypeOf<ShelfScanRepositoryPort>();
    expect(Object.keys(archive)).toStrictEqual(['storage', 'repository', 'migrate', 'close']);
  });
});
