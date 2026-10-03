import type { Result } from '@pick-a-book/shared-result';

import type { DailyScanQuotaExceeded } from './daily-scan-quota-exceeded.error.js';
import type { DetectedBook } from './detected-book.js';
import type { OwnerId } from './owner-id.js';
import type { ShelfPhotoMediaType } from './shelf-photo.js';
import type { ShelfScanAlreadyProcessed } from './shelf-scan-already-processed.error.js';
import type { ShelfScanId } from './shelf-scan-id.js';
import type { ShelfScanInProgress } from './shelf-scan-in-progress.error.js';
import type { ShelfScanNotFound } from './shelf-scan-not-found.error.js';

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
}

/**
 * The durable trace of a submitted shelf photo (US3, FR-011).
 *
 * Created `pending` as soon as the photo is stored, then moved once — and only once — to
 * `completed` or `failed` when the scanner has answered. A discriminated union rather than
 * an optional list: detected books exist if and only if the scan completed, and an empty list
 * means "no book on the shelf", never "not scanned yet".
 */
export type ShelfScanRecord = StoredShelfPhoto &
  (
    | { readonly status: 'pending'; readonly detectedBooks: undefined }
    | { readonly status: 'completed'; readonly detectedBooks: readonly DetectedBook[] }
    | { readonly status: 'failed'; readonly detectedBooks: undefined }
  );

/** What it takes to create a pending record: everything the scan has not decided yet. */
export type NewShelfScan = Omit<StoredShelfPhoto, 'createdAt'>;

/** Why a record could not move: it does not exist, or it already has an outcome. */
export type ShelfScanTransitionFailure = ShelfScanNotFound | ShelfScanAlreadyProcessed;

/**
 * Why an analysis was not allowed to start, in the order the port checks them: the scan does
 * not exist, it already has a result, another analysis of it is running, the day's analyses
 * are used up.
 */
export type ScanAttemptRefusal =
  | ShelfScanNotFound
  | ShelfScanAlreadyProcessed
  | ShelfScanInProgress
  | DailyScanQuotaExceeded;

/** What `startAttempt` enforces, handed over by the composition root (`DAILY_SCAN_LIMIT`). */
export interface ScanAttemptPolicy {
  /** Analyses allowed per day, uploads and re-scans together (FR-015). */
  readonly dailyLimit: number;
  /** Where the day starts: « tomorrow » is read at the user's midnight, not UTC's. */
  readonly timeZone: 'Europe/Paris';
  /** Milliseconds an open attempt blocks another analysis of the same scan. */
  readonly lease: number;
}

/**
 * Outbound port that keeps shelf scan records (ADR 0006: Postgres).
 *
 * `markCompleted` and `markFailed` only ever move a record that has no result yet, and answer
 * `ShelfScanAlreadyProcessed` otherwise: the transition is enforced where the write happens,
 * so two concurrent scans of the same photo cannot both record a result. A database that is
 * down is not part of that vocabulary: the promise rejects, and the global HTTP filter of
 * `apps/api` catches it (ADR 0013).
 *
 * `startAttempt` reserves an analysis, atomically, before the scanner is called: it is what
 * enforces the daily cap and keeps two analyses of one scan from running at once
 * (specs/002-upload-history, research.md §8). `markCompleted` and `markFailed` close it.
 */
export interface ShelfScanRepositoryPort {
  createPending(scan: NewShelfScan): Promise<void>;
  get(id: ShelfScanId): Promise<ShelfScanRecord | undefined>;
  startAttempt(
    id: ShelfScanId,
    policy: ScanAttemptPolicy,
  ): Promise<Result<void, ScanAttemptRefusal>>;
  markCompleted(
    id: ShelfScanId,
    books: readonly DetectedBook[],
  ): Promise<Result<void, ShelfScanTransitionFailure>>;
  markFailed(id: ShelfScanId): Promise<Result<void, ShelfScanTransitionFailure>>;
}

/** Injection token for the port. */
export const SHELF_SCAN_REPOSITORY_PORT = 'ShelfScanRepositoryPort';
