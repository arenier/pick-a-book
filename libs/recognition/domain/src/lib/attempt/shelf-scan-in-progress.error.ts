import type { ShelfScanId } from '../scan/shelf-scan-id.js';

/**
 * An analysis of this scan is already running: a second one would pay for a VLM call whose
 * result only one of the two can keep (specs/002-upload-history, research.md §8) — a 409 over
 * HTTP. Expires with the lease of the attempt, so a scan whose instance died is not stuck.
 */
export class ShelfScanInProgress extends Error {
  readonly kind = 'shelf-scan-in-progress';

  constructor(id: ShelfScanId) {
    super(`Shelf scan already in progress: ${id.value}`);
    this.name = 'ShelfScanInProgress';
  }
}
