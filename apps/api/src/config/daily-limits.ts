import { readDailyScanLimit } from './daily-scan-limit';
import { readDailyUploadLimit } from './daily-upload-limit';

/**
 * The two caps of the day: analyses (FR-015) and uploads (FR-017). A wrong value of either is
 * added to `problems`.
 */
export function readDailyLimits(
  read: (name: string) => string | undefined,
  problems: string[],
): { readonly dailyScanLimit: number; readonly dailyUploadLimit: number } {
  return {
    dailyScanLimit: readDailyScanLimit(read('DAILY_SCAN_LIMIT'), problems),
    dailyUploadLimit: readDailyUploadLimit(read('DAILY_UPLOAD_LIMIT'), problems),
  };
}
