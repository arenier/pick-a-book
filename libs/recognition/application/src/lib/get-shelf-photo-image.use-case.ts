import {
  ShelfPhotoThumbnailNotFound,
  ShelfScanId,
  ShelfScanNotFound,
  type OwnerId,
  type ShelfPhotoStoragePort,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import type { GetShelfPhotoImageCommand, StoredImageDto } from './shelf-scan-history.dto.js';

/** Why an image was not given: no such scan, or the scan has no thumbnail — each a 404. */
export type GetShelfPhotoImageFailure = ShelfScanNotFound | ShelfPhotoThumbnailNotFound;

/**
 * An image of a scan, read back from the bucket (specs/002-upload-history, US1).
 *
 * The scan has to be the configured owner's, or it is « not found » like any unknown id: access
 * is open, and no one's photos are reachable by guessing another's id (FR-012). Reads only
 * (FR-013). A bucket that fails is not an `Err`: it rejects, and the global filter catches it
 * (ADR 0013).
 */
export class GetShelfPhotoImageUseCase {
  constructor(
    private readonly ownerId: OwnerId,
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
  ) {}

  async execute(
    command: GetShelfPhotoImageCommand,
  ): Promise<Result<StoredImageDto, GetShelfPhotoImageFailure>> {
    const id = ShelfScanId.of(command.id);
    const record = id.ok ? await this.repository.get(id.value) : undefined;
    if (record === undefined || !record.ownerId.equals(this.ownerId)) {
      return err(new ShelfScanNotFound(command.id));
    }

    const { thumbnail } = record;
    if (thumbnail === undefined) {
      return err(new ShelfPhotoThumbnailNotFound(command.id));
    }
    const image = await this.storage.retrieveThumbnail(thumbnail.bucketKey, thumbnail.mediaType);

    return ok({ bytes: image.bytes, mediaType: image.mediaType });
  }
}
