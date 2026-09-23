import {
  ShelfScanId,
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
 */
export class ScanStoredShelfPhotoUseCase {
  constructor(
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
    private readonly scanner: ShelfScannerPort,
  ) {}

  async execute(command: ScanStoredShelfPhotoCommand): Promise<ScanShelfResult> {
    const id = ShelfScanId.of(command.id);
    const record = await this.repository.get(id);
    if (record === undefined) {
      throw new Error(`no shelf scan ${id.value}`);
    }

    const photo = await this.storage.retrieve(record.photoBucketKey, record.photoMediaType);
    const books = await this.scanner.scan(photo);
    await this.repository.markCompleted(id, books);

    return { books: books.map((book) => toDto(book)) };
  }
}

function toDto(book: DetectedBook): DetectedBookDto {
  return {
    author: book.author?.value,
    title: book.title.value,
    confidence: book.confidence.value,
  };
}
