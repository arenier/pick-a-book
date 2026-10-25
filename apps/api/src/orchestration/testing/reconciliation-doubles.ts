import { join } from 'node:path';

import { InMemoryShelfScanRepository } from '@pick-a-book/recognition-application/testing';
import type { Pool } from 'pg';

import { loadEnvironment } from '../../config/environment';
import { DATABASE_POOL, migrateContexts } from '../../database/database.module';
import { anInMemoryPhotoStorage } from '../../recognition/testing/in-memory-photo-storage';

export const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book';

const LIBS = join(__dirname, '../../../../../libs');

/** The SQL in the sources: nothing is built for these specs. */
const SOURCE_MIGRATIONS = {
  recognition: join(LIBS, 'recognition/infrastructure/src/lib/persistence/drizzle/migrations'),
  bibliography: join(LIBS, 'bibliography/infrastructure/src/lib/drizzle/migrations'),
};

/** The configuration of the specs: real Postgres, dummy bucket, the stub scanner. */
export function reconciliationEnvironment(catalogProvider: string, dailyScanLimit: string) {
  return loadEnvironment({
    DATABASE_URL,
    BUCKET_NAME: 'pick-a-book-photos',
    NODE_ENV: 'test',
    BIBLIOGRAPHIC_CATALOG_PROVIDER: catalogProvider,
    DAILY_SCAN_LIMIT: dailyScanLimit,
  });
}

/**
 * What replaces the pool of `DatabaseModule`: the pool of the spec, migrated from the SQL in the
 * sources as production migrates at boot.
 */
export function migratedPool(pool: Pool) {
  return {
    token: DATABASE_POOL,
    factory: async () => {
      await migrateContexts(pool, undefined, SOURCE_MIGRATIONS);
      return pool;
    },
  };
}

/** The archive of `recognition` in memory: the bucket is not what these specs are about. */
export function inMemoryArchive(scans: InMemoryShelfScanRepository) {
  return {
    token: 'ShelfScanArchive',
    value: { storage: anInMemoryPhotoStorage(), repository: scans },
  };
}

export { InMemoryShelfScanRepository };
