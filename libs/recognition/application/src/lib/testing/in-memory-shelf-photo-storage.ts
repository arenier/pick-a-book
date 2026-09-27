import {
  ShelfPhoto,
  type ShelfPhotoMediaType,
  type ShelfPhotoStoragePort,
} from '@pick-a-book/recognition-domain';

/**
 * Test doubles of the two storage ports: the use cases are tested without infrastructure
 * (ADR 0002). Excluded from the lib build (`tsconfig.lib.json`), compiled with the specs.
 */
export class InMemoryShelfPhotoStorage implements ShelfPhotoStoragePort {
  readonly objects = new Map<string, ShelfPhoto>();

  async store(photo: ShelfPhoto, key: string): Promise<void> {
    this.objects.set(key, photo);
  }

  async retrieve(key: string, mediaType: ShelfPhotoMediaType): Promise<ShelfPhoto> {
    const photo = this.objects.get(key);
    if (photo === undefined) {
      throw new Error(`no object at ${key}`);
    }

    return ShelfPhoto.of(photo.bytes, mediaType);
  }
}
