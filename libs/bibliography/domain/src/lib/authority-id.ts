import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

const MAX_LENGTH = 200;

/** The identifier of the authority record of an author in the catalogue. */
export class AuthorityId {
  private constructor(readonly value: string) {}

  static of(raw: string): Result<AuthorityId, InvalidValue> {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return err(new InvalidValue('AuthorityId: cannot be empty'));
    }
    if (trimmed.length > MAX_LENGTH) {
      return err(
        new InvalidValue(
          `AuthorityId: too long (${trimmed.length} characters, ${MAX_LENGTH} at most)`,
        ),
      );
    }

    return ok(new AuthorityId(trimmed));
  }

  equals(other: AuthorityId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
