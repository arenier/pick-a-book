import type { ShelfScanId } from './shelf-scan-id.js';

/**
 * The scan already has a result. Scanning again would overwrite it, or pay for a VLM call
 * nobody asked for (research.md §7).
 */
export class ShelfScanAlreadyProcessed extends Error {
  constructor(id: ShelfScanId) {
    super(`Shelf scan already processed: ${id.value}`);
    this.name = 'ShelfScanAlreadyProcessed';
  }
}
