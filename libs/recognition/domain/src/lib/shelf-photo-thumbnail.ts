import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidShelfPhotoThumbnail } from './invalid-shelf-photo-thumbnail.error.js';

/**
 * The smaller image the browser makes of a shelf photo, to show the history without pulling
 * every photo (specs/002-upload-history, research.md §5).
 *
 * Narrower than `ShelfPhoto`: no HEIC, since a thumbnail exists to be drawn by any browser, and
 * 256 KB at most — a few dozen are what a page of the history downloads.
 */
export type ThumbnailMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

const SUPPORTED_MEDIA_TYPES: readonly ThumbnailMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/** 256 KB: a 480 px JPEG weighs a few dozen. */
const MAX_BYTES = 256 * 1024;

export class ShelfPhotoThumbnail {
  private constructor(
    readonly bytes: Uint8Array,
    readonly mediaType: ThumbnailMediaType,
  ) {}

  static of(
    bytes: Uint8Array,
    mediaType: string,
  ): Result<ShelfPhotoThumbnail, InvalidShelfPhotoThumbnail> {
    if (bytes.byteLength === 0) {
      return err(new InvalidShelfPhotoThumbnail('empty image'));
    }
    if (bytes.byteLength > MAX_BYTES) {
      return err(
        new InvalidShelfPhotoThumbnail(
          `image too large (${bytes.byteLength} bytes, ${MAX_BYTES} at most)`,
        ),
      );
    }
    if (!isThumbnailMediaType(mediaType)) {
      return err(
        new InvalidShelfPhotoThumbnail(
          `unsupported media type (${mediaType}) — expected ${SUPPORTED_MEDIA_TYPES.join(', ')}`,
        ),
      );
    }

    return ok(new ShelfPhotoThumbnail(bytes, mediaType));
  }
}

export function isThumbnailMediaType(mediaType: string): mediaType is ThumbnailMediaType {
  return SUPPORTED_MEDIA_TYPES.some((supported) => supported === mediaType);
}
