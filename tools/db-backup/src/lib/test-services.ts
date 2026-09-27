/**
 * Where the specs meet the real technologies (CLAUDE.md): the Postgres and the GCS emulator
 * of docker-compose, which CI starts on the same ports.
 *
 * Deliberately NOT DATABASE_URL: that variable may well hold a real database in the shell
 * running the specs, and these specs create and drop databases.
 */
import { Storage } from '@google-cloud/storage';

import { runTool } from './run-tool.js';

const adminUrl =
  process.env['DB_BACKUP_TEST_DATABASE_URL'] ??
  'postgresql://pick_a_book:pick_a_book@localhost:5433/pick_a_book';

export const emulatorHost = process.env['BUCKET_EMULATOR_HOST'] ?? 'http://localhost:4443';

export const storage = new Storage({ apiEndpoint: emulatorHost, projectId: 'pick-a-book-test' });

export async function psql(databaseUrl: string, sql: string): Promise<string> {
  const stdout = await runTool('psql', [
    '--no-psqlrc',
    '--quiet',
    '--tuples-only',
    '--no-align',
    '--set=ON_ERROR_STOP=1',
    `--dbname=${databaseUrl}`,
    `--command=${sql}`,
  ]);

  return stdout.trim();
}

/** A database of its own for one spec, dropped by the returned function. */
export async function aFreshDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `db_backup_spec_${crypto.randomUUID().replaceAll('-', '')}`;
  await psql(adminUrl, `CREATE DATABASE ${name}`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;

  return {
    url: url.toString(),
    drop: async () => {
      await psql(adminUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    },
  };
}

/** Two tables and a few rows: enough for a dump to have something to prove. */
export async function seedBooks(databaseUrl: string): Promise<void> {
  await psql(
    databaseUrl,
    `CREATE TABLE authors (id int PRIMARY KEY, name text NOT NULL);
     CREATE TABLE books (id int PRIMARY KEY, author_id int REFERENCES authors, title text NOT NULL);
     INSERT INTO authors VALUES (1, 'Annie Ernaux'), (2, 'Georges Perec');
     INSERT INTO books VALUES (1, 1, 'Les Années'), (2, 2, 'La Vie mode d''emploi');`,
  );
}

/**
 * The restore of the runbook (infra/README.md), minus the flags that only matter against Neon:
 * what proves a snapshot is a backup, not merely a readable file.
 */
export async function restoreDump(file: string, databaseUrl: string): Promise<void> {
  await runTool('pg_restore', [
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    `--dbname=${databaseUrl}`,
    file,
  ]);
}

/** A URL nobody listens on, with a password that must never surface in an error. */
export const unreachableDatabaseUrl = 'postgresql://owner:hunter2@127.0.0.1:1/nowhere';

/** What a promise rejected with — to assert on an error's message with plain matchers. */
export async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error('rejected with something that is not an Error', { cause: error });
  }
  throw new Error('expected a rejection, the promise resolved');
}
