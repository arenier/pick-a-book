/**
 * How many analyses a day the API allows, uploads and re-scans together (specs/002-upload-history,
 * FR-015) — the cap that bounds the bill when access is open.
 *
 * The default is held in two places, here and in `infra/envs/prod` (`daily_scan_limit`), with the
 * same validation: the two are kept in step by hand, like the Node pins.
 */
export const DEFAULT_DAILY_SCAN_LIMIT = 50;

/** Digits only: « 1.5 », « -3 » and « 1e2 » are mistakes, not numbers to be forgiven. */
const POSITIVE_INTEGER = /^\d+$/u;

/**
 * Reads the limit, falling back to the default when the variable is absent. A wrong value is
 * added to `problems` — startup lists them all — and the default is returned in its place: it
 * never escapes, a non-empty `problems` throws before the caller returns.
 */
export function readDailyScanLimit(raw: string | undefined, problems: string[]): number {
  if (raw === undefined) {
    return DEFAULT_DAILY_SCAN_LIMIT;
  }

  const limit = POSITIVE_INTEGER.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    problems.push(`DAILY_SCAN_LIMIT is "${raw}" — expected a positive integer`);
    return DEFAULT_DAILY_SCAN_LIMIT;
  }

  return limit;
}
