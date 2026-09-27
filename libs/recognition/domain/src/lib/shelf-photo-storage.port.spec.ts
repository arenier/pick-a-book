import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ShelfPhoto, ShelfPhotoMediaType } from './shelf-photo.js';
import {
  SHELF_PHOTO_STORAGE_PORT,
  type ShelfPhotoStoragePort,
} from './shelf-photo-storage.port.js';

describe('ShelfPhotoStoragePort', () => {
  // The port stores under the key it is given: building `{ownerId}/shelf_photo/{id}` is the
  // use case's decision, never the storage's (research.md §10).
  it('stores a photo under a key chosen by its caller', () => {
    expectTypeOf<ShelfPhotoStoragePort['store']>().toEqualTypeOf<
      (photo: ShelfPhoto, key: string) => Promise<void>
    >();
  });

  // The media type comes back from the database record, not from a file extension: the key
  // carries none.
  it('retrieves a photo from its key and known media type', () => {
    expectTypeOf<ShelfPhotoStoragePort['retrieve']>().toEqualTypeOf<
      (key: string, mediaType: ShelfPhotoMediaType) => Promise<ShelfPhoto>
    >();
  });

  it('exposes a string injection token, the domain knowing no container', () => {
    expect(SHELF_PHOTO_STORAGE_PORT).toBe('ShelfPhotoStoragePort');
  });
});
