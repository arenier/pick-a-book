import { isSnapshotName } from './snapshot-name.js';

/**
 * The snapshots to delete so that only the `keep` most recent remain. Only names this job
 * gives are considered: a manual copy left in the bucket is never pruned.
 */
export function snapshotsToPrune(objectNames: readonly string[], keep: number): string[] {
  return objectNames
    .filter((name) => isSnapshotName(name))
    .toSorted()
    .toReversed()
    .slice(keep);
}
