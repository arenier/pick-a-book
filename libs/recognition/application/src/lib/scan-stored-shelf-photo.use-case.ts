import type {
  DetectedBook,
  ShelfPhotoStoragePort,
  ShelfScanRepositoryPort,
  ShelfScannerPort,
} from '@pick-a-book/recognition-domain';

import type {
  DetectedBookDto,
  ScanShelfResult,
  ScanStoredShelfPhotoCommand,
} from './scan-shelf.dto.js';
import { ShelfScanAlreadyProcessed } from './shelf-scan-already-processed.error.js';
import { ShelfScanNotFound } from './shelf-scan-not-found.error.js';

/**
 * Runs the analysis on a photo that is already kept, and records what came of it.
 *
 * The other half of the split (specs/001-photo-upload/research.md §7): the photo is read
 * back from storage rather than carried over from the previous request — Cloud Run keeps
 * nothing between two of them (ADR 0004).
 *
 * The scan is attempted once. Whatever the provider answers — books, an empty shelf, a
 * failure — the record leaves `pending` exactly once, so a second call finds nothing left to
 * do rather than paying for a VLM that already answered.
 */
export class ScanStoredShelfPhotoUseCase {
  constructor(
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
    private readonly shelfScanner: ShelfScannerPort,
  ) {}

  async execute(command: ScanStoredShelfPhotoCommand): Promise<ScanShelfResult> {
    const record = await this.repository.get(command.id);
    if (record === undefined) {
      throw new ShelfScanNotFound(command.id);
    }
    if (record.status !== 'pending') {
      throw new ShelfScanAlreadyProcessed(command.id, record.status);
    }

    const photo = await this.storage.retrieve(record.photoBucketKey, record.photoMediaType);

    let detected;
    try {
      detected = await this.shelfScanner.scan(photo);
    } catch (error) {
      // The scan is over either way: the record says so, and the photo stays where it is
      // (FR-011, US3 scenario 2). The failure is then re-raised untouched — mapping it to a
      // status code is the controller's business, not this one's.
      await this.repository.markFailed(record.id);
      throw error;
    }

    await this.repository.markCompleted(record.id, detected);

    return { books: detected.map((book) => toDto(book)) };
  }
}

function toDto(book: DetectedBook): DetectedBookDto {
  return {
    author: book.author?.value,
    title: book.title.value,
    confidence: book.confidence.value,
  };
}
