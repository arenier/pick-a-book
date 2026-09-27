/**
 * The image is not a shelf photo the recognition accepts: empty, too large, or of an
 * unsupported media type. The caller's mistake — a 400 over HTTP — as opposed to a bucket or
 * a database failing, which is not.
 */
export class InvalidShelfPhoto extends Error {
  constructor(reason: string) {
    super(`ShelfPhoto: ${reason}`);
    this.name = 'InvalidShelfPhoto';
  }
}
