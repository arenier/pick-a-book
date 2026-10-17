/**
 * Test helpers shared by the specs that meet Postgres. Not exported from the lib: nothing
 * outside its own specs has a use for them.
 */

/** The Postgres of docker-compose by default; CI points DATABASE_URL at its own service. */
export const testDatabaseUrl =
  process.env['DATABASE_URL'] ?? 'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book';

export const MIGRATIONS_FOLDER = new URL('migrations', import.meta.url).pathname;
