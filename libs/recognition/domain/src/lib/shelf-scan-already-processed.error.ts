import type { ShelfScanId } from './shelf-scan-id.js';

/**
 * The scan already has its books — it is `completed`, which is final. Scanning again would
 * overwrite them, or pay for a VLM call nobody asked for (research.md §7). A scan that failed, or
 * never started, is not « processed »: it can be run again (specs/002-upload-history, FR-011).
 */
export class ShelfScanAlreadyProcessed extends Error {
  readonly kind = 'shelf-scan-already-processed';

  constructor(id: ShelfScanId) {
    super(`Shelf scan already processed: ${id.value}`);
    this.name = 'ShelfScanAlreadyProcessed';
  }
}
