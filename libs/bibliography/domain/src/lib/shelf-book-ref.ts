import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';
import type { ScanRef } from './scan-ref.js';

/**
 * A detected book, designated by its analysis and its index in the list of books of that
 * analysis. The list of a completed analysis is frozen, so the position is stable (research §4).
 */
export class ShelfBookRef {
  private constructor(
    readonly scanRef: ScanRef,
    readonly position: number,
  ) {}

  static of(scanRef: ScanRef, position: number): Result<ShelfBookRef, InvalidValue> {
    if (!Number.isInteger(position) || position < 0) {
      return err(new InvalidValue(`ShelfBookRef: position must be an integer >= 0 (${position})`));
    }

    return ok(new ShelfBookRef(scanRef, position));
  }

  equals(other: ShelfBookRef): boolean {
    return this.scanRef.equals(other.scanRef) && this.position === other.position;
  }

  toString(): string {
    return `${this.scanRef.value}#${this.position}`;
  }
}
