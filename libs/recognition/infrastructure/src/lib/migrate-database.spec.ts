import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_FOLDER, testDatabaseUrl } from './drizzle/test-database.js';
import { migrateDatabase } from './migrate-database.js';

/** Runs against the Postgres of docker-compose (CLAUDE.md: adapters meet the real technology). */
describe('migrateDatabase', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  afterAll(async () => {
    await pool.end();
  });

  it('creates the uploads and shelf_scans tables', async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);

    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name in ('uploads', 'shelf_scans')
       order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toStrictEqual(['shelf_scans', 'uploads']);
  });

  // Every boot runs it: a second run must be a no-op, not a failure.
  it('can run again on an up-to-date database', async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);

    await expect(migrateDatabase(pool, MIGRATIONS_FOLDER)).resolves.toBeUndefined();
  });

  // Several instances may boot at once: they queue on the lock instead of racing.
  it('lets concurrent runs through one at a time', async () => {
    await expect(
      Promise.all([
        migrateDatabase(pool, MIGRATIONS_FOLDER),
        migrateDatabase(pool, MIGRATIONS_FOLDER),
      ]),
    ).resolves.toStrictEqual([undefined, undefined]);
  });
});
