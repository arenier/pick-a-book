import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  OwnerId,
  ShelfScanId,
  isShelfPhotoMediaType,
  isThumbnailMediaType,
  type ShelfScanRecord,
  type StoredThumbnail,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { z } from 'zod';

import type { shelfScans, StoredDetectedBook, uploads } from './schema.js';

/** The `uploads.type` of what the user sends, and of the smaller image made of it (research.md §6, §8). */
export const SHELF_PHOTO = 'shelf_photo';
export const SHELF_PHOTO_THUMBNAIL = 'shelf_photo_thumbnail';

/**
 * `detected_books` comes back from Postgres as whatever JSON the column holds: parsed, not
 * trusted, before it becomes value objects again.
 */
const storedDetectedBooks = z.array(
  z.object({
    author: z.string().optional(),
    title: z.string(),
    confidence: z.number(),
  }),
);

/** What the joins of the adapter read for one scan: its photo, its state, and its thumbnail if any. */
export interface ShelfScanRow {
  readonly upload: typeof uploads.$inferSelect;
  readonly scan: typeof shelfScans.$inferSelect;
  readonly thumbnail: typeof uploads.$inferSelect | null;
}

export function toStored(book: DetectedBook): StoredDetectedBook {
  const stored = { title: book.title.value, confidence: book.confidence.value };

  return book.author === undefined ? stored : { author: book.author.value, ...stored };
}

/**
 * Rebuilds value objects from a row this adapter wrote itself: one the domain now refuses is a
 * corrupted row — a bug, not an outcome the port declares — so it throws, through `unwrap`
 * (ADR 0013 keeps exceptions in `infrastructure`).
 */
function toDetectedBook(book: z.infer<typeof storedDetectedBooks>[number]): DetectedBook {
  return DetectedBook.of(
    book.author === undefined ? undefined : unwrap(Author.of(book.author)),
    unwrap(BookTitle.of(book.title)),
    unwrap(Confidence.of(book.confidence)),
  );
}

/** The reference of the thumbnail row joined to a photo, if the photo has one. */
function toStoredThumbnail(row: ShelfScanRow['thumbnail']): StoredThumbnail | undefined {
  if (row === null) {
    return undefined;
  }
  if (!isThumbnailMediaType(row.mediaType)) {
    throw new Error(`Stored thumbnail ${row.id} has an unsupported media type`);
  }

  return { bucketKey: row.bucketKey, mediaType: row.mediaType, sizeBytes: row.sizeBytes };
}

export function toRecord({ upload, scan, thumbnail }: ShelfScanRow): ShelfScanRecord {
  if (!isShelfPhotoMediaType(upload.mediaType)) {
    throw new Error(`Stored shelf scan ${upload.id} has an unsupported media type`);
  }
  // Only a derived file (a thumbnail) has no original name, and `uploads_source_or_filename_check`
  // keeps one from being a shelf photo. The column is nullable all the same: say it, don't assume.
  if (upload.originalFilename === null) {
    throw new Error(`Stored shelf scan ${upload.id} has no original filename`);
  }

  const reference = {
    id: unwrap(ShelfScanId.of(upload.id)),
    ownerId: unwrap(OwnerId.of(upload.ownerId)),
    photoBucketKey: upload.bucketKey,
    photoMediaType: upload.mediaType,
    photoSizeBytes: upload.sizeBytes,
    originalFilename: upload.originalFilename,
    createdAt: upload.createdAt,
    thumbnail: toStoredThumbnail(thumbnail),
  };

  if (scan.status === 'completed') {
    const books = storedDetectedBooks.parse(scan.detectedBooks);

    return {
      ...reference,
      status: 'completed',
      detectedBooks: books.map((book) => toDetectedBook(book)),
    };
  }
  if (scan.status === 'pending' || scan.status === 'failed') {
    return { ...reference, status: scan.status, detectedBooks: undefined };
  }

  throw new Error(`Stored shelf scan ${upload.id} has an unknown status (${scan.status})`);
}
