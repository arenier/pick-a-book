import type { Result } from '@pick-a-book/shared-result';
import { describe, expectTypeOf, it } from 'vitest';

import type { DailyUploadQuotaExceeded } from './daily-upload-quota-exceeded.error.js';
import type { OwnerId } from '../owner/owner-id.js';
import type { ShelfScanRepositoryPort } from '../scan/shelf-scan-repository.port.js';
import type { UploadQuotaPolicy } from './upload-quota.js';

// The day's uploads are counted before anything is stored (specs/002-upload-history, FR-017,
// research.md §13): a caller cannot forget that the cap may be reached, and what it is told is in
// the type.
describe('ShelfScanRepositoryPort, the quota of uploads', () => {
  it('says in the result that the day is used up', () => {
    expectTypeOf<ShelfScanRepositoryPort['checkUploadQuota']>().toEqualTypeOf<
      (
        ownerId: OwnerId,
        policy: UploadQuotaPolicy,
      ) => Promise<Result<void, DailyUploadQuotaExceeded>>
    >();
  });

  it('is told the cap and the day it is counted over', () => {
    expectTypeOf<UploadQuotaPolicy['dailyLimit']>().toEqualTypeOf<number>();
    expectTypeOf<UploadQuotaPolicy['timeZone']>().toEqualTypeOf<'Europe/Paris'>();
  });
});
