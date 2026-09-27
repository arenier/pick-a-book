import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SnapshotBucket } from './snapshot-bucket.js';
import { storage } from './test-services.js';

/**
 * Against the GCS emulator of docker-compose, like the photo storage adapter: a fresh bucket
 * per `describe`, so no state leaks between runs sharing an emulator.
 */
function aFreshBucket(objects: readonly string[] = []) {
  const bucket = storage.bucket(`backups-${crypto.randomUUID()}`);

  beforeAll(async () => {
    await bucket.create();
    await Promise.all(
      objects.map(async (name) => bucket.file(name).save('x', { resumable: false })),
    );
  });

  return { bucket, snapshots: new SnapshotBucket(bucket) };
}

describe('SnapshotBucket, uploading', () => {
  const { bucket, snapshots } = aFreshBucket();
  const local = { dir: '', file: '' };

  beforeAll(async () => {
    local.dir = await mkdtemp(join(tmpdir(), 'db-backup-spec-'));
    local.file = join(local.dir, 'snapshot.dump');
    await writeFile(local.file, 'PGDMP archive bytes');
  });

  afterAll(async () => {
    await rm(local.dir, { recursive: true, force: true });
  });

  it('stores the file under the given name', async () => {
    await snapshots.upload(local.file, 'postgres/20260928T031705Z.dump');

    const [contents] = await bucket.file('postgres/20260928T031705Z.dump').download();
    expect(contents.toString()).toBe('PGDMP archive bytes');
  });

  // Snapshots are never overwritten: an existing name means a clock or naming bug, and
  // replacing the older snapshot would silently lose it.
  it('refuses to overwrite an existing snapshot', async () => {
    await snapshots.upload(local.file, 'postgres/20260921T031705Z.dump');

    await expect(snapshots.upload(local.file, 'postgres/20260921T031705Z.dump')).rejects.toThrow(
      /precondition/iu,
    );
  });
});

describe('SnapshotBucket, listing and deleting', () => {
  const { bucket, snapshots } = aFreshBucket([
    'postgres/20260914T031705Z.dump',
    'postgres/20260921T031705Z.dump',
    'elsewhere.txt',
  ]);

  it('lists the objects under the snapshot prefix only', async () => {
    await expect(snapshots.list()).resolves.toStrictEqual([
      'postgres/20260914T031705Z.dump',
      'postgres/20260921T031705Z.dump',
    ]);
  });

  it('deletes a snapshot', async () => {
    await snapshots.delete('postgres/20260914T031705Z.dump');

    const [exists] = await bucket.file('postgres/20260914T031705Z.dump').exists();
    expect(exists).toBe(false);
  });
});
