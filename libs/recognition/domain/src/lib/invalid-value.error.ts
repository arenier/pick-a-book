/**
 * A raw value that does not make a value object: an empty name, a confidence outside [0, 1],
 * an id that is not a UUID. Returned by the fabrics of the value objects, never thrown
 * (ADR 0013).
 *
 * One error for all of them: no caller tells one kind of invalid value from another — the
 * reason is for a human. A photo refused for its own reasons keeps its dedicated
 * `InvalidShelfPhoto`, because HTTP maps it.
 */
export class InvalidValue extends Error {
  readonly kind = 'invalid-value';

  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidValue';
  }
}
