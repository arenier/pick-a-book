import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateDatabase } from './migrate-database.js';

/** Runs against the Postgres of docker-compose (CLAUDE.md: adapters meet the real technology). */
const databaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book';

/** Writes a migrations folder the way `drizzle-kit generate` lays it out: SQL + journal. */
function writeMigrations(folder: string, entries: readonly { tag: string; sql: string }[]): void {
  mkdirSync(join(folder, 'meta'), { recursive: true });
  const journal = {
    version: '7',
    dialect: 'postgresql',
    entries: entries.map((entry, idx) => ({
      idx,
      version: '7',
      when: 1_790_000_000_000 + idx,
      tag: entry.tag,
      breakpoints: true,
    })),
  };
  writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const entry of entries) {
    writeFileSync(join(folder, `${entry.tag}.sql`), entry.sql);
  }
}

/** Two folders on a fresh database, each with its own tracking table; cleans up after itself. */
function twoContexts() {
  const pool = new Pool({ connectionString: databaseUrl });
  const root = mkdtempSync(join(tmpdir(), 'sql-migrations-'));
  const first = {
    migrationsFolder: join(root, 'first'),
    migrationsTable: '__sql_migrations_first_tracking',
  };
  const second = {
    migrationsFolder: join(root, 'second'),
    migrationsTable: '__sql_migrations_second_tracking',
  };
  const drop = async () => {
    await pool.query('drop table if exists sql_migrations_first, sql_migrations_second');
    await pool.query(
      'drop table if exists drizzle.__sql_migrations_first_tracking, drizzle.__sql_migrations_second_tracking',
    );
  };

  beforeAll(async () => {
    await drop();
    writeMigrations(first.migrationsFolder, [
      { tag: '0000_first', sql: 'CREATE TABLE "sql_migrations_first" ("id" integer);' },
    ]);
    writeMigrations(second.migrationsFolder, [
      { tag: '0000_second', sql: 'CREATE TABLE "sql_migrations_second" ("id" integer);' },
    ]);
  });

  afterAll(async () => {
    await drop();
    await pool.end();
    rmSync(root, { recursive: true, force: true });
  });

  return { pool, first, second };
}

describe('migrateDatabase, two contexts', () => {
  const { pool, first, second } = twoContexts();

  it('applies two folders, each with its own tracking table, one after the other', async () => {
    await migrateDatabase(pool, first);
    await migrateDatabase(pool, second);

    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('sql_migrations_first', 'sql_migrations_second')
       order by table_name`,
    );
    expect(rows.map((row) => row.table_name)).toStrictEqual([
      'sql_migrations_first',
      'sql_migrations_second',
    ]);
  });

  // Every boot runs it: a second run must be a no-op, not a failure.
  it('can run again on an up-to-date database', async () => {
    await expect(migrateDatabase(pool, first)).resolves.toBeUndefined();
  });
});

describe('migrateDatabase, concurrent runs', () => {
  const { pool, second } = twoContexts();

  // Several instances may boot at once: they queue on the lock instead of racing.
  it('lets concurrent runs through one at a time', async () => {
    await expect(
      Promise.all([migrateDatabase(pool, second), migrateDatabase(pool, second)]),
    ).resolves.toStrictEqual([undefined, undefined]);
  });
});
