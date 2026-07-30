import type { DetectedBook } from './detected-book.js';
import type { ShelfPhoto } from './shelf-photo.js';

/**
 * Outbound port of the recognition context (ADR 0005).
 *
 * The MVP implements it with a VLM alone (option B). Moving to option C — OCR injected
 * into the prompt, tokens absent from the OCR text rejected — is a matter of swapping in
 * a composite adapter: domain, application and frontend are indifferent to the choice.
 *
 * The implementation throws `ShelfScanFailed` when the source is unavailable or answers
 * off-contract. A photo with no readable book is not an error: it is an empty array.
 */
export interface ShelfScannerPort {
  scan(photo: ShelfPhoto): Promise<DetectedBook[]>;
}

/**
 * Injection token for the port.
 *
 * A string, not a decorator: the domain depends on no injection container. It is the
 * composition root of `apps/api` that uses it to bind the port to an adapter.
 */
export const SHELF_SCANNER_PORT = 'ShelfScannerPort';

export class ShelfScanFailed extends Error {
  constructor(reason: string, options?: { cause?: unknown }) {
    super(`Shelf scan failed: ${reason}`, options);
    this.name = 'ShelfScanFailed';
  }
}
