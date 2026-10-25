import type {
  ShelfPhotoStoragePort,
  ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import {
  DrizzleShelfScanRepositoryAdapter,
  GcsShelfPhotoStorageAdapter,
  openShelfPhotoBucket,
} from '@pick-a-book/recognition-infrastructure';
import type { Pool } from 'pg';

import type { Environment } from '../config/environment';

/**
 * Returned as ports, never as the adapters behind them: the use cases are handed this and
 * cannot tell whether they are talking to GCS or to the emulator of the compose stack.
 */
export interface ShelfScanArchive {
  readonly storage: ShelfPhotoStoragePort;
  readonly repository: ShelfScanRepositoryPort;
}

/**
 * Builds what keeps a submitted shelf photo: the bucket for its bytes, Postgres for its
 * record (ADR 0004, ADR 0006). The pool is the API's one, opened and closed by `DatabaseModule`.
 *
 * Lives in the composition root, the only place allowed to know
 * `recognition-infrastructure` (ADR 0002). The clients are built here, from the validated
 * configuration, so the adapters never read the environment themselves.
 */
export function createShelfScanArchive(
  configuration: Pick<Environment, 'bucketName' | 'bucketEmulatorHost'>,
  pool: Pool,
): ShelfScanArchive {
  const bucket = openShelfPhotoBucket({
    bucketName: configuration.bucketName,
    emulatorHost: configuration.bucketEmulatorHost,
  });

  return {
    storage: new GcsShelfPhotoStorageAdapter(bucket),
    repository: new DrizzleShelfScanRepositoryAdapter(pool),
  };
}
