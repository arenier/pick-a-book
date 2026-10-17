/** Digits only: « 1.5 », « -3 » and « 1e2 » are mistakes, not numbers to be forgiven. */
const POSITIVE_INTEGER = /^\d+$/u;

/**
 * Reads a per-day limit, falling back to the default when the variable is absent. A wrong value
 * is added to `problems` — startup lists them all — and the default is returned in its place: it
 * never escapes, a non-empty `problems` throws before the caller returns.
 */
export function readDailyLimit(
  name: string,
  raw: string | undefined,
  fallback: number,
  problems: string[],
): number {
  if (raw === undefined) {
    return fallback;
  }

  const limit = POSITIVE_INTEGER.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    problems.push(`${name} is "${raw}" — expected a positive integer`);
    return fallback;
  }

  return limit;
}
