import { defineConfig } from 'drizzle-kit';

// Migrations are generated from the schema, never written by hand:
//   yarn db:generate
// They are applied by the API at boot (apps/api, `DatabaseModule`), so the committed SQL is
// what runs everywhere — locally, in CI and in production.
export default defineConfig({
  dialect: 'postgresql',
  // Paths are relative to the repository root, where `yarn db:generate` runs.
  schema: './libs/bibliography/infrastructure/src/lib/drizzle/schema.ts',
  out: './libs/bibliography/infrastructure/src/lib/drizzle/migrations',
  // Drizzle orders its migrations by date inside one tracking table: each context keeps its own
  // so that two folders never step on each other (spec 003, research §8).
  migrations: { table: '__drizzle_migrations_bibliography' },
});
