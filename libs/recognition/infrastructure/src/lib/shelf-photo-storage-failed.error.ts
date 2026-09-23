/** The bucket refused a write or a read — an infrastructure failure, a 5xx over HTTP. */
export class ShelfPhotoStorageFailed extends Error {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(`ShelfPhotoStorage: ${reason}`, options);
    this.name = 'ShelfPhotoStorageFailed';
  }
}
