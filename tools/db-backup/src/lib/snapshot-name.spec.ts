import { describe, expect, it } from 'vitest';

import { isSnapshotName, snapshotName } from './snapshot-name.js';

describe('snapshotName', () => {
  // A compact UTC timestamp: sorting the names sorts the snapshots by age, which is what
  // pruning relies on, and no colon ends up in an object name.
  it('names the snapshot after the UTC instant it was taken', () => {
    expect(snapshotName(new Date('2026-09-28T03:17:05.123Z'))).toBe(
      'postgres/20260928T031705Z.dump',
    );
  });
});

describe('isSnapshotName', () => {
  it('recognises a name this job gives', () => {
    expect(isSnapshotName(snapshotName(new Date()))).toBe(true);
  });

  it.each(['postgres/manual.dump', 'postgres/20260928T031705Z.sql', 'other/20260928T031705Z.dump'])(
    'does not recognise %j',
    (name) => {
      expect(isSnapshotName(name)).toBe(false);
    },
  );
});
