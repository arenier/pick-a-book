/** Every snapshot lives under this prefix; nothing else in the bucket is the job's. */
const PREFIX = 'postgres/';

const SNAPSHOT_NAME = /^postgres\/\d{8}T\d{6}Z\.dump$/u;

/**
 * `postgres/20260928T031705Z.dump`: a compact UTC instant, so that sorting names sorts
 * snapshots by age — pruning relies on it — with no colon in an object name.
 */
export function snapshotName(takenAt: Date): string {
  const compact = takenAt
    .toISOString()
    .replace(/\.\d{3}Z$/u, 'Z')
    .replaceAll(/[-:]/gu, '');

  return `${PREFIX}${compact}.dump`;
}

export function isSnapshotName(name: string): boolean {
  return SNAPSHOT_NAME.test(name);
}

export const SNAPSHOT_PREFIX = PREFIX;
