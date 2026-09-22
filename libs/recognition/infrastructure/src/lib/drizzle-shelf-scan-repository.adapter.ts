import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  type NewShelfScan,
  type ShelfScanId,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScanStatus,
} from '@pick-a-book/recognition-domain';
import { and, eq } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

import { SHELF_PHOTO_UPLOAD_TYPE, shelfScans, uploads } from './drizzle/schema.js';

/**
 * Keeps scans in Postgres (ADR 0006).
 *
 * Two tables, one record: `uploads` holds what is true of any stored file, `shelf_scans`
 * what is true of the analysis run on it (specs/001-photo-upload/research.md §8). That split
 * stops here — the port hands back a single `ShelfScanRecord`, and neither `domain` nor
 * `application` has a way to find out there were ever two rows.
 */
export class DrizzleShelfScanRepositoryAdapter implements ShelfScanRepositoryPort {
  constructor(
    private readonly database: NodePgDatabase,
    private readonly pool?: Pool,
  ) {}

  /**
   * Opens the connection pool this repository talks through.
   *
   * The composition root holds a connection string and binds a port to an adapter; it has no
   * reason to import a Postgres driver to do so (ADR 0002). Taking a pool in the constructor
   * is what the tests use — one pool, many cases.
   */
  static connect(databaseUrl: string): DrizzleShelfScanRepositoryAdapter {
    const pool = new Pool({ connectionString: databaseUrl });

    return new DrizzleShelfScanRepositoryAdapter(drizzle(pool), pool);
  }

  /** Releases the pool opened by `connect`; a repository handed a database owns nothing. */
  async close(): Promise<void> {
    await this.pool?.end();
  }

  async createPending(scan: NewShelfScan): Promise<void> {
    // One transaction: an upload no scan points at, or a scan with no file behind it, is a
    // row nothing in the application knows how to read back.
    await this.database.transaction(async (tx) => {
      await tx.insert(uploads).values({
        id: scan.id,
        ownerId: scan.ownerId,
        type: SHELF_PHOTO_UPLOAD_TYPE,
        bucketKey: scan.photoBucketKey,
        mediaType: scan.photoMediaType,
        sizeBytes: scan.photoSizeBytes,
        originalFilename: scan.originalFilename,
      });
      await tx.insert(shelfScans).values({ uploadId: scan.id, status: 'pending' });
    });
  }

  async get(id: ShelfScanId): Promise<ShelfScanRecord | undefined> {
    const rows = await this.database
      .select({
        id: uploads.id,
        ownerId: uploads.ownerId,
        photoBucketKey: uploads.bucketKey,
        photoMediaType: uploads.mediaType,
        photoSizeBytes: uploads.sizeBytes,
        originalFilename: uploads.originalFilename,
        createdAt: uploads.createdAt,
        status: shelfScans.status,
        detectedBooks: shelfScans.detectedBooks,
      })
      .from(uploads)
      .innerJoin(shelfScans, eq(shelfScans.uploadId, uploads.id))
      .where(eq(uploads.id, id));

    // `.at`, not a destructuring: the query types its rows as present, and only reading the
    // array this way keeps "there was no such scan" a case the compiler can see.
    const row = rows.at(0);
    if (row === undefined) {
      return undefined;
    }

    // Postgres hands back text and JSON, not the domain's closed unions: every value is
    // proven on the way in rather than asserted (`as` is forbidden, CLAUDE.md). A row that
    // does not fit is a corrupted row, and saying so beats carrying it further.
    return {
      id: row.id,
      ownerId: row.ownerId,
      photoBucketKey: row.photoBucketKey,
      photoMediaType: mediaType(row.photoMediaType, id),
      photoSizeBytes: row.photoSizeBytes,
      originalFilename: row.originalFilename,
      status: status(row.status, id),
      detectedBooks: detectedBooks(row.detectedBooks, id),
      createdAt: row.createdAt,
    };
  }

  async markCompleted(id: ShelfScanId, books: readonly DetectedBook[]): Promise<void> {
    await this.leavePending(id, {
      status: 'completed',
      detectedBooks: books.map((book) => ({
        author: book.author?.value,
        title: book.title.value,
        confidence: book.confidence.value,
      })),
    });
  }

  async markFailed(id: ShelfScanId): Promise<void> {
    await this.leavePending(id, { status: 'failed', detectedBooks: null });
  }

  /**
   * The single write that moves a scan out of `pending`.
   *
   * The status is part of the `where`, not checked beforehand: two concurrent calls then
   * race in the database rather than in this process, and exactly one of them updates a row.
   * The other one finds nothing to update, which is what the 409 is made of.
   */
  private async leavePending(
    id: ShelfScanId,
    values: { status: ShelfScanStatus; detectedBooks: unknown },
  ): Promise<void> {
    const updated = await this.database
      .update(shelfScans)
      .set(values)
      .where(and(eq(shelfScans.uploadId, id), eq(shelfScans.status, 'pending')))
      .returning({ id: shelfScans.id });

    if (updated.length === 0) {
      throw new Error(`Shelf scan ${id} is not pending: nothing was updated`);
    }
  }
}

/** The same shape `DetectedBookDto` travels in, as stored in `detected_books`. */
const storedBooksSchema = z.array(
  z.object({
    author: z.string().optional(),
    title: z.string(),
    confidence: z.number().min(0).max(1),
  }),
);

const mediaTypeSchema = z.union([
  z.literal('image/jpeg'),
  z.literal('image/png'),
  z.literal('image/webp'),
  z.literal('image/heic'),
]);

const statusSchema = z.union([z.literal('pending'), z.literal('completed'), z.literal('failed')]);

function mediaType(raw: string, id: ShelfScanId) {
  const parsed = mediaTypeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Shelf scan ${id} carries an unsupported media type (${raw})`);
  }

  return parsed.data;
}

function status(raw: string, id: ShelfScanId): ShelfScanStatus {
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Shelf scan ${id} carries an unknown status (${raw})`);
  }

  return parsed.data;
}

/**
 * `null` means "no books to speak of" — pending, or failed. It is never the same thing as an
 * empty list, which is a shelf that was read and held nothing.
 */
function detectedBooks(raw: unknown, id: ShelfScanId): DetectedBook[] | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  const parsed = storedBooksSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Shelf scan ${id} carries books that do not fit the contract`);
  }

  return parsed.data.map((book) =>
    DetectedBook.of(
      book.author === undefined ? undefined : Author.of(book.author),
      BookTitle.of(book.title),
      Confidence.of(book.confidence),
    ),
  );
}
