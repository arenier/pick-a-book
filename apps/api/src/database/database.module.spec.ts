import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { DatabaseModule, migrateContexts } from './database.module';

describe('migrateContexts', () => {
  // A real pool, never connected: it only has to be the object the runner receives.
  const pool = new Pool({ connectionString: 'postgresql://user:secret@localhost:5433/db' });

  afterAll(async () => {
    await pool.end();
  });

  // Each context keeps its own folder and its own tracking table (specs/003, research §8), and
  // they run one after the other: recognition first, as it always has.
  it('applies the migrations of recognition, then those of bibliography', async () => {
    const calls: { migrationsFolder: string; migrationsTable: string }[] = [];

    await migrateContexts(pool, async (received, options) => {
      expect(received).toBe(pool);
      calls.push(options);
    });

    expect(calls).toStrictEqual([
      {
        migrationsFolder: join(__dirname, 'migrations', 'recognition'),
        migrationsTable: '__drizzle_migrations',
      },
      {
        migrationsFolder: join(__dirname, 'migrations', 'bibliography'),
        migrationsTable: '__drizzle_migrations_bibliography',
      },
    ]);
  });

  it('waits for the first context before starting the second', async () => {
    const events: string[] = [];

    await migrateContexts(pool, async (_pool, options) => {
      events.push(`start ${options.migrationsTable}`);
      await Promise.resolve();
      events.push(`end ${options.migrationsTable}`);
    });

    expect(events).toStrictEqual([
      'start __drizzle_migrations',
      'end __drizzle_migrations',
      'start __drizzle_migrations_bibliography',
      'end __drizzle_migrations_bibliography',
    ]);
  });
});

describe('migrateContexts, when a context fails', () => {
  const pool = new Pool({ connectionString: 'postgresql://user:secret@localhost:5433/db' });

  afterAll(async () => {
    await pool.end();
  });

  it('does not migrate the second context when the first fails', async () => {
    const tables: string[] = [];

    await expect(
      migrateContexts(pool, async (_pool, options) => {
        tables.push(options.migrationsTable);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(tables).toStrictEqual(['__drizzle_migrations']);
  });
});

describe('DatabaseModule', () => {
  // Cloud Run stops an instance with SIGTERM: the one Postgres pool is released, not dropped.
  it('closes the pool when the application shuts down', async () => {
    let ended = false;
    const pool = {
      end: async () => {
        ended = true;
      },
    };

    await new DatabaseModule(pool).onApplicationShutdown();

    expect(ended).toBe(true);
  });
});
