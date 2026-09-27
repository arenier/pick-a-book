import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { backUpDatabase } from './back-up-database.js';
import { verifyDump } from './pg-dump.js';
import { SnapshotBucket } from './snapshot-bucket.js';
import { aFreshDatabase, seedBooks, storage, unreachableDatabaseUrl } from './test-services.js';

const takenAt = new Date('2026-09-28T03:17:05Z');

const olderSnapshots = [
  'postgres/20260907T031705Z.dump',
  'postgres/20260914T031705Z.dump',
  'postgres/20260921T031705Z.dump',
];

/**
 * A bucket already holding three weekly snapshots, as it would after a few weeks, and a
 * database with two tables to back up.
 */
function aBucketWithThreeSnapshotsAndADatabase() {
  const bucket = storage.bucket(`backups-${crypto.randomUUID()}`);
  const database = { url: '', drop: async () => {} };

  beforeAll(async () => {
    await bucket.create();
    await Promise.all(
      olderSnapshots.map(async (name) => bucket.file(name).save('older', { resumable: false })),
    );
    Object.assign(database, await aFreshDatabase());
    await seedBooks(database.url);
  });

  afterAll(async () => {
    await database.drop();
  });

  return { bucket, snapshots: new SnapshotBucket(bucket), database };
}

describe('backUpDatabase, a successful run', () => {
  const { bucket, snapshots, database } = aBucketWithThreeSnapshotsAndADatabase();

  it('stores the snapshot, then keeps only the N most recent', async () => {
    const outcome = await backUpDatabase({
      databaseUrl: database.url,
      snapshots,
      generations: 2,
      takenAt,
    });

    expect(outcome).toStrictEqual({
      snapshot: 'postgres/20260928T031705Z.dump',
      tables: 2,
      pruned: ['postgres/20260914T031705Z.dump', 'postgres/20260907T031705Z.dump'],
    });
    await expect(snapshots.list()).resolves.toStrictEqual([
      'postgres/20260921T031705Z.dump',
      'postgres/20260928T031705Z.dump',
    ]);
  });

  // What was uploaded is the archive itself, not merely a file of the right name.
  it('uploads an archive that pg_restore reads', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'db-backup-spec-'));
    try {
      const local = join(workDir, 'downloaded.dump');
      await bucket.file('postgres/20260928T031705Z.dump').download({ destination: local });

      await expect(verifyDump(local)).resolves.toStrictEqual({ tables: 2 });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

// A failed run must leave the bucket exactly as it found it: no half snapshot, and above all
// no pruning — otherwise a job failing week after week would eat the good snapshots.
describe('backUpDatabase, a failed run', () => {
  const { snapshots } = aBucketWithThreeSnapshotsAndADatabase();

  it('uploads nothing and prunes nothing when the dump fails', async () => {
    await expect(
      backUpDatabase({ databaseUrl: unreachableDatabaseUrl, snapshots, generations: 1, takenAt }),
    ).rejects.toThrow(/pg_dump failed/u);

    await expect(snapshots.list()).resolves.toStrictEqual(olderSnapshots);
  });

  it('uploads nothing and prunes nothing when the dump holds no table', async () => {
    const empty = await aFreshDatabase();
    try {
      await expect(
        backUpDatabase({ databaseUrl: empty.url, snapshots, generations: 1, takenAt }),
      ).rejects.toThrow(/no table/u);
    } finally {
      await empty.drop();
    }

    await expect(snapshots.list()).resolves.toStrictEqual(olderSnapshots);
  });
});
