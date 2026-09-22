import { Storage, type Bucket } from '@google-cloud/storage';
import { ShelfPhoto, type ShelfPhotoStoragePort } from '@pick-a-book/recognition-domain';

export interface GcsShelfPhotoStorageOptions {
  readonly bucketName: string;
  /**
   * Points the client at the local emulator (`fake-gcs-server`) instead of Google's API.
   * Absent in production, where the SDK talks to the real bucket (ADR 0004).
   *
   * Configured as `BUCKET_EMULATOR_HOST`, not the `STORAGE_EMULATOR_HOST` the SDK reads by
   * itself: that one is documented in the SDK as experimental, and it replaces the whole
   * base URL — dropping the `/storage/v1` prefix the emulator serves, so every call 404s.
   * Passing `apiEndpoint` is what the SDK asks for instead.
   */
  readonly emulatorHost?: string;
}

/**
 * Keeps shelf photos in a Cloud Storage bucket (ADR 0004).
 *
 * The object is named by the key the port receives — `{ownerId}/shelf_photo/{id}`, built by
 * the use case — and carries no extension: the media type is written as object metadata and
 * handed back on read, so nothing is ever guessed from a name
 * (specs/001-photo-upload/research.md §9).
 */
export class GcsShelfPhotoStorageAdapter implements ShelfPhotoStoragePort {
  private readonly bucket: Bucket;

  constructor(options: GcsShelfPhotoStorageOptions) {
    // A project id is required by the client even when the emulator ignores it; in
    // production it comes from the ambient service account, as do the credentials.
    const storage =
      options.emulatorHost === undefined
        ? new Storage()
        : new Storage({ apiEndpoint: options.emulatorHost, projectId: 'pick-a-book' });

    this.bucket = storage.bucket(options.bucketName);
  }

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    // `resumable: false`: a shelf photo is 20 MB at most, and a single request beats the
    // three-way handshake of a resumable upload at that size.
    await this.bucket
      .file(key)
      .save(Buffer.from(photo.bytes), { contentType: photo.mediaType, resumable: false });
  }

  async retrieve(key: string, mediaType: string): Promise<ShelfPhoto> {
    // A missing object rejects here, from the SDK: the caller reads that as "the photo this
    // record points at is gone", which is not the same failure as "no such record".
    const [contents] = await this.bucket.file(key).download();

    return ShelfPhoto.of(new Uint8Array(contents), mediaType);
  }
}
