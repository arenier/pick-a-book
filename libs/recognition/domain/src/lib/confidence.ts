import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

/**
 * The confidence attached to a detection, in [0, 1].
 *
 * ADR 0005 requires the port to expose a confidence per detected book, so that
 * orchestration can drop or flag weak detections. It is not calibrated: it is the
 * model's own self-assessment, and should be treated as such.
 */
export class Confidence {
  private constructor(readonly value: number) {}

  static of(raw: number): Result<Confidence, InvalidValue> {
    if (!Number.isFinite(raw)) {
      return err(new InvalidValue(`Confidence: not a number (${raw})`));
    }
    if (raw < 0 || raw > 1) {
      return err(new InvalidValue(`Confidence: value outside [0, 1] (${raw})`));
    }

    return ok(new Confidence(raw));
  }

  isAtLeast(threshold: Confidence): boolean {
    return this.value >= threshold.value;
  }
}
