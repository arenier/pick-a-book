import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration: where the schema is read from and where migrations are written.
 *
 * Both stay inside `infrastructure` (project convention: "SQL, schema and migrations stay in
 * infrastructure"). Generating and applying migrations is a tooling step, run by hand
 * (`yarn db:generate`, `yarn db:migrate`) rather than on boot: an API instance that migrates
 * as it starts would race with the next one Cloud Run brings up (ADR 0004).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/drizzle/schema.ts',
  out: './src/lib/drizzle/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
