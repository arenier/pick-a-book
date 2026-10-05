import type { DailyScanQuotaExceeded } from './daily-scan-quota-exceeded.error.js';
import type { ShelfScanAlreadyProcessed } from '../scan/shelf-scan-already-processed.error.js';
import type { ShelfScanInProgress } from './shelf-scan-in-progress.error.js';
import type { ShelfScanNotFound } from '../scan/shelf-scan-not-found.error.js';

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
