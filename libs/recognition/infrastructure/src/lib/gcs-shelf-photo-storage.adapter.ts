import { type Bucket, Storage } from '@google-cloud/storage';
import {
  ShelfPhoto,
  type ShelfPhotoMediaType,
  type ShelfPhotoStoragePort,
} from '@pick-a-book/recognition-domain';

import { ShelfPhotoStorageFailed } from './shelf-photo-storage-failed.error.js';

/**
 * Keeps shelf photos in a Cloud Storage bucket (ADR 0004).
 *
 * Handed a `Bucket` rather than building one: which bucket, and whether it is the real API
 * or the emulator (`BUCKET_EMULATOR_HOST`), is configuration — the composition root of
 * `apps/api` decides it. The adapter only knows how to write and read an object.
 */
export class GcsShelfPhotoStorageAdapter implements ShelfPhotoStoragePort {
  constructor(private readonly bucket: Bucket) {}

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    try {
      await this.bucket.file(key).save(Buffer.from(photo.bytes), {
        contentType: photo.mediaType,
        resumable: false,
        // Keys are generated ids: an object already there means a bug, never an update.
        // Generation 0 matches only an absent object, so the write fails instead of replacing.
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      throw new ShelfPhotoStorageFailed(`could not store ${key}`, { cause: error });
    }
  }

  async retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto> {
    let contents: Buffer;
    try {
      [contents] = await this.bucket.file(key).download();
    } catch (error) {
      throw new ShelfPhotoStorageFailed(`could not retrieve ${key}`, { cause: error });
    }

    return ShelfPhoto.of(new Uint8Array(contents), mediaType);
  }
}

/**
 * Opens the bucket that keeps shelf photos — on the real API with the ambient credentials
 * (the Cloud Run service account), or on the emulator when its URL is given, which takes no
 * credentials.
 *
 * Here rather than in the composition root so that `@google-cloud/storage` stays a
 * dependency of this lib alone: the root only hands the result back to the adapter.
 */
export function openShelfPhotoBucket(options: {
  readonly bucketName: string;
  readonly emulatorHost: string | undefined;
}): Bucket {
  const storage =
    options.emulatorHost === undefined
      ? new Storage()
      : new Storage({ apiEndpoint: options.emulatorHost });

  return storage.bucket(options.bucketName);
}
