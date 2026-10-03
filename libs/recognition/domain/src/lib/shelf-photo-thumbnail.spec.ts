import { err, unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { InvalidShelfPhotoThumbnail } from './invalid-shelf-photo-thumbnail.error.js';
import { ShelfPhotoThumbnail } from './shelf-photo-thumbnail.js';

const MAX_BYTES = 262_144;

// A thumbnail is what the browser makes of a photo (specs/002-upload-history, research.md §5):
// small, and in a format every browser can show — which HEIC is not.
describe('ShelfPhotoThumbnail', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (mediaType) => {
    const thumbnail = unwrap(ShelfPhotoThumbnail.of(new Uint8Array([1, 2, 3]), mediaType));

    expect(thumbnail.mediaType).toBe(mediaType);
    expect(thumbnail.bytes).toStrictEqual(new Uint8Array([1, 2, 3]));
  });

  it('accepts a thumbnail of exactly 256 KB', () => {
    expect(ShelfPhotoThumbnail.of(new Uint8Array(MAX_BYTES), 'image/jpeg').ok).toBe(true);
  });

  it('rejects an empty thumbnail', () => {
    expect(ShelfPhotoThumbnail.of(new Uint8Array(0), 'image/jpeg')).toStrictEqual(
      err(new InvalidShelfPhotoThumbnail('empty image')),
    );
  });

  it('rejects a thumbnail one byte over 256 KB', () => {
    expect(ShelfPhotoThumbnail.of(new Uint8Array(MAX_BYTES + 1), 'image/jpeg')).toStrictEqual(
      err(new InvalidShelfPhotoThumbnail('image too large (262145 bytes, 262144 at most)')),
    );
  });

  // HEIC is a valid photo, and an invalid thumbnail: most browsers cannot draw it.
  it.each(['image/heic', 'image/gif', 'application/pdf', ''])(
    'rejects the media type %p',
    (type) => {
      expect(ShelfPhotoThumbnail.of(new Uint8Array([1]), type)).toStrictEqual(
        err(
          new InvalidShelfPhotoThumbnail(
            `unsupported media type (${type}) — expected image/jpeg, image/png, image/webp`,
          ),
        ),
      );
    },
  );
});

describe('InvalidShelfPhotoThumbnail', () => {
  it('is told apart by its kind, and says why', () => {
    const error = new InvalidShelfPhotoThumbnail('empty image');

    expect(error.kind).toBe('invalid-shelf-photo-thumbnail');
    expect(error.name).toBe('InvalidShelfPhotoThumbnail');
    expect(error.message).toBe('ShelfPhotoThumbnail: empty image');
  });
});
