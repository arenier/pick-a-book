import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runJob } from './run-job.js';
import { aFreshDatabase, emulatorHost, seedBooks, storage } from './test-services.js';

/** Cloud Logging reads one JSON object per line, `severity` included. */
function aLog() {
  const entries: unknown[] = [];

  return {
    entries,
    write: (line: string) => {
      const entry: unknown = JSON.parse(line);
      entries.push(entry);
    },
  };
}

const takenAt = new Date('2026-09-28T03:17:05Z');

function aBucketAndADatabase() {
  const bucket = storage.bucket(`backups-${crypto.randomUUID()}`);
  const database = { url: '', drop: async () => {} };

  beforeAll(async () => {
    await bucket.create();
    Object.assign(database, await aFreshDatabase());
    await seedBooks(database.url);
  });

  afterAll(async () => {
    await database.drop();
  });

  return { bucket, database };
}

describe('runJob, a successful run', () => {
  const { bucket, database } = aBucketAndADatabase();

  it('exits 0 and logs the snapshot it took', async () => {
    const log = aLog();
    const environment = {
      DATABASE_URL: database.url,
      BACKUP_BUCKET: bucket.name,
      BACKUP_GENERATIONS: '8',
      BUCKET_EMULATOR_HOST: emulatorHost,
    };

    const exitCode = await runJob(environment, takenAt, log.write);

    expect(exitCode).toBe(0);
    expect(log.entries).toStrictEqual([
      {
        severity: 'INFO',
        message: 'backup completed',
        snapshot: 'postgres/20260928T031705Z.dump',
        tables: 2,
        pruned: [],
      },
    ]);
  });
});

// A non-zero exit fails the Cloud Run execution: that is what the freshness alert counts.
describe('runJob, a failed run', () => {
  const { bucket } = aBucketAndADatabase();

  it('exits 1 and logs the reason when the configuration is invalid', async () => {
    const log = aLog();

    const exitCode = await runJob({}, takenAt, log.write);

    expect(exitCode).toBe(1);
    expect(JSON.stringify(log.entries)).toMatch(
      /^\[\{"severity":"ERROR","message":"Invalid configuration, backup aborted:.*DATABASE_URL is required/u,
    );
  });

  it('exits 1 and logs the reason, without the password, when the backup fails', async () => {
    const log = aLog();
    const environment = {
      DATABASE_URL: 'postgresql://owner:hunter2@127.0.0.1:1/nowhere',
      BACKUP_BUCKET: bucket.name,
      BACKUP_GENERATIONS: '8',
      BUCKET_EMULATOR_HOST: emulatorHost,
    };

    const exitCode = await runJob(environment, takenAt, log.write);

    expect(exitCode).toBe(1);
    expect(JSON.stringify(log.entries)).toMatch(
      /^\[\{"severity":"ERROR","message":"backup failed: pg_dump failed: /u,
    );
    expect(JSON.stringify(log.entries)).not.toContain('hunter2');
  });
});
