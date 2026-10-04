import type { Result } from '@pick-a-book/shared-result';

import type { DetectedBook } from './detected-book.js';
import type { OwnerId } from './owner-id.js';
import type { ScanAttemptId } from './scan-attempt-id.js';
import type {
  ScanAttemptPolicy,
  ScanAttemptRefusal,
  ShelfScanTransitionFailure,
} from './scan-attempt.js';
import type { ShelfPhotoMediaType } from './shelf-photo.js';
import type { ThumbnailMediaType } from './shelf-photo-thumbnail.js';
import type { ShelfScanId } from './shelf-scan-id.js';
import type { DailyUploadQuotaExceeded } from './daily-upload-quota-exceeded.error.js';
import type { UploadQuotaPolicy } from './upload-quota.js';

/**
 * The reference of the thumbnail the browser made of a photo (specs/002-upload-history,
 * research.md §5, §6): where it is in the bucket and what it is. Its id is the photo's — a
 * thumbnail has no identity of its own outside `infrastructure`.
 */
export interface StoredThumbnail {
  readonly bucketKey: string;
  readonly mediaType: ThumbnailMediaType;
  readonly sizeBytes: number;
}

interface StoredShelfPhoto {
  readonly id: ShelfScanId;
  /** Owner segment of the bucket key — a fixed value until there are user accounts. */
  readonly ownerId: OwnerId;
  readonly photoBucketKey: string;
  readonly photoMediaType: ShelfPhotoMediaType;
  readonly photoSizeBytes: number;
  /**
   * The file name the browser sent, kept for reference only: it names nothing and is never
   * returned over HTTP (FR-015).
   */
  readonly originalFilename: string;
  /** When the photo was stored — not when its scan ended. */
  readonly createdAt: Date;
  /**
   * The thumbnail, if a valid one came with the photo. Absent for every scan sent before
   * thumbnails, and for a photo the browser could not shrink.
   */
  readonly thumbnail: StoredThumbnail | undefined;
}

/**
 * The durable trace of a submitted shelf photo (US3, FR-011).
 *
 * Created `pending` as soon as the photo is stored, then moved to `completed` or `failed` when the
 * scanner has answered. `failed` can be run again — it moves to `completed`, or stays `failed` —
 * but `completed` is final: a photo never carries two results (specs/002-upload-history, FR-011).
 * A discriminated union rather than an optional list: detected books exist if and only if the scan
 * completed, and an empty list means "no book on the shelf", never "not scanned yet".
 */
export type ShelfScanRecord = StoredShelfPhoto &
  (
    | { readonly status: 'pending'; readonly detectedBooks: undefined }
    | { readonly status: 'completed'; readonly detectedBooks: readonly DetectedBook[] }
    | { readonly status: 'failed'; readonly detectedBooks: undefined }
  );

/**
 * What it takes to create a pending record: everything the scan has not decided yet. The
 * thumbnail is the one thing it may go without.
 */
export type NewShelfScan = Omit<StoredShelfPhoto, 'createdAt' | 'thumbnail'> & {
  readonly thumbnail?: StoredThumbnail;
};

/**
 * A position in the history: the date of the last scan seen, and its id to tell apart two scans
 * sent at the same instant. A cursor, not an offset, so that a scan arriving while the user
 * scrolls neither skips nor repeats one (research.md §4).
 */
export interface ShelfScanCursor {
  readonly createdAt: Date;
  readonly id: ShelfScanId;
}

export interface ShelfScanPageQuery {
  readonly ownerId: OwnerId;
  /** How many scans at most; validated, in 1..50, by the use case. */
  readonly limit: number;
  /** Where the previous page ended; absent for the first page. */
  readonly after: ShelfScanCursor | undefined;
}

export interface ShelfScanPage {
  /** Newest first — by date, then by id. */
  readonly records: readonly ShelfScanRecord[];
  /** Where this page ended, or absent on the last one. */
  readonly next: ShelfScanCursor | undefined;
}

/**
 * Outbound port that keeps shelf scan records (ADR 0006: Postgres).
 *
 * `markCompleted` and `markFailed` only ever move a record that has no books yet — `pending`, or
 * `failed` and run again — and answer `ShelfScanAlreadyProcessed` otherwise: the transition is
 * enforced where the write happens, so two concurrent scans of the same photo cannot both record
 * books. A database that is
 * down is not part of that vocabulary: the promise rejects, and the global HTTP filter of
 * `apps/api` catches it (ADR 0013).
 *
 * `startAttempt` reserves an analysis, atomically, before the scanner is called: it is what
 * enforces the daily cap and keeps two analyses of one scan from running at once
 * (specs/002-upload-history, research.md §8) and answers the id of the attempt; `markCompleted` and
 * `markFailed` close that attempt, and only that one: an analysis that outlived its lease must not
 * close the attempt of the one that started after it.
 */
export interface ShelfScanRepositoryPort {
  /**
   * Whether the owner may still send a photo today (specs/002-upload-history, FR-017). Asked
   * **before** anything is written — a refusal leaves no object behind — and a plain count, with no
   * lock: an upload has no unit cost, so a few simultaneous ones past the cap are acceptable
   * (research.md §13).
   */
  checkUploadQuota(
    ownerId: OwnerId,
    policy: UploadQuotaPolicy,
  ): Promise<Result<void, DailyUploadQuotaExceeded>>;
  createPending(scan: NewShelfScan): Promise<void>;
  get(id: ShelfScanId): Promise<ShelfScanRecord | undefined>;
  /** One page of an owner's scans, newest first. Reads only. */
  list(query: ShelfScanPageQuery): Promise<ShelfScanPage>;
  startAttempt(
    id: ShelfScanId,
    policy: ScanAttemptPolicy,
  ): Promise<Result<ScanAttemptId, ScanAttemptRefusal>>;
  markCompleted(
    id: ShelfScanId,
    attempt: ScanAttemptId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>>;
  markFailed(
    id: ShelfScanId,
    attempt: ScanAttemptId,
  ): Promise<Result<void, ShelfScanTransitionFailure>>;
}

/** Injection token for the port. */
export const SHELF_SCAN_REPOSITORY_PORT = 'ShelfScanRepositoryPort';
