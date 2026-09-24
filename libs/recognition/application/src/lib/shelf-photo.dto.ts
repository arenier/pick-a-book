/**
 * Boundary DTOs of the two steps of a shelf scan (specs/001-photo-upload, research.md §7):
 * store the photo, then scan it. Plain data, never a domain object (ADR 0003).
 */
export interface StoreShelfPhotoCommand {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  /** As the browser sent it — kept for reference, never used to name anything (FR-015). */
  readonly originalFilename: string;
}

export interface StoreShelfPhotoResult {
  /** The id of the stored photo, to scan it with next. */
  readonly id: string;
}

export interface ScanStoredShelfPhotoCommand {
  /** As received — possibly not even a UUID, which reads as an unknown id. */
  readonly id: string;
}
