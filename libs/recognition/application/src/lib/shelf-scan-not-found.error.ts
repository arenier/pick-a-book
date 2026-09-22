/** No record answers to this id — the caller asked about a photo that was never submitted. */
export class ShelfScanNotFound extends Error {
  constructor(id: string) {
    super(`No shelf scan ${id}`);
    this.name = 'ShelfScanNotFound';
  }
}
