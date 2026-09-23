import type { DetectedBook } from '../model/detected-book';
import type { UploadState } from '../model/upload-state';

/**
 * Origin of the API. Inlined by Vite at build time: the frontend is served as static files
 * from a bucket (ADR 0004), with no server left to proxy anything at runtime.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const UNEXPECTED_ERROR = 'Une erreur inattendue est survenue. Réessayez dans quelques instants.';

export interface SubmitOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

/**
 * Sends a shelf photo and resolves with what the screen should show next — never rejects.
 *
 * Two requests behind one call (research.md §7): `POST /shelf-photos` keeps the photo and
 * answers with its id, then `POST /shelf-photos/{id}/scan` reads it. The screen does not
 * know there are two; it gets a result or a message.
 */
export async function submitShelfPhoto(
  photo: File,
  options: SubmitOptions = {},
): Promise<UploadState> {
  const baseUrl = options.baseUrl ?? API_BASE_URL;
  const send = options.fetch ?? fetch;

  const form = new FormData();
  form.append('photo', photo);

  const stored = await send(`${baseUrl}/shelf-photos`, { method: 'POST', body: form });
  const storedBody: unknown = await stored.json();
  if (!stored.ok || !isStoredPhoto(storedBody)) {
    return { status: 'error', message: UNEXPECTED_ERROR };
  }

  const scanned = await send(`${baseUrl}/shelf-photos/${encodeURIComponent(storedBody.id)}/scan`, {
    method: 'POST',
  });
  const scannedBody: unknown = await scanned.json();
  if (!scanned.ok || !isScanResult(scannedBody)) {
    return { status: 'error', message: UNEXPECTED_ERROR };
  }

  return { status: 'success', books: scannedBody.books.map((book) => toDetectedBook(book)) };
}

interface WireBook {
  readonly author?: unknown;
  readonly title: string;
  readonly confidence: number;
}

// The JSON of a response is `unknown` until proven otherwise: guards, never a cast.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoredPhoto(value: unknown): value is { readonly id: string } {
  return isRecord(value) && typeof value['id'] === 'string';
}

function isWireBook(value: unknown): value is WireBook {
  return (
    isRecord(value) &&
    typeof value['title'] === 'string' &&
    typeof value['confidence'] === 'number' &&
    (value['author'] === undefined || typeof value['author'] === 'string')
  );
}

function isScanResult(value: unknown): value is { readonly books: readonly WireBook[] } {
  return (
    isRecord(value) &&
    Array.isArray(value['books']) &&
    value['books'].every((book: unknown) => isWireBook(book))
  );
}

function toDetectedBook(book: WireBook): DetectedBook {
  return {
    author: typeof book.author === 'string' ? book.author : undefined,
    title: book.title,
    confidence: book.confidence,
  };
}
