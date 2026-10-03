import {
  ShelfPhoto,
  ShelfPhotoThumbnail,
  type InvalidShelfPhoto,
  type OwnerId,
  ShelfScanId,
  type ShelfPhotoStoragePort,
  type ShelfScanRepositoryPort,
  type StoredThumbnail,
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
 *
 * The thumbnail the browser may send along is kept under `{ownerId}/shelf_photo_thumbnail/{id}`,
 * after the photo, and referenced by the record. It is a convenience: an unusable one is dropped,
 * and the reason handed back for the caller to log (specs/002-upload-history, research.md §5).
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
    const thumbnail = await this.keepThumbnail(command.thumbnail, id);
    await this.repository.createPending({
      id,
      ownerId: this.ownerId,
      photoBucketKey: key,
      photoMediaType: photo.value.mediaType,
      photoSizeBytes: photo.value.bytes.byteLength,
      originalFilename: command.originalFilename,
      ...(thumbnail.kept === undefined ? {} : { thumbnail: thumbnail.kept }),
    });

    return ok(
      thumbnail.ignored === undefined
        ? { id: id.value }
        : { id: id.value, ignoredThumbnail: thumbnail.ignored },
    );
  }

  /** Stores the thumbnail if it is valid; otherwise says why it was dropped. Never fails the upload. */
  private async keepThumbnail(
    sent: StoreShelfPhotoCommand['thumbnail'],
    id: ShelfScanId,
  ): Promise<{ readonly kept?: StoredThumbnail; readonly ignored?: string }> {
    if (sent === undefined) {
      return {};
    }
    const thumbnail = ShelfPhotoThumbnail.of(sent.bytes, sent.mediaType);
    if (!thumbnail.ok) {
      return { ignored: thumbnail.error.message };
    }

    const bucketKey = `${this.ownerId.value}/shelf_photo_thumbnail/${id.value}`;
    await this.storage.storeThumbnail(thumbnail.value, bucketKey);

    return {
      kept: {
        bucketKey,
        mediaType: thumbnail.value.mediaType,
        sizeBytes: thumbnail.value.bytes.byteLength,
      },
    };
  }
}
