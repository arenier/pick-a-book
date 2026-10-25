import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Identifier of an analysis, as `recognition` knows it, kept here as an opaque reference: this
 * context never reads the other one's tables (specs/003, research §4).
 */
export class ScanRef {
  private constructor(readonly value: string) {}

  static of(raw: string): Result<ScanRef, InvalidValue> {
    const normalised = raw.toLowerCase();
    if (!UUID.test(normalised)) {
      return err(new InvalidValue(`ScanRef: not a UUID (${raw})`));
    }

    return ok(new ScanRef(normalised));
  }

  equals(other: ScanRef): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
