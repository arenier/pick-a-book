import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from '../invalid-value.error.js';

/**
 * A title as read off a book spine, before any reconciliation.
 *
 * Value object: validated on construction (ADR 0002).
 */
export class BookTitle {
  private constructor(readonly value: string) {}

  static of(raw: string): Result<BookTitle, InvalidValue> {
    const trimmed = raw.trim().replaceAll(/\s+/gu, ' ');

    if (trimmed.length === 0) {
      return err(new InvalidValue('BookTitle: the title read cannot be empty'));
    }
    if (trimmed.length > 500) {
      return err(
        new InvalidValue(`BookTitle: title too long (${trimmed.length} characters, 500 at most)`),
      );
    }

    return ok(new BookTitle(trimmed));
  }

  equals(other: BookTitle): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
