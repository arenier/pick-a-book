/**
 * No scan record carries this id — a 404 over HTTP. Takes the id as received, since an id
 * that is not even a UUID is just as unknown.
 */
export class ShelfScanNotFound extends Error {
  constructor(id: string) {
    super(`Shelf scan not found: ${id}`);
    this.name = 'ShelfScanNotFound';
  }
}
