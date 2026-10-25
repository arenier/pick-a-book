import { err, ok, type Result } from '@pick-a-book/shared-result';

import { InvalidValue } from './invalid-value.error.js';

const NAME = /^[a-z0-9-]+$/u;

/** The name of the catalogue that answered (`bnf`, `stub`, `offline`), kept with each attempt. */
export class CatalogName {
  private constructor(readonly value: string) {}

  static of(raw: string): Result<CatalogName, InvalidValue> {
    if (!NAME.test(raw)) {
      return err(new InvalidValue(`CatalogName: expected [a-z0-9-]+ (${raw})`));
    }

    return ok(new CatalogName(raw));
  }

  equals(other: CatalogName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
