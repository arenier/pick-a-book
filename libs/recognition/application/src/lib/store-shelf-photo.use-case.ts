import {
  ShelfPhoto,
  ShelfScanId,
  type ShelfPhotoStoragePort,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';

import type { StoreShelfPhotoCommand, StoreShelfPhotoResult } from './shelf-photo.dto.js';

/**
 * First step of a scan: keeps the photo, before the long and failure-prone VLM call can lose
 * it (specs/001-photo-upload, research.md §7, FR-014).
 *
 * Validates, stores the bytes under `{ownerId}/shelf_photo/{id}`, then creates the `pending`
 * record — in that order, so a photo refused by `ShelfPhoto` leaves no trace at all (FR-013).
 * The id is generated here, never derived from the file name (FR-015).
 */
export class StoreShelfPhotoUseCase {
  constructor(
    private readonly ownerId: string,
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
  ) {}

  async execute(command: StoreShelfPhotoCommand): Promise<StoreShelfPhotoResult> {
    const photo = ShelfPhoto.of(command.bytes, command.mediaType);
    const id = ShelfScanId.generate();
    const key = `${this.ownerId}/shelf_photo/${id.value}`;

    await this.storage.store(photo, key);
    await this.repository.createPending({
      id,
      ownerId: this.ownerId,
      photoBucketKey: key,
      photoMediaType: photo.mediaType,
      photoSizeBytes: photo.bytes.byteLength,
      originalFilename: command.originalFilename,
    });

    return { id: id.value };
  }
}
