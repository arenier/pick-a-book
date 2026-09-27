import { defineConfig } from 'drizzle-kit';

// Migrations are generated from the schema, never written by hand:
//   yarn db:generate
// They are applied by the API at boot (apps/api, `migrateDatabase`), so the committed SQL is
// what runs everywhere — locally, in CI and in production.
export default defineConfig({
  dialect: 'postgresql',
  // Paths are relative to the repository root, where `yarn db:generate` runs.
  schema: './libs/recognition/infrastructure/src/lib/drizzle/schema.ts',
  out: './libs/recognition/infrastructure/src/lib/drizzle/migrations',
});
