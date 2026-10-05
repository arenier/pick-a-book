/**
 * The day's uploads are used up: the photo is not kept — nothing is written — and the user can
 * send it again once the day has turned (specs/002-upload-history, FR-017) — a 429 over HTTP.
 */
export class DailyUploadQuotaExceeded extends Error {
  readonly kind = 'daily-upload-quota-exceeded';

  constructor(readonly limit: number) {
    super(`Daily upload quota exceeded: ${limit} uploads a day at most`);
    this.name = 'DailyUploadQuotaExceeded';
  }
}
