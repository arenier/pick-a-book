import type { DetectedBookDto } from './scan-shelf.dto.js';

/**
 * Boundary DTOs of the history (specs/002-upload-history, data-model.md): what the controller
 * returns, plain data and never a domain object (ADR 0003). None carries the original file name,
 * the key in the bucket or the owner (FR-009).
 */

/** How an analysis ended — `pending` is « not started » to the user (FR-005). */
export type ShelfScanOutcomeDto = 'completed' | 'failed' | 'pending';

export interface ShelfScanSummaryDto {
  readonly id: string;
  /** ISO 8601. */
  readonly createdAt: string;
  readonly outcome: ShelfScanOutcomeDto;
  /** Present if and only if `outcome` is `completed`; 0 means « no book detected ». */
  readonly bookCount?: number;
  readonly hasThumbnail: boolean;
}

export interface ShelfScanPageDto {
  readonly items: readonly ShelfScanSummaryDto[];
  /** Opaque — hand it back to get the next page. `null` on the last one. */
  readonly nextCursor: string | null;
}

export interface ShelfScanDetailDto {
  readonly id: string;
  readonly createdAt: string;
  readonly outcome: ShelfScanOutcomeDto;
  /** Present if and only if `outcome` is `completed`, in the order the analysis gave them. */
  readonly books?: readonly DetectedBookDto[];
  readonly hasThumbnail: boolean;
}

/** An image read back from the bucket, to be served as it is. */
export interface StoredImageDto {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

export interface GetShelfScanCommand {
  /** As received — possibly not even a UUID, which reads as an unknown scan. */
  readonly id: string;
}

export interface GetShelfPhotoImageCommand {
  /** As received — possibly not even a UUID, which reads as an unknown scan. */
  readonly id: string;
  /** The photo as it was sent, or the thumbnail made of it. */
  readonly kind: 'photo' | 'thumbnail';
}

export interface ListShelfScansCommand {
  /** How many scans at most. Absent: 20. Anything but a whole number from 1 to 50 is refused. */
  readonly limit?: number;
  /** The `nextCursor` of the previous page. Absent: the first page. */
  readonly cursor?: string;
}
