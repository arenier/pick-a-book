import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Identity of one reserved analysis of a scan (specs/002-upload-history, research.md §8).
 *
 * `startAttempt` hands it over and `markCompleted` / `markFailed` take it back: an analysis closes
 * its own attempt and no other, so one that outlived its lease cannot close the attempt of the
 * analysis that started after it.
 */
export class ScanAttemptId {
  private constructor(readonly value: string) {}

  static of(raw: string): Result<ScanAttemptId, InvalidValue> {
    const normalised = raw.toLowerCase();
    if (!UUID.test(normalised)) {
      return err(new InvalidValue(`ScanAttemptId: not a UUID (${raw})`));
    }

    return ok(new ScanAttemptId(normalised));
  }

  static generate(): ScanAttemptId {
    return new ScanAttemptId(crypto.randomUUID());
  }

  equals(other: ScanAttemptId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
