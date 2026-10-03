import {
  ShelfPhoto,
  type ShelfPhotoMediaType,
  type ShelfPhotoStoragePort,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';

/** In-memory double of the photo storage port: a map of what was stored, by key. */
export class InMemoryPhotoStorage implements ShelfPhotoStoragePort {
  readonly objects = new Map<string, ShelfPhoto>();

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    this.objects.set(key, photo);
  }

  async retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto> {
    return unwrap(ShelfPhoto.of(this.objects.get(key)?.bytes ?? new Uint8Array(), mediaType));
  }
}
