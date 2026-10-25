import { migrateDatabase } from '@pick-a-book/shared-sql-migrations';
import { Pool } from 'pg';
import { afterAll, beforeAll } from 'vitest';

import { DrizzleBookReconciliationRepositoryAdapter } from '../drizzle-book-reconciliation-repository.adapter.js';
import { MIGRATIONS_FOLDER, MIGRATIONS_TABLE, testDatabaseUrl } from '../drizzle/test-database.js';

/**
 * Runs against the Postgres of docker-compose, migrated with the committed migrations — the
 * same SQL the API applies at boot. Every test works on fresh ids, so runs never collide.
 *
 * Called inside each `describe`: registers the migration and the teardown of its own pool.
 */
export function aMigratedRepository() {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  beforeAll(async () => {
    await migrateDatabase(pool, {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsTable: MIGRATIONS_TABLE,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  return { pool, repository: new DrizzleBookReconciliationRepositoryAdapter(pool) };
}
