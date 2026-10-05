/**
 * The day's analyses are used up: the scanner is not called, the photo stays kept and can be
 * re-run from the history once the day has turned (specs/002-upload-history, FR-015) — a 429
 * over HTTP.
 */
export class DailyScanQuotaExceeded extends Error {
  readonly kind = 'daily-scan-quota-exceeded';

  constructor(readonly limit: number) {
    super(`Daily scan quota exceeded: ${limit} analyses a day at most`);
    this.name = 'DailyScanQuotaExceeded';
  }
}
