/**
 * Whose photos these are — the first segment of every bucket key
 * (`{ownerId}/shelf_photo/{id}`, specs/001-photo-upload research.md §10).
 *
 * A fixed value until there are user accounts; changing where it comes from will not move a
 * single object. Validated here rather than in the API's configuration: that it must be one
 * key segment is a rule of the recognition context, whoever supplies the value.
 */
export class OwnerId {
  private constructor(readonly value: string) {}

  static of(raw: string): OwnerId {
    const trimmed = raw.trim();

    if (trimmed.length === 0) {
      throw new Error('OwnerId: cannot be empty');
    }
    if (trimmed.includes('/') || trimmed === '.' || trimmed === '..') {
      throw new Error(`OwnerId: "${trimmed}" is not a single bucket key segment`);
    }

    return new OwnerId(trimmed);
  }

  equals(other: OwnerId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
