import { Storage } from '@google-cloud/storage';
import { ShelfPhoto } from '@pick-a-book/recognition-domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { GcsShelfPhotoStorageAdapter } from './gcs-shelf-photo-storage.adapter.js';

/**
 * Runs against the GCS emulator (fake-gcs-server) of docker-compose, not a double: adapters
 * are tested against the real technology (CLAUDE.md). `docker compose up bucket` locally; CI
 * starts the same server.
 */
const emulatorHost = process.env['BUCKET_EMULATOR_HOST'] ?? 'http://localhost:4443';

const storage = new Storage({ apiEndpoint: emulatorHost, projectId: 'pick-a-book-test' });

/**
 * Called inside each `describe`: a fresh bucket, so no state leaks between runs sharing an
 * emulator.
 */
function anAdapterOnAFreshBucket() {
  const bucket = storage.bucket(`shelf-photos-${crypto.randomUUID()}`);

  beforeAll(async () => {
    await bucket.create();
  });

  return { bucket, adapter: new GcsShelfPhotoStorageAdapter(bucket) };
}

const photo = ShelfPhoto.of(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'image/jpeg');

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

    const other = ShelfPhoto.of(new Uint8Array([9, 9, 9]), 'image/png');

    await expect(adapter.store(other, key)).rejects.toThrow(/ShelfPhotoStorage/u);
    const [contents] = await bucket.file(key).download();
    expect(new Uint8Array(contents)).toStrictEqual(photo.bytes);
  });
});

describe('GcsShelfPhotoStorageAdapter, retrieving', () => {
  const { adapter } = anAdapterOnAFreshBucket();

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
});
