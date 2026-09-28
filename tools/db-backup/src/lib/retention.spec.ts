import { describe, expect, it } from 'vitest';

import { snapshotsToPrune } from './retention.js';

describe('snapshotsToPrune', () => {
  it('keeps the N most recent snapshots and prunes the older ones', () => {
    const snapshots = [
      'postgres/20260907T031700Z.dump',
      'postgres/20260914T031700Z.dump',
      'postgres/20260921T031700Z.dump',
      'postgres/20260928T031700Z.dump',
    ];

    expect(snapshotsToPrune(snapshots, 2)).toStrictEqual([
      'postgres/20260914T031700Z.dump',
      'postgres/20260907T031700Z.dump',
    ]);
  });

  // The bucket lists in whatever order it likes: recency comes from the name, not the order.
  it('does not depend on the order the bucket lists them in', () => {
    const snapshots = [
      'postgres/20260921T031700Z.dump',
      'postgres/20260907T031700Z.dump',
      'postgres/20260928T031700Z.dump',
    ];

    expect(snapshotsToPrune(snapshots, 2)).toStrictEqual(['postgres/20260907T031700Z.dump']);
  });

  it('prunes nothing while there are no more than N snapshots', () => {
    const snapshots = ['postgres/20260921T031700Z.dump', 'postgres/20260928T031700Z.dump'];

    expect(snapshotsToPrune(snapshots, 8)).toStrictEqual([]);
  });

  // Anything else in the bucket — a manual copy, a restore test — is not ours to delete.
  it('never selects an object that is not a snapshot', () => {
    const objects = [
      'postgres/20260921T031700Z.dump',
      'postgres/20260928T031700Z.dump',
      'postgres/manual-before-migration.dump',
      'notes.txt',
    ];

    expect(snapshotsToPrune(objects, 1)).toStrictEqual(['postgres/20260921T031700Z.dump']);
  });
});
