import type { ShelfScanId } from './shelf-scan-id.js';

/** No scan record carries this id — a 404 over HTTP. */
export class ShelfScanNotFound extends Error {
  constructor(id: ShelfScanId) {
    super(`Shelf scan not found: ${id.value}`);
    this.name = 'ShelfScanNotFound';
  }
}
