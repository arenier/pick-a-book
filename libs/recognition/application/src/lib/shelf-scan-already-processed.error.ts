/**
 * The scan already answered: running it again would overwrite a result that is already
 * recorded, and pay a second time for a VLM call that already happened
 * (specs/001-photo-upload/research.md §7).
 */
export class ShelfScanAlreadyProcessed extends Error {
  constructor(id: string, status: string) {
    super(`Shelf scan ${id} is already ${status}`);
    this.name = 'ShelfScanAlreadyProcessed';
  }
}
