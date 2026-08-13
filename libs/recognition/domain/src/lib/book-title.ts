/**
 * A title as read off a book spine, before any reconciliation.
 *
 * Value object: validated on construction (ADR 0002).
 */
export class BookTitle {
  private constructor(readonly value: string) {}

  static of(raw: string): BookTitle {
    const trimmed = raw.trim().replaceAll(/\s+/gu, ' ');

    if (trimmed.length === 0) {
      throw new Error('BookTitle: the title read cannot be empty');
    }
    if (trimmed.length > 500) {
      throw new Error(`BookTitle: title too long (${trimmed.length} characters, 500 at most)`);
    }

    return new BookTitle(trimmed);
  }

  equals(other: BookTitle): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
