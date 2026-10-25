import { join } from 'node:path';

import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { migrateDatabase } from '@pick-a-book/shared-sql-migrations';
import { Pool } from 'pg';

import type { Environment } from '../config/environment';

/** Injection token of the one Postgres pool of the API, shared by every context. */
export const DATABASE_POOL = 'DatabasePool';

/**
 * Where the build copies the committed migrations of each context: next to the bundle
 * (`vite.config.mts`), so the image that runs the code also carries the schema it expects.
 */
const MIGRATIONS_ROOT = join(__dirname, 'migrations');

/** The signature of `migrateDatabase`, so that a spec can stand in for it. */
type Migrate = typeof migrateDatabase;

/**
 * Applies the migrations of every context, one after the other, each in its own folder and its
 * own tracking table (specs/003-bibliographic-reconciliation, research §8). The tables of
 * `recognition` keep `__drizzle_migrations`: renaming it would replay what is already applied.
 */
export async function migrateContexts(pool: Pool, migrate: Migrate = migrateDatabase) {
  await migrate(pool, optionsOf('recognition', '__drizzle_migrations'));
  await migrate(pool, optionsOf('bibliography', '__drizzle_migrations_bibliography'));
}

function optionsOf(folder: string, table: string) {
  return { migrationsFolder: join(MIGRATIONS_ROOT, folder), migrationsTable: table };
}

/**
 * The one Postgres pool of the API (ADR 0006). It is opened and migrated here, once, before
 * anything is served: a revision never answers a request against a schema it does not know.
 * Every context receives the pool; none opens or closes its own.
 */
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pick<Pool, 'end'>) {}

  /** Releases the pool when Cloud Run stops the instance (`enableShutdownHooks`). */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }

  static withEnvironment(environment: Pick<Environment, 'databaseUrl'>) {
    return {
      module: DatabaseModule,
      // Imported once, by the root: every context injects `DATABASE_POOL` without importing it.
      global: true,
      providers: [
        {
          provide: DATABASE_POOL,
          useFactory: async () => {
            const pool = new Pool({ connectionString: environment.databaseUrl });
            await migrateContexts(pool);
            return pool;
          },
        },
      ],
      exports: [DATABASE_POOL],
    };
  }
}
