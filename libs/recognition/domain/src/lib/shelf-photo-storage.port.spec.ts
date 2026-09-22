import { describe, expect, it } from 'vitest';

import {
  SHELF_PHOTO_STORAGE_PORT,
  type ShelfPhotoStoragePort,
} from './shelf-photo-storage.port.js';
import { ShelfPhoto } from './shelf-photo.js';

/**
 * An implementation is the only honest way to pin an interface down here: the domain owns
 * the shape, and a spec that merely restated it would prove nothing the type already says.
 * What this asserts is that the shape is implementable as written — a key handed in, bytes
 * and media type handed back — without the implementation knowing anything more.
 */
function inMemoryStorage(): ShelfPhotoStoragePort {
  const objects = new Map<string, Uint8Array>();

  return {
    store: async (photo: ShelfPhoto, key: string) => {
      objects.set(key, photo.bytes);
    },
    retrieve: async (key: string, mediaType: string) => {
      const bytes = objects.get(key);
      if (bytes === undefined) {
        throw new Error(`No object at ${key}`);
      }

      return ShelfPhoto.of(bytes, mediaType);
    },
  };
}

const photo = ShelfPhoto.of(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');

describe('ShelfPhotoStoragePort', () => {
  it('stores a photo under the key it is given, and reads it back', async () => {
    const storage = inMemoryStorage();

    await storage.store(photo, 'default/shelf_photo/a-uuid');
    const read = await storage.retrieve('default/shelf_photo/a-uuid', 'image/jpeg');

    expect(read.bytes).toStrictEqual(photo.bytes);
    expect(read.mediaType).toBe('image/jpeg');
  });

  // The port stores under the key it receives rather than deriving one: building
  // `{ownerId}/shelf_photo/{id}` is the use case's decision, not the storage's
  // (specs/001-photo-upload/research.md §10).
  it('takes the key from its caller', async () => {
    const storage = inMemoryStorage();

    await storage.store(photo, 'marguerite/shelf_photo/another-uuid');

    await expect(
      storage.retrieve('default/shelf_photo/another-uuid', 'image/jpeg'),
    ).rejects.toThrow(/No object at/u);
    await expect(
      storage.retrieve('marguerite/shelf_photo/another-uuid', 'image/jpeg'),
    ).resolves.toBeInstanceOf(ShelfPhoto);
  });

  it('names a token the composition root binds the port with', () => {
    expect(SHELF_PHOTO_STORAGE_PORT).toBe('ShelfPhotoStoragePort');
  });
});
