import { ShelfPhotoThumbnail } from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { anAdapterOnAFreshBucket } from '../testing/test-bucket.js';

/**
 * Thumbnails against the GCS emulator, like the photos (specs/002-upload-history, research.md
 * §6): the same bucket, under their own key, with the same refusal to overwrite.
 */
const thumbnail = unwrap(
  ShelfPhotoThumbnail.of(new Uint8Array([0xff, 0xd8, 0xff, 1, 2]), 'image/webp'),
);

const aKey = () => `default/shelf_photo_thumbnail/${crypto.randomUUID()}`;

describe('GcsShelfPhotoStorageAdapter, thumbnails', () => {
  const { bucket, adapter } = anAdapterOnAFreshBucket();

  it('reads back the thumbnail it stored, with the media type it is handed', async () => {
    const key = aKey();
    await adapter.storeThumbnail(thumbnail, key);

    const retrieved = await adapter.retrieveThumbnail(key, 'image/webp');

    expect(retrieved.bytes).toStrictEqual(thumbnail.bytes);
    expect(retrieved.mediaType).toBe('image/webp');
  });

  it('records the media type as the content type of the object', async () => {
    const key = aKey();

    await adapter.storeThumbnail(thumbnail, key);

    const [metadata] = await bucket.file(key).getMetadata();
    expect(metadata.contentType).toBe('image/webp');
  });

  // Keys are generated ids: a second write at the same key is a bug, never an update.
  it('refuses to overwrite a thumbnail already stored at the key', async () => {
    const key = aKey();
    await adapter.storeThumbnail(thumbnail, key);

    await expect(adapter.storeThumbnail(thumbnail, key)).rejects.toThrow(/ShelfPhotoStorage/u);
  });

  it('rejects the retrieval of a key that holds nothing', async () => {
    await expect(adapter.retrieveThumbnail(aKey(), 'image/webp')).rejects.toThrow(
      /ShelfPhotoStorage/u,
    );
  });

  // It was a valid thumbnail when it was stored: one that no longer is has been corrupted.
  it('rejects the retrieval of an object that is no longer a valid thumbnail', async () => {
    const key = aKey();
    await bucket.file(key).save(Buffer.alloc(0), { resumable: false });

    await expect(adapter.retrieveThumbnail(key, 'image/webp')).rejects.toThrow(
      /ShelfPhotoStorage/u,
    );
  });
});
