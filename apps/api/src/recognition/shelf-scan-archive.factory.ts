import type {
  ShelfPhotoStoragePort,
  ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import {
  DrizzleShelfScanRepositoryAdapter,
  GcsShelfPhotoStorageAdapter,
} from '@pick-a-book/recognition-infrastructure';

import type { Environment } from '../config/environment';

/**
 * The two places a submitted photo ends up: the bucket for the bytes, Postgres for what is
 * known about them (ADR 0004, ADR 0006).
 *
 * Returned as ports, never as the adapters behind them: the use cases are handed this and
 * cannot tell whether they are talking to GCS or to the emulator of the compose stack.
 */
export interface ShelfScanArchive {
  readonly storage: ShelfPhotoStoragePort;
  readonly repository: ShelfScanRepositoryPort;
}

/**
 * Turns the validated configuration into the archive the recognition use cases write to.
 *
 * Lives in the composition root, the only place allowed to know
 * `recognition-infrastructure` (ADR 0002) — same arrangement as `createShelfScanner`.
 */
export function createShelfScanArchive(environment: Environment): ShelfScanArchive {
  return {
    storage: new GcsShelfPhotoStorageAdapter({
      bucketName: environment.bucketName,
      emulatorHost: environment.bucketEmulatorHost,
    }),
    repository: DrizzleShelfScanRepositoryAdapter.connect(environment.databaseUrl),
  };
}
