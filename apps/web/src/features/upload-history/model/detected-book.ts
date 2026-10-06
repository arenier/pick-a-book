/**
 * A book detected on a photo, as `GET /shelf-photos/{id}` returns it (specs/002-upload-history,
 * contracts §2).
 *
 * A local copy of the API contract, and of the one `photo-upload` keeps, on purpose: a slice does
 * not import another, and two consumers do not justify a shared lib yet (research.md §11).
 */
export interface DetectedBook {
  /** Absent when the spine carried no readable author — never shown as an empty string. */
  readonly author: string | undefined;
  readonly title: string;
  /** Carried for fidelity to the contract; the history does not display it. */
  readonly confidence: number;
}

/** A book of a response, as it travels (contracts §2). */
export interface WireBook {
  readonly author?: unknown;
  readonly title: string;
  readonly confidence: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isWireBook(value: unknown): value is WireBook {
  return (
    isRecord(value) &&
    typeof value['title'] === 'string' &&
    typeof value['confidence'] === 'number' &&
    (value['author'] === undefined || typeof value['author'] === 'string')
  );
}

export function toDetectedBook(book: WireBook): DetectedBook {
  return {
    author: typeof book.author === 'string' ? book.author : undefined,
    title: book.title,
    confidence: book.confidence,
  };
}
