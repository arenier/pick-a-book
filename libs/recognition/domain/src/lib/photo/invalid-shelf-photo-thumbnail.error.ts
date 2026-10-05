/**
 * The thumbnail is not one the recognition context keeps: empty, too large, or in a format a
 * browser cannot show. Never a failure for the caller: the upload that carried it goes on
 * without a thumbnail (specs/002-upload-history, research.md §5), so no HTTP status maps it.
 */
export class InvalidShelfPhotoThumbnail extends Error {
  readonly kind = 'invalid-shelf-photo-thumbnail';

  constructor(reason: string) {
    super(`ShelfPhotoThumbnail: ${reason}`);
    this.name = 'InvalidShelfPhotoThumbnail';
  }
}
