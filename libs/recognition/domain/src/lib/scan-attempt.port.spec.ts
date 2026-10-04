import type { Result } from '@pick-a-book/shared-result';
import { describe, expectTypeOf, it } from 'vitest';

import type { DailyScanQuotaExceeded } from './daily-scan-quota-exceeded.error.js';
import type { ScanAttemptId } from './scan-attempt-id.js';
import type { ShelfScanAlreadyProcessed } from './shelf-scan-already-processed.error.js';
import type { ShelfScanId } from './shelf-scan-id.js';
import type { ShelfScanInProgress } from './shelf-scan-in-progress.error.js';
import type { ShelfScanNotFound } from './shelf-scan-not-found.error.js';
import type { ScanAttemptPolicy, ScanAttemptRefusal } from './scan-attempt.js';
import type { ShelfScanRepositoryPort } from './shelf-scan-repository.port.js';

// An analysis is reserved before the scanner is called (specs/002-upload-history, research.md
// §8). What can refuse it is in the type: a caller cannot forget that the day's analyses may be
// used up, or that another one is running.
describe('ShelfScanRepositoryPort, reserving an attempt', () => {
  it('says in the result why an analysis could not start', () => {
    expectTypeOf<ScanAttemptRefusal>().toEqualTypeOf<
      ShelfScanNotFound | ShelfScanAlreadyProcessed | ShelfScanInProgress | DailyScanQuotaExceeded
    >();
    expectTypeOf<ShelfScanRepositoryPort['startAttempt']>().toEqualTypeOf<
      (
        id: ShelfScanId,
        policy: ScanAttemptPolicy,
      ) => Promise<Result<ScanAttemptId, ScanAttemptRefusal>>
    >();
  });

  it('is told the cap, the day it is counted over and the lease of an attempt', () => {
    expectTypeOf<ScanAttemptPolicy['dailyLimit']>().toEqualTypeOf<number>();
    expectTypeOf<ScanAttemptPolicy['timeZone']>().toEqualTypeOf<'Europe/Paris'>();
    expectTypeOf<ScanAttemptPolicy['lease']>().toEqualTypeOf<number>();
  });
});
