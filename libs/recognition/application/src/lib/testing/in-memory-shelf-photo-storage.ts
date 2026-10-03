import {
  ShelfPhoto,
  ShelfPhotoThumbnail,
  type ShelfPhotoMediaType,
  type ShelfPhotoStoragePort,
  type ThumbnailMediaType,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';

/**
 * Test doubles of the two storage ports: the use cases are tested without infrastructure
 * (ADR 0002). Excluded from the lib build (`tsconfig.lib.json`), compiled with the specs.
 *
 * Like an adapter, a double may throw and `unwrap`: it stands where `infrastructure` would,
 * and ADR 0013 keeps exceptions there.
 */
export class InMemoryShelfPhotoStorage implements ShelfPhotoStoragePort {
  readonly objects = new Map<string, ShelfPhoto>();
  readonly thumbnails = new Map<string, ShelfPhotoThumbnail>();

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    this.objects.set(key, photo);
  }

  async retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto> {
    const photo = this.objects.get(key);
    if (photo === undefined) {
      throw new Error(`no object at ${key}`);
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
      throw new Error(`no object at ${key}`);
    }

    return unwrap(ShelfPhotoThumbnail.of(thumbnail.bytes, mediaType));
  }
}
