import {
  ShelfPhoto,
  type InvalidShelfPhoto,
  type OwnerId,
  ShelfScanId,
  type ShelfPhotoStoragePort,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import type { StoreShelfPhotoCommand, StoreShelfPhotoResult } from './shelf-photo.dto.js';

/**
 * First step of a scan: keeps the photo, before the long and failure-prone VLM call can lose
 * it (specs/001-photo-upload, research.md §7, FR-014).
 *
 * Validates, stores the bytes under `{ownerId}/shelf_photo/{id}`, then creates the `pending`
 * record — in that order, so a photo refused by `ShelfPhoto` leaves no trace at all (FR-013).
 * The id is generated here, never derived from the file name (FR-015).
 *
 * A refused photo is an expected failure, answered as `InvalidShelfPhoto` (ADR 0013). A bucket
 * or a database that fails is not: it rejects, and the global HTTP filter catches it.
 */
export class StoreShelfPhotoUseCase {
  constructor(
    private readonly ownerId: OwnerId,
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
  ) {}

  async execute(
    command: StoreShelfPhotoCommand,
  ): Promise<Result<StoreShelfPhotoResult, InvalidShelfPhoto>> {
    const photo = ShelfPhoto.of(command.bytes, command.mediaType);
    if (!photo.ok) {
      return err(photo.error);
    }
    const id = ShelfScanId.generate();
    const key = `${this.ownerId.value}/shelf_photo/${id.value}`;

    await this.storage.store(photo.value, key);
    await this.repository.createPending({
      id,
      ownerId: this.ownerId,
      photoBucketKey: key,
      photoMediaType: photo.value.mediaType,
      photoSizeBytes: photo.value.bytes.byteLength,
      originalFilename: command.originalFilename,
    });

    return ok({ id: id.value });
  }
}
