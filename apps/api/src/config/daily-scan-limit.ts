import { readDailyLimit } from './daily-limit';

/**
 * How many analyses a day the API allows, uploads and re-scans together (specs/002-upload-history,
 * FR-015) — the cap that bounds the bill when access is open.
 *
 * The default is held in two places, here and in `infra/envs/prod` (`daily_scan_limit`), with the
 * same validation: the two are kept in step by hand, like the Node pins.
 */
export const DEFAULT_DAILY_SCAN_LIMIT = 50;

/**
 * Reads the limit, falling back to the default when the variable is absent. A wrong value is
 * added to `problems` — startup lists them all.
 */
export function readDailyScanLimit(raw: string | undefined, problems: string[]): number {
  return readDailyLimit('DAILY_SCAN_LIMIT', raw, DEFAULT_DAILY_SCAN_LIMIT, problems);
}
