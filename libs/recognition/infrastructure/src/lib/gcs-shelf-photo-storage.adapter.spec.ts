import { Storage } from '@google-cloud/storage';
import { ShelfPhoto } from '@pick-a-book/recognition-domain';
import { beforeAll, describe, expect, it } from 'vitest';

import { GcsShelfPhotoStorageAdapter } from './gcs-shelf-photo-storage.adapter.js';

/**
 * Against the bucket emulator of `docker-compose.yml` (`fake-gcs-server`), not a double:
 * an adapter is tested against the real technology (project convention). The emulator speaks
 * the same JSON API as GCS, which is the whole point of running one rather than mocking the
 * SDK — a mock would agree with whatever the adapter does.
 */
const emulatorHost = process.env.BUCKET_EMULATOR_HOST ?? 'http://localhost:4443';
const bucketName = process.env.BUCKET_NAME ?? 'pick-a-book-photos';

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const photo = ShelfPhoto.of(bytes, 'image/jpeg');

const adapter = new GcsShelfPhotoStorageAdapter({ bucketName, emulatorHost });

/** A fresh key per test, so one run never reads what another wrote. */
const someKey = () => `default/shelf_photo/${crypto.randomUUID()}`;

const emulatedBucket = () =>
  new Storage({ apiEndpoint: emulatorHost, projectId: 'pick-a-book' }).bucket(bucketName);

describe('GcsShelfPhotoStorageAdapter', () => {
  beforeAll(async () => {
    // The suite owns its fixture rather than relying on how the emulator was seeded: creating
    // the bucket here is what makes the run reproducible on a clean container.
    const bucket = emulatedBucket();
    const [exists] = await bucket.exists();
    if (!exists) {
      await bucket.create();
    }
  });
  it('stores the bytes under the key it is given, and reads them back', async () => {
    const key = someKey();

    await adapter.store(photo, key);
    const read = await adapter.retrieve(key, 'image/jpeg');

    expect(read.bytes).toStrictEqual(bytes);
    expect(read.mediaType).toBe('image/jpeg');
  });

  // The key carries no extension (research.md §9): the media type travels as object
  // metadata, so nothing has to be guessed back from a name when the photo is read again.
  it('records the media type as metadata of the stored object', async () => {
    const key = someKey();

    await adapter.store(photo, key);

    const [metadata] = await emulatedBucket().file(key).getMetadata();

    expect(metadata.contentType).toBe('image/jpeg');
  });

  it('rejects when nothing is stored under the key', async () => {
    await expect(adapter.retrieve(someKey(), 'image/jpeg')).rejects.toThrow(/Not Found/u);
  });
});
