import { InMemoryShelfScanRepository } from '@pick-a-book/recognition-application/testing';

import { DATABASE_POOL } from '../../database/database.module';
import { anInMemoryPhotoStorage } from '../../recognition/testing/in-memory-photo-storage';

/**
 * What a spec of the assembled application overrides so that neither Postgres nor the bucket is
 * touched: the pool is a stub that nothing migrates, the archive is made of the in-memory
 * doubles. Excluded from the app build (`tsconfig.app.json`).
 */
export const withoutPersistence = {
  pool: {
    provide: DATABASE_POOL,
    value: {
      end: async (): Promise<void> => {
        // Nothing to release, and nothing migrated: there is no database.
      },
    },
  },
  archive: {
    provide: 'ShelfScanArchive',
    value: {
      storage: anInMemoryPhotoStorage(),
      repository: new InMemoryShelfScanRepository(),
    },
  },
} as const;
