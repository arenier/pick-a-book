import {
  DrizzleShelfScanRepositoryAdapter,
  GcsShelfPhotoStorageAdapter,
} from '@pick-a-book/recognition-infrastructure';
import { describe, expect, it } from 'vitest';

import type { Environment } from '../config/environment';
import { createShelfScanArchive } from './shelf-scan-archive.factory';

const environment = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl: 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book',
  bucketName: 'pick-a-book-photos',
  ownerId: 'default',
  bucketEmulatorHost: 'http://localhost:4443',
  webOrigin: 'http://localhost:4200',
  shelfScanner: { provider: 'stub' },
} satisfies Environment;

describe('createShelfScanArchive', () => {
  // Same guard as `createShelfScanner`: the binding is what the composition root is for, and
  // a factory that quietly returned the wrong adapter would only show up at runtime.
  it('binds the bucket adapter', () => {
    expect(createShelfScanArchive(environment).storage).toBeInstanceOf(GcsShelfPhotoStorageAdapter);
  });

  it('binds the database adapter', () => {
    expect(createShelfScanArchive(environment).repository).toBeInstanceOf(
      DrizzleShelfScanRepositoryAdapter,
    );
  });
});
