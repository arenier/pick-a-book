import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

const MAX_LENGTH = 200;

/** The stable identifier of a catalogue record: the ARK for the BnF. */
export class CatalogRecordId {
  private constructor(readonly value: string) {}

  static of(raw: string): Result<CatalogRecordId, InvalidValue> {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return err(new InvalidValue('CatalogRecordId: cannot be empty'));
    }
    if (trimmed.length > MAX_LENGTH) {
      return err(
        new InvalidValue(
          `CatalogRecordId: too long (${trimmed.length} characters, ${MAX_LENGTH} at most)`,
        ),
      );
    }

    return ok(new CatalogRecordId(trimmed));
  }

  equals(other: CatalogRecordId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
