import { ShelfPhoto } from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { openShelfPhotoBucket } from './gcs-shelf-photo-storage.adapter.js';
import { anAdapterOnAFreshBucket } from './testing/test-bucket.js';

const photo = unwrap(
  ShelfPhoto.of(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'image/jpeg'),
);

const aKey = () => `default/shelf_photo/${crypto.randomUUID()}`;

describe('GcsShelfPhotoStorageAdapter, storing', () => {
  const { bucket, adapter } = anAdapterOnAFreshBucket();

  it('writes the bytes of the photo at the given key', async () => {
    const key = aKey();

    await adapter.store(photo, key);

    const [contents] = await bucket.file(key).download();
    expect(new Uint8Array(contents)).toStrictEqual(photo.bytes);
  });

  // Keys carry no extension: the media type travels as object metadata.
  it('records the media type as the content type of the object', async () => {
    const key = aKey();

    await adapter.store(photo, key);

    const [metadata] = await bucket.file(key).getMetadata();
    expect(metadata.contentType).toBe('image/jpeg');
  });

  // Keys are generated ids: a second write at the same key is a bug, never an update.
  it('refuses to overwrite a photo already stored at the key', async () => {
    const key = aKey();
    await adapter.store(photo, key);

    const other = unwrap(ShelfPhoto.of(new Uint8Array([9, 9, 9]), 'image/png'));

    await expect(adapter.store(other, key)).rejects.toThrow(/ShelfPhotoStorage/u);
    const [contents] = await bucket.file(key).download();
    expect(new Uint8Array(contents)).toStrictEqual(photo.bytes);
  });
});

describe('GcsShelfPhotoStorageAdapter, retrieving', () => {
  const { bucket, adapter } = anAdapterOnAFreshBucket();

  it('reads back the photo it stored', async () => {
    const key = aKey();
    await adapter.store(photo, key);

    const retrieved = await adapter.retrieve(key, 'image/jpeg');

    expect(retrieved.bytes).toStrictEqual(photo.bytes);
    expect(retrieved.mediaType).toBe('image/jpeg');
  });

  it('rejects the retrieval of a key that holds nothing', async () => {
    await expect(adapter.retrieve(aKey(), 'image/jpeg')).rejects.toThrow(/ShelfPhotoStorage/u);
  });

  // The object was a photo when it was stored: one that no longer is has been corrupted, which
  // is the bucket's failure — not a 400 about a photo the caller sent.
  it('rejects the retrieval of an object that is no longer a valid photo', async () => {
    const key = aKey();
    await bucket.file(key).save(Buffer.alloc(0), { resumable: false });

    await expect(adapter.retrieve(key, 'image/jpeg')).rejects.toThrow(/ShelfPhotoStorage/u);
  });
});

// No request is made here: the client only records where it would send one.
describe('openShelfPhotoBucket', () => {
  it('points the client at the emulator when one is configured', () => {
    const bucket = openShelfPhotoBucket({
      bucketName: 'pick-a-book-photos',
      emulatorHost: 'http://localhost:4443',
    });

    expect(bucket.name).toBe('pick-a-book-photos');
    expect(bucket.storage.apiEndpoint).toBe('http://localhost:4443');
  });

  it('talks to the real API when no emulator is configured', () => {
    const bucket = openShelfPhotoBucket({
      bucketName: 'pick-a-book-photos',
      emulatorHost: undefined,
    });

    expect(bucket.storage.apiEndpoint).toBe('https://storage.googleapis.com');
  });
});
