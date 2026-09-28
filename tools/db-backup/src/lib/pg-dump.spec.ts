import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DumpFailed, dumpDatabase, verifyDump } from './pg-dump.js';
import {
  aFreshDatabase,
  psql,
  rejectionOf,
  restoreDump,
  seedBooks,
  unreachableDatabaseUrl,
} from './test-services.js';

/**
 * Against the real pg_dump and Postgres (CLAUDE.md: adapters are tested against the real
 * technology). pg_dump must be of the server's major or newer — 18 here, like prod.
 */
function aWorkDir() {
  const dir = { path: '' };

  beforeAll(async () => {
    dir.path = await mkdtemp(join(tmpdir(), 'db-backup-spec-'));
  });

  afterAll(async () => {
    await rm(dir.path, { recursive: true, force: true });
  });

  return { aFile: () => join(dir.path, `${crypto.randomUUID()}.dump`) };
}

describe('dumpDatabase, a reachable database', () => {
  const { aFile } = aWorkDir();

  it('writes an archive that pg_restore reads back, table by table', async () => {
    const database = await aFreshDatabase();
    const file = aFile();
    try {
      await seedBooks(database.url);
      await dumpDatabase(database.url, file);
    } finally {
      await database.drop();
    }

    await expect(verifyDump(file)).resolves.toStrictEqual({ tables: 2 });
  });

  // The whole point of a backup: the rows come back, into a database that never had them.
  it('round-trips the data through a restore into an empty database', async () => {
    const [source, target] = await Promise.all([aFreshDatabase(), aFreshDatabase()]);
    const file = aFile();
    try {
      await seedBooks(source.url);
      await dumpDatabase(source.url, file);
      await restoreDump(file, target.url);

      await expect(
        psql(target.url, "SELECT string_agg(title, ' | ' ORDER BY id) FROM books"),
      ).resolves.toBe("Les Années | La Vie mode d'emploi");
    } finally {
      await Promise.all([source.drop(), target.drop()]);
    }
  });
});

describe('dumpDatabase, an unreachable database', () => {
  const { aFile } = aWorkDir();

  it('fails with DumpFailed', async () => {
    await expect(dumpDatabase(unreachableDatabaseUrl, aFile())).rejects.toBeInstanceOf(DumpFailed);
  });

  // The error ends up in Cloud Logging: the password of the URL must not ride along.
  it('never carries the database password in its error', async () => {
    const error = await rejectionOf(dumpDatabase(unreachableDatabaseUrl, aFile()));

    expect(error.message).toMatch(/^pg_dump failed: /u);
    expect(error.message).not.toContain('hunter2');
  });
});

describe('verifyDump', () => {
  const { aFile } = aWorkDir();

  it('refuses a file that is not a pg_dump archive', async () => {
    const file = aFile();
    await writeFile(file, 'not an archive');

    await expect(verifyDump(file)).rejects.toThrow(/pg_restore cannot read the dump/u);
  });

  it('refuses an empty file', async () => {
    const file = aFile();
    await writeFile(file, '');

    await expect(verifyDump(file)).rejects.toThrow(/the dump is empty/u);
  });

  // A dump of the wrong database — or of one whose schema never got migrated — reads fine
  // and holds nothing. Counting it as a backup is the silent failure ADR 0006 warns about.
  it('refuses an archive that holds no table', async () => {
    const database = await aFreshDatabase();
    const file = aFile();
    try {
      await dumpDatabase(database.url, file);
    } finally {
      await database.drop();
    }

    await expect(verifyDump(file)).rejects.toThrow(/no table/u);
  });
});
