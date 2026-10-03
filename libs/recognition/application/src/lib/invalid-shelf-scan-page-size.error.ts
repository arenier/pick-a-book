/**
 * The size of a page of the history is outside 1..50, or not a whole number — a 400 over HTTP
 * (specs/002-upload-history, contracts/shelf-photos-history-api.md §1).
 */
export class InvalidShelfScanPageSize extends Error {
  readonly kind = 'invalid-shelf-scan-page-size';

  constructor() {
    super('Invalid page size: expected a whole number from 1 to 50');
    this.name = 'InvalidShelfScanPageSize';
  }
}
