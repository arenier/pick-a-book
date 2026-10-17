/**
 * The cursor of a page of the history is not one this API made: it travels in a query string
 * anyone can edit — a 400 over HTTP (specs/002-upload-history, research.md §4). It names no
 * detail: what was wrong with it is not the caller's to learn.
 */
export class InvalidShelfScanCursor extends Error {
  readonly kind = 'invalid-shelf-scan-cursor';

  constructor() {
    super('Invalid cursor');
    this.name = 'InvalidShelfScanCursor';
  }
}
