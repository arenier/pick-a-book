import {
  Author,
  BookTitle,
  Confidence,
  DailyScanQuotaExceeded,
  DetectedBook,
  OwnerId,
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanInProgress,
  ShelfScanNotFound,
  isShelfPhotoMediaType,
  type NewShelfScan,
  type ScanAttemptPolicy,
  type ScanAttemptRefusal,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type ShelfScanTransitionFailure,
} from '@pick-a-book/recognition-domain';
import { err, ok, unwrap, type Result } from '@pick-a-book/shared-result';
import { and, count, eq, gte, isNull, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { z } from 'zod';

import { scanAttempts, shelfScans, uploads, type StoredDetectedBook } from './drizzle/schema.js';

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

/**
 * The key of the advisory lock that serialises reservations. Hashed by Postgres: one lock for
 * all of them, since the daily cap is what they contend on (research.md §8).
 */
const ATTEMPT_LOCK_NAME = 'pick-a-book/scan-attempts';

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

  /**
   * Reserves an analysis, atomically. The transaction starts by taking an advisory lock, held
   * to its end — a few milliseconds, never during the VLM call — so that two reservations near
   * the cap cannot both read « one left »; then it checks, in the order the port documents,
   * and inserts the attempt (research.md §8). A refusal is an `Err`, not a rollback: nothing
   * was written.
   */
  async startAttempt(
    id: ShelfScanId,
    policy: ScanAttemptPolicy,
  ): Promise<Result<void, ScanAttemptRefusal>> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ATTEMPT_LOCK_NAME}))`);

      const refusal = await refusalOf(tx, id, policy);
      if (refusal !== undefined) {
        return err(refusal);
      }
      await tx.insert(scanAttempts).values({ uploadId: id.value });

      return ok();
    });
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
   * both are outcomes the port declares (ADR 0013). The attempt that led here is closed in the
   * same transaction, whatever the outcome: it is over.
   */
  private async settle(
    id: ShelfScanId,
    outcome: { status: 'completed' | 'failed'; detectedBooks: StoredDetectedBook[] | null },
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    const updated = await this.db.transaction(async (tx) => {
      const moved = await tx
        .update(shelfScans)
        .set(outcome)
        .where(and(eq(shelfScans.uploadId, id.value), eq(shelfScans.status, 'pending')))
        .returning({ id: shelfScans.id });
      await tx
        .update(scanAttempts)
        .set({ finishedAt: sql`now()` })
        .where(and(eq(scanAttempts.uploadId, id.value), isNull(scanAttempts.finishedAt)));

      return moved;
    });

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

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/**
 * What stops an analysis from starting, in the order the port documents — or `undefined` when
 * nothing does. Reads only: the caller holds the advisory lock, so what is read here still
 * holds when the attempt is inserted.
 */
async function refusalOf(
  tx: Transaction,
  id: ShelfScanId,
  policy: ScanAttemptPolicy,
): Promise<ScanAttemptRefusal | undefined> {
  const scan = (
    await tx
      .select({ ownerId: uploads.ownerId, status: shelfScans.status })
      .from(uploads)
      .innerJoin(shelfScans, eq(shelfScans.uploadId, uploads.id))
      .where(and(eq(uploads.id, id.value), eq(uploads.type, SHELF_PHOTO)))
  ).at(0);
  if (scan === undefined) {
    return new ShelfScanNotFound(id.value);
  }
  if (scan.status !== 'pending') {
    return new ShelfScanAlreadyProcessed(id);
  }
  if (await hasRunningAttempt(tx, id, policy.lease)) {
    return new ShelfScanInProgress(id);
  }
  if ((await attemptsToday(tx, scan.ownerId, policy.timeZone)) >= policy.dailyLimit) {
    return new DailyScanQuotaExceeded(policy.dailyLimit);
  }

  return undefined;
}

/** An attempt still open, started less than a lease ago. */
async function hasRunningAttempt(
  tx: Transaction,
  id: ShelfScanId,
  lease: number,
): Promise<boolean> {
  const running = await tx
    .select({ id: scanAttempts.id })
    .from(scanAttempts)
    .where(
      and(
        eq(scanAttempts.uploadId, id.value),
        isNull(scanAttempts.finishedAt),
        gte(scanAttempts.startedAt, sql`now() - make_interval(secs => ${lease / 1000})`),
      ),
    )
    .limit(1);

  return running.length > 0;
}

/** What the day's cap counts: the owner's attempts since midnight, « today » being the user's. */
async function attemptsToday(tx: Transaction, ownerId: string, timeZone: string): Promise<number> {
  const rows = await tx
    .select({ attempts: count() })
    .from(scanAttempts)
    .innerJoin(uploads, eq(uploads.id, scanAttempts.uploadId))
    .where(
      and(
        eq(uploads.ownerId, ownerId),
        gte(
          scanAttempts.startedAt,
          sql`date_trunc('day', now() at time zone ${timeZone}) at time zone ${timeZone}`,
        ),
      ),
    );

  return rows.at(0)?.attempts ?? 0;
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
