/**
 * A raw value that does not make a value object: an empty title, a score outside [0, 1], a
 * reference that is not a UUID. Returned by the fabrics of the value objects, never thrown
 * (ADR 0013).
 *
 * Declared here rather than imported from `recognition`: a context never imports another
 * (ADR 0010), and the two errors are only alike by shape.
 */
export class InvalidValue extends Error {
  readonly kind = 'invalid-value';

  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidValue';
  }
}
