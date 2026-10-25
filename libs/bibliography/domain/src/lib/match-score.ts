import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

/** How well a record matches what was read, in [0, 1]. */
export class MatchScore {
  private constructor(readonly value: number) {}

  static of(raw: number): Result<MatchScore, InvalidValue> {
    if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
      return err(new InvalidValue(`MatchScore: expected a number in [0, 1] (${raw})`));
    }

    return ok(new MatchScore(raw));
  }

  /**
   * A score the domain has just computed: floating point can leave 1.0000000000000002 or a
   * NaN from an empty comparison, so it is brought back into [0, 1] rather than refused.
   */
  static fromComputed(raw: number): MatchScore {
    if (Number.isNaN(raw)) {
      return new MatchScore(0);
    }

    return new MatchScore(Math.min(1, Math.max(0, raw)));
  }

  equals(other: MatchScore): boolean {
    return this.value === other.value;
  }
}
