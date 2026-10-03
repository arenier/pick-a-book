import {
  ShelfPhoto,
  ShelfPhotoThumbnail,
  type ShelfPhotoMediaType,
  type ShelfPhotoStoragePort,
  type ThumbnailMediaType,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';

/** In-memory double of the photo storage port: a map of what was stored, by key. */
export class InMemoryPhotoStorage implements ShelfPhotoStoragePort {
  readonly objects = new Map<string, ShelfPhoto>();
  readonly thumbnails = new Map<string, ShelfPhotoThumbnail>();

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    this.objects.set(key, photo);
  }

  async retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto> {
    return unwrap(ShelfPhoto.of(this.objects.get(key)?.bytes ?? new Uint8Array(), mediaType));
  }

  async storeThumbnail(thumbnail: ShelfPhotoThumbnail, key: string): Promise<void> {
    this.thumbnails.set(key, thumbnail);
  }

  async retrieveThumbnail(
    key: string,
    mediaType: ThumbnailMediaType,
  ): Promise<ShelfPhotoThumbnail> {
    return unwrap(
      ShelfPhotoThumbnail.of(this.thumbnails.get(key)?.bytes ?? new Uint8Array(), mediaType),
    );
  }
}
