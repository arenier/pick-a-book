import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidShelfPhoto } from './invalid-shelf-photo.error.js';

/**
 * A shelf photo submitted for recognition.
 *
 * The domain knows neither the bucket nor the file system: it receives bytes and a media
 * type. Where it is kept is `ShelfPhotoStoragePort`'s business, under a key the use case
 * that stores it decides (`{ownerId}/shelf_photo/{id}`).
 */
export type ShelfPhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

const SUPPORTED_MEDIA_TYPES: readonly ShelfPhotoMediaType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
];

/** 20 MB: a phone photo sits well below that. */
const MAX_BYTES = 20 * 1024 * 1024;

export class ShelfPhoto {
  private constructor(
    readonly bytes: Uint8Array,
    readonly mediaType: ShelfPhotoMediaType,
  ) {}

  static of(bytes: Uint8Array, mediaType: string): Result<ShelfPhoto, InvalidShelfPhoto> {
    if (bytes.byteLength === 0) {
      return err(new InvalidShelfPhoto('empty image'));
    }
    if (bytes.byteLength > MAX_BYTES) {
      return err(
        new InvalidShelfPhoto(`image too large (${bytes.byteLength} bytes, ${MAX_BYTES} at most)`),
      );
    }
    if (!isShelfPhotoMediaType(mediaType)) {
      return err(
        new InvalidShelfPhoto(
          `unsupported media type (${mediaType}) — expected ${SUPPORTED_MEDIA_TYPES.join(', ')}`,
        ),
      );
    }

    return ok(new ShelfPhoto(bytes, mediaType));
  }
}

export function isShelfPhotoMediaType(mediaType: string): mediaType is ShelfPhotoMediaType {
  return SUPPORTED_MEDIA_TYPES.some((supported) => supported === mediaType);
}
