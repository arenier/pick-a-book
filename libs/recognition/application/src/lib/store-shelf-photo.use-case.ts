import { ShelfPhoto } from '@pick-a-book/recognition-domain';
import type {
  ShelfPhotoStoragePort,
  ShelfScanId,
  ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';

import type { StoreShelfPhotoCommand, StoreShelfPhotoResult } from './scan-shelf.dto.js';

/**
 * Keeps a submitted photo, and nothing more.
 *
 * Half of what used to be a single synchronous scan: the photo is secured here, before the
 * VLM is called at all (specs/001-photo-upload/research.md §7). That is what FR-011 rests on
 * — an analysis that never happens, or fails, can no longer take the photo down with it,
 * because the two are no longer the same request.
 *
 * Order matters: the photo is validated first, stored second, recorded third. A file the
 * domain refuses (wrong type, too heavy, empty) therefore leaves nothing behind at all
 * (FR-013), and a record never points at an object that was never written.
 */
export class StoreShelfPhotoUseCase {
  constructor(
    /**
     * Owner segment of the key. Comes from configuration, not from the request: this feature
     * has no accounts, and a caller cannot pick where its photo lands (research.md §10).
     */
    private readonly ownerId: string,
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
  ) {}

  async execute(command: StoreShelfPhotoCommand): Promise<StoreShelfPhotoResult> {
    const photo = ShelfPhoto.of(command.bytes, command.mediaType);
    const id: ShelfScanId = crypto.randomUUID();
    // Generated here, never derived from what the browser sent: a filename is free text from
    // a third party, and nothing it contains ever names a stored object (FR-015).
    const photoBucketKey = `${this.ownerId}/shelf_photo/${id}`;

    await this.storage.store(photo, photoBucketKey);
    await this.repository.createPending({
      id,
      ownerId: this.ownerId,
      photoBucketKey,
      photoMediaType: photo.mediaType,
      photoSizeBytes: photo.bytes.byteLength,
      originalFilename: command.originalFilename,
    });

    return { id };
  }
}
