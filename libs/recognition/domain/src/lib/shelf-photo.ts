/**
 * A shelf photo submitted for recognition.
 *
 * The domain knows neither the bucket nor the file system: it receives bytes and a media
 * type. The key of the stored object stays an infrastructure concern (ADR 0004, ADR 0006).
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

  static of(bytes: Uint8Array, mediaType: string): ShelfPhoto {
    if (bytes.byteLength === 0) {
      throw new Error('ShelfPhoto: empty image');
    }
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(
        `ShelfPhoto: image too large (${bytes.byteLength} bytes, ${MAX_BYTES} at most)`,
      );
    }
    if (!isSupported(mediaType)) {
      throw new Error(
        `ShelfPhoto: unsupported media type (${mediaType}) — expected ${SUPPORTED_MEDIA_TYPES.join(', ')}`,
      );
    }

    return new ShelfPhoto(bytes, mediaType);
  }
}

function isSupported(mediaType: string): mediaType is ShelfPhotoMediaType {
  return SUPPORTED_MEDIA_TYPES.some((supported) => supported === mediaType);
}
