import { ShelfPhoto } from '@pick-a-book/recognition-domain';
import type { DetectedBook, ShelfScannerPort } from '@pick-a-book/recognition-domain';

import type { DetectedBookDto, ScanShelfCommand, ScanShelfResult } from './scan-shelf.dto.js';

/**
 * Reads a shelf photo and returns the detected (author, title) pairs.
 *
 * Talks to the port only (ADR 0002): no HTTP, no VLM provider, no bucket here. Does not
 * filter weak detections — confidence is passed through as is, and it is up to
 * orchestration to decide what to do with it (ADR 0005).
 */
export class ScanShelfUseCase {
  constructor(private readonly shelfScanner: ShelfScannerPort) {}

  async execute(command: ScanShelfCommand): Promise<ScanShelfResult> {
    const photo = ShelfPhoto.of(command.bytes, command.mediaType);
    const detected = await this.shelfScanner.scan(photo);

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
