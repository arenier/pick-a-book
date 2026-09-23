import {
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanNotFound,
  type DetectedBook,
  type ShelfPhotoStoragePort,
  type ShelfScannerPort,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';

import type { DetectedBookDto, ScanShelfResult } from './scan-shelf.dto.js';
import type { ScanStoredShelfPhotoCommand } from './shelf-photo.dto.js';

/**
 * Second step of a scan: reads back a stored photo and asks the scanner what is on it
 * (specs/001-photo-upload, research.md §7).
 *
 * The photo is read from storage rather than kept in memory between the two requests:
 * Cloud Run holds no state from one request to the next (ADR 0004). Does not filter weak
 * detections — confidence is passed through as is (ADR 0005).
 *
 * A record is scanned once: whatever the scanner answers is kept — books or failure — and a
 * record that already has an outcome is refused before the scanner is called (research.md §7).
 */
export class ScanStoredShelfPhotoUseCase {
  constructor(
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
    private readonly scanner: ShelfScannerPort,
  ) {}

  async execute(command: ScanStoredShelfPhotoCommand): Promise<ScanShelfResult> {
    const id = parseId(command.id);
    const record = await this.repository.get(id);
    if (record === undefined) {
      throw new ShelfScanNotFound(command.id);
    }
    if (record.status !== 'pending') {
      throw new ShelfScanAlreadyProcessed(id);
    }

    const photo = await this.storage.retrieve(record.photoBucketKey, record.photoMediaType);

    let books: DetectedBook[];
    try {
      books = await this.scanner.scan(photo);
    } catch (error) {
      // The photo stays, and its record says the scan failed (US3, FR-011) — then the
      // failure goes on up, for HTTP to report it.
      await this.repository.markFailed(id);
      throw error;
    }
    await this.repository.markCompleted(id, books);

    return { books: books.map((book) => toDto(book)) };
  }
}

/** An id that is not even a UUID matches no record: it is unknown, not malformed input. */
function parseId(raw: string): ShelfScanId {
  try {
    return ShelfScanId.of(raw);
  } catch {
    throw new ShelfScanNotFound(raw);
  }
}

function toDto(book: DetectedBook): DetectedBookDto {
  return {
    author: book.author?.value,
    title: book.title.value,
    confidence: book.confidence.value,
  };
}
