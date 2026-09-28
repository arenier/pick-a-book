import {
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanNotFound,
  type DetectedBook,
  type ShelfPhotoStoragePort,
  type ShelfScanFailed,
  type ShelfScannerPort,
  type ShelfScanRepositoryPort,
} from '@pick-a-book/recognition-domain';
import { err, ok, type Result } from '@pick-a-book/shared-result';

import type { DetectedBookDto, ScanShelfResult } from './scan-shelf.dto.js';
import type { ScanStoredShelfPhotoCommand } from './shelf-photo.dto.js';

/** Why a stored photo was not scanned, or its scan not kept — each one an HTTP status. */
export type ScanStoredShelfPhotoFailure =
  | ShelfScanNotFound
  | ShelfScanAlreadyProcessed
  | ShelfScanFailed;

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
 *
 * Every failure it can name is an `Err` of `ScanStoredShelfPhotoFailure` (ADR 0013). A bucket
 * or a database that fails is not one of them: it rejects, and the global HTTP filter
 * catches it.
 */
export class ScanStoredShelfPhotoUseCase {
  constructor(
    private readonly storage: ShelfPhotoStoragePort,
    private readonly repository: ShelfScanRepositoryPort,
    private readonly scanner: ShelfScannerPort,
  ) {}

  async execute(
    command: ScanStoredShelfPhotoCommand,
  ): Promise<Result<ScanShelfResult, ScanStoredShelfPhotoFailure>> {
    // An id that is not even a UUID matches no record: it is unknown, not malformed input.
    const parsedId = ShelfScanId.of(command.id);
    if (!parsedId.ok) {
      return err(new ShelfScanNotFound(command.id));
    }
    const id = parsedId.value;

    const record = await this.repository.get(id);
    if (record === undefined) {
      return err(new ShelfScanNotFound(command.id));
    }
    if (record.status !== 'pending') {
      return err(new ShelfScanAlreadyProcessed(id));
    }

    const photo = await this.storage.retrieve(record.photoBucketKey, record.photoMediaType);

    const scanned = await this.scanner.scan(photo);
    if (!scanned.ok) {
      // The photo stays, and its record says the scan failed (US3, FR-011) — then the
      // failure goes on up, for HTTP to report it.
      await this.recordFailure(id);
      return scanned;
    }

    const marked = await this.repository.markCompleted(id, scanned.value);
    if (!marked.ok) {
      return marked;
    }

    return ok({ books: scanned.value.map((book) => toDto(book)) });
  }

  /**
   * The scanner failure is what the caller must hear about (a 502): a database hiccup while
   * recording it must not replace it with a generic error. It is logged instead, and the
   * record stays pending — a state the spec already allows (FR-014). The same goes for a
   * record another request settled in the meantime.
   */
  private async recordFailure(id: ShelfScanId): Promise<void> {
    const reason = `Could not record the failed scan of ${id.value}; it stays pending`;
    try {
      const marked = await this.repository.markFailed(id);
      if (!marked.ok) {
        console.error(reason, marked.error);
      }
    } catch (error) {
      console.error(reason, error);
    }
  }
}

function toDto(book: DetectedBook): DetectedBookDto {
  return {
    author: book.author?.value,
    title: book.title.value,
    confidence: book.confidence.value,
  };
}
