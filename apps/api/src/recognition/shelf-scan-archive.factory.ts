import {
  DrizzleShelfScanRepositoryAdapter,
  GcsShelfPhotoStorageAdapter,
  migrateDatabase,
  openShelfPhotoBucket,
} from '@pick-a-book/recognition-infrastructure';
import { Pool } from 'pg';

import type { Environment } from '../config/environment';

export interface ShelfScanArchive {
  readonly bucket: ReturnType<typeof openShelfPhotoBucket>;
  readonly storage: GcsShelfPhotoStorageAdapter;
  readonly repository: DrizzleShelfScanRepositoryAdapter;
  /** Applies the committed migrations — run once at boot, before any request. */
  migrate(migrationsFolder: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Builds what keeps a submitted shelf photo: the bucket for its bytes, Postgres for its
 * record (ADR 0004, ADR 0006).
 *
 * Lives in the composition root, the only place allowed to know
 * `recognition-infrastructure` (ADR 0002). The clients are built here, from the validated
 * configuration, so the adapters never read the environment themselves.
 */
export function createShelfScanArchive(
  configuration: Pick<Environment, 'databaseUrl' | 'bucketName' | 'bucketEmulatorHost'>,
): ShelfScanArchive {
  const bucket = openShelfPhotoBucket({
    bucketName: configuration.bucketName,
    emulatorHost: configuration.bucketEmulatorHost,
  });
  const pool = new Pool({ connectionString: configuration.databaseUrl });

  return {
    bucket,
    storage: new GcsShelfPhotoStorageAdapter(bucket),
    repository: new DrizzleShelfScanRepositoryAdapter(pool),
    migrate: async (migrationsFolder) => migrateDatabase(pool, migrationsFolder),
    close: async () => pool.end(),
  };
}
