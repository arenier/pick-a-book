import type { DetectedBook, ShelfScanRecord } from '@pick-a-book/recognition-domain';

import type { DetectedBookDto } from './scan-shelf.dto.js';
import type { ShelfScanDetailDto, ShelfScanSummaryDto } from './shelf-scan-history.dto.js';

/** What the boundary says of a record, field by field: nothing of the file, the key or the owner. */
export function toDetectedBookDto(book: DetectedBook): DetectedBookDto {
  return {
    author: book.author?.value,
    title: book.title.value,
    confidence: book.confidence.value,
  };
}

export function toSummaryDto(record: ShelfScanRecord): ShelfScanSummaryDto {
  const base = {
    id: record.id.value,
    createdAt: record.createdAt.toISOString(),
    hasThumbnail: record.thumbnail !== undefined,
  };

  return record.status === 'completed'
    ? { ...base, outcome: 'completed', bookCount: record.detectedBooks.length }
    : { ...base, outcome: record.status };
}

export function toDetailDto(record: ShelfScanRecord): ShelfScanDetailDto {
  const base = {
    id: record.id.value,
    createdAt: record.createdAt.toISOString(),
    hasThumbnail: record.thumbnail !== undefined,
  };

  return record.status === 'completed'
    ? {
        ...base,
        outcome: 'completed',
        books: record.detectedBooks.map((book) => toDetectedBookDto(book)),
      }
    : { ...base, outcome: record.status };
}
