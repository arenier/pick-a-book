/**
 * The scan exists but has no thumbnail: it was sent before thumbnails, or the browser could not
 * make one, or the one it sent was refused (specs/002-upload-history, research.md §5) — a 404
 * over HTTP, and an « unavailable » indicator on screen (FR-008). Takes the id as received.
 */
export class ShelfPhotoThumbnailNotFound extends Error {
  readonly kind = 'shelf-photo-thumbnail-not-found';

  constructor(id: string) {
    super(`Shelf photo thumbnail not found: ${id}`);
    this.name = 'ShelfPhotoThumbnailNotFound';
  }
}
