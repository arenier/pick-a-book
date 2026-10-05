import {
  ShelfPhoto,
  ShelfPhotoThumbnail,
  type ShelfPhotoMediaType,
  type ShelfPhotoStoragePort,
  type ThumbnailMediaType,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';

/** What the double throws for a key that holds nothing: the real adapter's own error, if told. */
export interface InMemoryShelfPhotoStorageOptions {
  readonly whenMissing?: (key: string) => Error;
}

/**
 * Test double of the two storage ports: the use cases are tested without infrastructure
 * (ADR 0002). Shared with `apps/api` through `@pick-a-book/recognition-application/testing`, so
 * that there is one double to keep in step with the ports, not two.
 *
 * Like an adapter, a double may throw and `unwrap`: it stands where `infrastructure` would,
 * and ADR 0013 keeps exceptions there. A lib cannot name the error of the real adapter
 * (`ShelfPhotoStorageFailed` lives in `infrastructure`), so `apps/api` hands it over.
 */
export class InMemoryShelfPhotoStorage implements ShelfPhotoStoragePort {
  readonly objects = new Map<string, ShelfPhoto>();
  readonly thumbnails = new Map<string, ShelfPhotoThumbnail>();

  constructor(private readonly options: InMemoryShelfPhotoStorageOptions = {}) {}

  private missing(key: string): Error {
    return this.options.whenMissing?.(key) ?? new Error(`no object at ${key}`);
  }

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    this.objects.set(key, photo);
  }

  async retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto> {
    const photo = this.objects.get(key);
    if (photo === undefined) {
      throw this.missing(key);
    }

    return unwrap(ShelfPhoto.of(photo.bytes, mediaType));
  }

  async storeThumbnail(thumbnail: ShelfPhotoThumbnail, key: string): Promise<void> {
    this.thumbnails.set(key, thumbnail);
  }

  async retrieveThumbnail(
    key: string,
    mediaType: ThumbnailMediaType,
  ): Promise<ShelfPhotoThumbnail> {
    const thumbnail = this.thumbnails.get(key);
    if (thumbnail === undefined) {
      throw this.missing(key);
    }

    return unwrap(ShelfPhotoThumbnail.of(thumbnail.bytes, mediaType));
  }
}
