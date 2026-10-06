/**
 * Boundary DTOs of the two steps of a shelf scan (specs/001-photo-upload, research.md §7):
 * store the photo, then scan it. Plain data, never a domain object (ADR 0003).
 */
export interface StoreShelfPhotoCommand {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  /** As the browser sent it — kept for reference, never used to name anything (FR-015). */
  readonly originalFilename: string;
  /**
   * The smaller image the browser made of the photo, if it could (specs/002-upload-history,
   * research.md §5). Optional, and never required to be valid: a refused one is dropped.
   */
  readonly thumbnail?: { readonly bytes: Uint8Array; readonly mediaType: string };
}

export interface StoreShelfPhotoResult {
  /** The id of the stored photo, to scan it with next. */
  readonly id: string;
  /**
   * Why the thumbnail that came with the photo was dropped, when it was. The photo is kept all
   * the same: the caller logs it, nobody is told (an unusable thumbnail is not the user's
   * mistake). Absent when there was none, or when it was kept.
   */
  readonly ignoredThumbnail?: string;
}

export interface ScanStoredShelfPhotoCommand {
  /** As received — possibly not even a UUID, which reads as an unknown id. */
  readonly id: string;
}
