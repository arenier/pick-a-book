/**
 * An author name as read off a book spine.
 *
 * Value object: validated on construction, never a bare string inside the domain
 * (ADR 0002). This is not an author from the bibliographic reference — reconciliation
 * happens downstream and belongs to another context.
 */
export class Author {
  private constructor(readonly value: string) {}

  static of(raw: string): Author {
    const trimmed = raw.trim().replace(/\s+/g, ' ');

    if (trimmed.length === 0) {
      throw new Error('Author: the name read cannot be empty');
    }
    if (trimmed.length > 200) {
      throw new Error(`Author: name too long (${trimmed.length} characters, 200 at most)`);
    }

    return new Author(trimmed);
  }

  equals(other: Author): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
