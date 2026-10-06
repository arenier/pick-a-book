import {
  DailyUploadQuotaExceeded,
  ScanAttemptId,
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanNotFound,
  type DetectedBook,
  type NewShelfScan,
  type ScanAttemptPolicy,
  type ScanAttemptRefusal,
  type ShelfScanPage,
  type ShelfScanPageQuery,
  type ShelfScanRecord,
  type ShelfScanRepositoryPort,
  type OwnerId,
  type ShelfScanTransitionFailure,
  type UploadQuotaPolicy,
} from '@pick-a-book/recognition-domain';
import { err, ok, unwrap, type Result } from '@pick-a-book/shared-result';
import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';

import { scanAttempts, shelfScans, uploads, type StoredDetectedBook } from './drizzle/schema.js';
import { refusalOf } from './drizzle/start-attempt.js';
import { uploadsToday } from './drizzle/upload-quota.js';
import {
  SHELF_PHOTO,
  SHELF_PHOTO_THUMBNAIL,
  toRecord,
  toStored,
  type ShelfScanRow,
} from './drizzle/shelf-scan-mapping.js';

/**
 * The key of the advisory lock that serialises reservations. Hashed by Postgres: one lock for
 * all of them, since the daily cap is what they contend on (research.md §8).
 */
const ATTEMPT_LOCK_NAME = 'pick-a-book/scan-attempts';

/** The thumbnail of a photo is a row of `uploads` too, so the join needs a name of its own. */
const thumbnails = alias(uploads, 'thumbnails');

/**
 * Keeps shelf scan records in Postgres (ADR 0006).
 *
 * The domain sees one `ShelfScanRecord`; the database holds several rows — the file reference in
 * the generic `uploads` table (the photo, and the thumbnail derived from it), the scan state in
 * `shelf_scans` (research.md §6, §8). This adapter is the only place that knows it: it writes
 * them in one transaction and joins them back.
 */
export class DrizzleShelfScanRepositoryAdapter implements ShelfScanRepositoryPort {
  private readonly db: NodePgDatabase;

  constructor(pool: Pool) {
    this.db = drizzle({ client: pool });
  }

  /**
   * A plain count, with no lock (research.md §13): the caller asks it before writing anything,
   * and an upload has no unit cost, so a few simultaneous ones past the cap do no harm.
   */
  async checkUploadQuota(
    ownerId: OwnerId,
    policy: UploadQuotaPolicy,
  ): Promise<Result<void, DailyUploadQuotaExceeded>> {
    const today = await uploadsToday(this.db, ownerId.value, policy.timeZone);

    return today >= policy.dailyLimit ? err(new DailyUploadQuotaExceeded(policy.dailyLimit)) : ok();
  }

  async createPending(scan: NewShelfScan): Promise<void> {
    // Dated here, in milliseconds, rather than by the database in microseconds: the cursor of
    // the history carries a JavaScript date, and a row it cannot compare exactly could be
    // skipped between two pages (research.md §4).
    const createdAt = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(uploads).values({
        id: scan.id.value,
        ownerId: scan.ownerId.value,
        type: SHELF_PHOTO,
        bucketKey: scan.photoBucketKey,
        mediaType: scan.photoMediaType,
        sizeBytes: scan.photoSizeBytes,
        originalFilename: scan.originalFilename,
        createdAt,
      });
      if (scan.thumbnail !== undefined) {
        await tx.insert(uploads).values({
          id: crypto.randomUUID(),
          ownerId: scan.ownerId.value,
          type: SHELF_PHOTO_THUMBNAIL,
          bucketKey: scan.thumbnail.bucketKey,
          mediaType: scan.thumbnail.mediaType,
          sizeBytes: scan.thumbnail.sizeBytes,
          originalFilename: null,
          sourceUploadId: scan.id.value,
          createdAt,
        });
      }
      await tx.insert(shelfScans).values({ uploadId: scan.id.value, status: 'pending' });
    });
  }

  async get(id: ShelfScanId): Promise<ShelfScanRecord | undefined> {
    const rows = await this.selectScans(eq(uploads.id, id.value));
    const row = rows.at(0);

    return row === undefined ? undefined : toRecord(row);
  }

  /**
   * One page, newest first. Reads `limit + 1` rows to know whether another page follows
   * without a second query; the cursor of the next page is the last scan of this one. The
   * comparison is on the pair (date, id), the same pair the order and the index use
   * (research.md §4), so a scan arriving meanwhile shifts nothing.
   */
  async list(query: ShelfScanPageQuery): Promise<ShelfScanPage> {
    const { after } = query;
    const owned = eq(uploads.ownerId, query.ownerId.value);
    const rows = await this.selectScans(
      after === undefined
        ? owned
        : and(
            owned,
            sql`(${uploads.createdAt}, ${uploads.id}) < (${after.createdAt}, ${after.id.value})`,
          ),
      query.limit + 1,
    );

    const records = rows.slice(0, query.limit).map((row) => toRecord(row));
    const last = records.at(-1);

    return {
      records,
      next: rows.length > query.limit && last !== undefined ? last : undefined,
    };
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
  ): Promise<Result<ScanAttemptId, ScanAttemptRefusal>> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ATTEMPT_LOCK_NAME}))`);

      const refusal = await refusalOf(tx, id, policy);
      if (refusal !== undefined) {
        return err(refusal);
      }
      const inserted = (
        await tx
          .insert(scanAttempts)
          .values({ uploadId: id.value })
          .returning({ id: scanAttempts.id })
      ).at(0);
      if (inserted === undefined) {
        throw new Error('The insert of the attempt of a scan returned no row');
      }

      return ok(unwrap(ScanAttemptId.of(inserted.id)));
    });
  }

  async markCompleted(
    id: ShelfScanId,
    attempt: ScanAttemptId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    return this.settle(id, attempt, {
      status: 'completed',
      detectedBooks: books.map((book) => toStored(book)),
    });
  }

  async markFailed(
    id: ShelfScanId,
    attempt: ScanAttemptId,
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    return this.settle(id, attempt, { status: 'failed', detectedBooks: null });
  }

  /**
   * The shelf photos matching a condition, each with its state and its thumbnail, newest first
   * (`desc nulls last`, as the index of the history is built). Never a thumbnail row on its own.
   */
  private async selectScans(where: SQL | undefined, limit?: number): Promise<ShelfScanRow[]> {
    const query = this.db
      .select({ upload: uploads, scan: shelfScans, thumbnail: thumbnails })
      .from(uploads)
      .innerJoin(shelfScans, eq(shelfScans.uploadId, uploads.id))
      .leftJoin(thumbnails, eq(thumbnails.sourceUploadId, uploads.id))
      .where(and(eq(uploads.type, SHELF_PHOTO), where))
      .orderBy(sql`${uploads.createdAt} desc nulls last`, sql`${uploads.id} desc nulls last`);

    return limit === undefined ? query : query.limit(limit);
  }

  /**
   * Moves a record that has no books yet — `pending`, or `failed` and run again — and only
   * that: the status condition is in the UPDATE itself, so two concurrent scans cannot both
   * record books. Zero rows updated then says which rule was broken — no record, or a record
   * that is already `completed` — as an `Err`:
   * both are outcomes the port declares (ADR 0013). The attempt that led here is closed in the
   * same transaction, whatever the outcome: it is over. That one, and no other: an analysis that
   * outlived its lease must not close the attempt of the one that started after it.
   */
  private async settle(
    id: ShelfScanId,
    attempt: ScanAttemptId,
    outcome: { status: 'completed' | 'failed'; detectedBooks: StoredDetectedBook[] | null },
  ): Promise<Result<void, ShelfScanTransitionFailure>> {
    const updated = await this.db.transaction(async (tx) => {
      const moved = await tx
        .update(shelfScans)
        .set(outcome)
        .where(
          and(eq(shelfScans.uploadId, id.value), inArray(shelfScans.status, ['pending', 'failed'])),
        )
        .returning({ id: shelfScans.id });
      await tx
        .update(scanAttempts)
        .set({ finishedAt: sql`now()` })
        .where(and(eq(scanAttempts.id, attempt.value), isNull(scanAttempts.finishedAt)));

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
