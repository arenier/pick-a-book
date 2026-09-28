import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dumpDatabase, verifyDump } from './pg-dump.js';
import { snapshotsToPrune } from './retention.js';
import type { SnapshotBucket } from './snapshot-bucket.js';
import { snapshotName } from './snapshot-name.js';

export interface BackupOutcome {
  readonly snapshot: string;
  readonly tables: number;
  readonly pruned: readonly string[];
}

/**
 * Dump, prove, upload — and only then prune. Each step runs only if the previous one
 * succeeded, so a failing run leaves the bucket as it found it: a job failing week after week
 * never eats the good snapshots, it only lets the freshness alert fire (ADR 0006).
 */
export async function backUpDatabase(options: {
  readonly databaseUrl: string;
  readonly snapshots: SnapshotBucket;
  readonly generations: number;
  readonly takenAt: Date;
}): Promise<BackupOutcome> {
  const workDir = await mkdtemp(join(tmpdir(), 'db-backup-'));
  try {
    const file = join(workDir, 'snapshot.dump');
    await dumpDatabase(options.databaseUrl, file);
    const { tables } = await verifyDump(file);

    const snapshot = snapshotName(options.takenAt);
    await options.snapshots.upload(file, snapshot);

    const pruned = snapshotsToPrune(await options.snapshots.list(), options.generations);
    await Promise.all(pruned.map(async (name) => options.snapshots.delete(name)));

    return { snapshot, tables, pruned };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
