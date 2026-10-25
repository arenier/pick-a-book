import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

/** How sure the retained book is, in [0, 1] (research §5.8). Kept apart from the reading confidence: the two are never combined (FR-021). */
export class ReconciliationScore {
  private constructor(readonly value: number) {}

  static of(raw: number): Result<ReconciliationScore, InvalidValue> {
    if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
      return err(new InvalidValue(`ReconciliationScore: expected a number in [0, 1] (${raw})`));
    }

    return ok(new ReconciliationScore(raw));
  }

  /**
   * A score the domain has just computed: floating point can leave 1.0000000000000002 or a
   * NaN from an empty comparison, so it is brought back into [0, 1] rather than refused.
   */
  static fromComputed(raw: number): ReconciliationScore {
    if (Number.isNaN(raw)) {
      return new ReconciliationScore(0);
    }

    return new ReconciliationScore(Math.min(1, Math.max(0, raw)));
  }

  equals(other: ReconciliationScore): boolean {
    return this.value === other.value;
  }
}
