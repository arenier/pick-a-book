/** What `checkUploadQuota` enforces, handed over by the composition root (`DAILY_UPLOAD_LIMIT`). */
export interface UploadQuotaPolicy {
  /** Uploads allowed per day (FR-017). */
  readonly dailyLimit: number;
  /** Where the day starts: « tomorrow » is read at the user's midnight, not UTC's. */
  readonly timeZone: 'Europe/Paris';
}
