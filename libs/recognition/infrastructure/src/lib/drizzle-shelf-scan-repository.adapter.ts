import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  OwnerId,
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanNotFound,
  isShelfPhotoMediaType,
  type NewShelfScan,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScanTransitionFailure,
} from '@pick-a-book/recognition-domain';
import { err, ok, unwrap, type Result } from '@pick-a-book/shared-result';
import { and, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { z } from 'zod';

import { shelfScans, uploads, type StoredDetectedBook } from './drizzle/schema.js';

/** The `uploads.type` of everything recognition writes (research.md §8). */
const SHELF_PHOTO = 'shelf_photo';

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

type Row = {
  readonly upload: typeof uploads.$inferSelect;
  readonly scan: typeof shelfScans.$inferSelect;
};

/**
 * Keeps shelf scan records in Postgres (ADR 0006).
 *
 * The domain sees one `ShelfScanRecord`; the database holds two rows — the file reference in
 * the generic `uploads` table, the scan state in `shelf_scans` (research.md §8). This adapter
 * is the only place that knows it: it writes both in one transaction and joins them back.
 */
export class DrizzleShelfScanRepositoryAdapter implements ShelfScanRepositoryPort {
  private readonly db: NodePgDatabase;

  constructor(pool: Pool) {
    this.db = drizzle({ client: pool });
  }

  async createPending(scan: NewShelfScan): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(uploads).values({
        id: scan.id.value,
        ownerId: scan.ownerId.value,
        type: SHELF_PHOTO,
        bucketKey: scan.photoBucketKey,
        mediaType: scan.photoMediaType,
        sizeBytes: scan.photoSizeBytes,
        originalFilename: scan.originalFilename,
      });
      await tx.insert(shelfScans).values({ uploadId: scan.id.value, status: 'pending' });
    });
  }

  async get(id: ShelfScanId): Promise<ShelfScanRecord | undefined> {
    const rows = await this.db
      .select({ upload: uploads, scan: shelfScans })
      .from(uploads)
      .innerJoin(shelfScans, eq(shelfScans.uploadId, uploads.id))
      .where(and(eq(uploads.id, id.value), eq(uploads.type, SHELF_PHOTO)));
    const row = rows.at(0);

    return row === undefined ? undefined : toRecord(row);
  }

  async markCompleted(
    id: ShelfScanId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    return this.settle(id, {
      status: 'completed',
      detectedBooks: books.map((book) => toStored(book)),
    });
  }

  async markFailed(id: ShelfScanId): Promise<Result<void, ShelfScanTransitionFailure>> {
    return this.settle(id, { status: 'failed', detectedBooks: null });
  }

  /**
   * Moves a pending record, and only a pending one: the `status = 'pending'` condition is in
   * the UPDATE itself, so two concurrent scans cannot both record a result. Zero rows updated
   * then says which rule was broken — no record, or a record already settled — as an `Err`:
   * both are outcomes the port declares (ADR 0013).
   */
  private async settle(
    id: ShelfScanId,
    outcome: { status: 'completed' | 'failed'; detectedBooks: StoredDetectedBook[] | null },
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    const updated = await this.db
      .update(shelfScans)
      .set(outcome)
      .where(and(eq(shelfScans.uploadId, id.value), eq(shelfScans.status, 'pending')))
      .returning({ id: shelfScans.id });

    if (updated.length > 0) {
      return ok();
    }

    const existing = await this.get(id);
    if (existing === undefined) {
      return err(new ShelfScanNotFound(id.value));
    }

    return err(new ShelfScanAlreadyProcessed(id));
  }
}

function toStored(book: DetectedBook): StoredDetectedBook {
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

function toRecord({ upload, scan }: Row): ShelfScanRecord {
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
