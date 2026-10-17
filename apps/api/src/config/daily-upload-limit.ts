import { readDailyLimit } from './daily-limit';

/**
 * How many photos a day the API accepts (specs/002-upload-history, FR-017) — the cap that bounds
 * the storage when access is open, whether or not they are ever analysed.
 *
 * The default is held in two places, here and in `infra/envs/prod` (`daily_upload_limit`), with
 * the same validation: the two are kept in step by hand, like `DAILY_SCAN_LIMIT`. It is twice the
 * cap on analyses, because every analysis follows an upload and the photos sent once that cap is
 * reached must still pass, to be run again the next day (research.md §13).
 */
export const DEFAULT_DAILY_UPLOAD_LIMIT = 100;

/** Reads the limit; a wrong value is added to `problems`, like the one of the analyses. */
export function readDailyUploadLimit(raw: string | undefined, problems: string[]): number {
  return readDailyLimit('DAILY_UPLOAD_LIMIT', raw, DEFAULT_DAILY_UPLOAD_LIMIT, problems);
}
