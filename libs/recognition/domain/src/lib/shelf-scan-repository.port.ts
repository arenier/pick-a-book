import type { DetectedBook } from './detected-book.js';
import type { ShelfPhotoMediaType } from './shelf-photo.js';
import type { ShelfScanId } from './shelf-scan-id.js';

interface StoredShelfPhoto {
  readonly id: ShelfScanId;
  /** Owner segment of the bucket key — a fixed value until there are user accounts. */
  readonly ownerId: string;
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

/**
 * Outbound port that keeps shelf scan records (ADR 0006: Postgres).
 *
 * `markCompleted` and `markFailed` only ever move a `pending` record, and reject with
 * `ShelfScanAlreadyProcessed` otherwise: the transition is enforced where the write happens,
 * so two concurrent scans of the same photo cannot both record a result.
 */
export interface ShelfScanRepositoryPort {
  createPending(scan: NewShelfScan): Promise<void>;
  get(id: ShelfScanId): Promise<ShelfScanRecord | undefined>;
  markCompleted(id: ShelfScanId, books: readonly DetectedBook[]): Promise<void>;
  markFailed(id: ShelfScanId): Promise<void>;
}

/** Injection token for the port. */
export const SHELF_SCAN_REPOSITORY_PORT = 'ShelfScanRepositoryPort';
