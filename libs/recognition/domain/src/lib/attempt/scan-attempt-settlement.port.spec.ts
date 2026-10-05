import type { Result } from '@pick-a-book/shared-result';
import { describe, expectTypeOf, it } from 'vitest';

import type { DetectedBook } from '../detection/detected-book.js';
import type { ScanAttemptId } from './scan-attempt-id.js';
import type { ShelfScanId } from '../scan/shelf-scan-id.js';
import type {
  ShelfScanRepositoryPort,
  ShelfScanTransitionFailure,
} from '../scan/shelf-scan-repository.port.js';

// An analysis settles its own attempt (specs/002-upload-history, research.md §8): the attempt
// `startAttempt` handed over is what `markCompleted` and `markFailed` ask for back, so that one
// analysis cannot close the attempt of another.
describe('ShelfScanRepositoryPort, settling an attempt', () => {
  // The two transitions say what can go wrong in their type: a caller cannot ignore that the
  // record was missing, or already settled. A database that is down is not modelled — it
  // rejects, and the global HTTP filter catches it (ADR 0013).
  it('reports a missing or settled record in the result of a transition', () => {
    type Outcome = Promise<Result<void, ShelfScanTransitionFailure>>;

    expectTypeOf<ShelfScanRepositoryPort['markCompleted']>().toEqualTypeOf<
      (id: ShelfScanId, attempt: ScanAttemptId, books: readonly DetectedBook[]) => Outcome
    >();
    expectTypeOf<ShelfScanRepositoryPort['markFailed']>().toEqualTypeOf<
      (id: ShelfScanId, attempt: ScanAttemptId) => Outcome
    >();
  });
});
