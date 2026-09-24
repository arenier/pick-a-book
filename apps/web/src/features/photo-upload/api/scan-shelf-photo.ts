import type { DetectedBook } from '../model/detected-book';
import type { UploadState } from '../model/upload-state';

/**
 * Origin of the API. Inlined by Vite at build time: the frontend is served as static files
 * from a bucket (ADR 0004), with no server left to proxy anything at runtime.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * One message per kind of failure (FR-006): none of them may read like "no book detected",
 * and none depends on the technical text a response carries.
 */
const MESSAGES = {
  refused:
    'La photo a été refusée : elle doit être une image JPEG, PNG, WebP ou HEIC de moins de 20 Mo.',
  upstream:
    'Le service de reconnaissance ne répond pas pour le moment. Réessayez dans quelques instants.',
  offline: 'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.',
  unexpected: 'Une erreur inattendue est survenue. Réessayez dans quelques instants.',
} as const;

export interface SubmitOptions {
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

type Answer =
  | { readonly reached: false }
  | { readonly reached: true; readonly status: number; readonly body: unknown };

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

  const stored = await ask(send, `${baseUrl}/shelf-photos`, { method: 'POST', body: form });
  if (!stored.reached) {
    return failure('offline');
  }
  if (stored.status === 400 || stored.status === 413) {
    return failure('refused');
  }
  if (stored.status !== 201 || !isStoredPhoto(stored.body)) {
    return failure('unexpected');
  }

  const scanUrl = `${baseUrl}/shelf-photos/${encodeURIComponent(stored.body.id)}/scan`;
  const scanned = await ask(send, scanUrl, { method: 'POST' });
  if (!scanned.reached) {
    return failure('offline');
  }
  if (scanned.status === 502) {
    return failure('upstream');
  }
  if (scanned.status !== 200 || !isScanResult(scanned.body)) {
    return failure('unexpected');
  }

  return { status: 'success', books: scanned.body.books.map((book) => toDetectedBook(book)) };
}

/**
 * One request, told apart from no answer at all: `fetch` rejects only when nothing came
 * back — a cut connection, a server out of reach. A body that is not JSON reads as `null`,
 * which no guard below accepts.
 */
async function ask(send: typeof fetch, url: string, init: RequestInit): Promise<Answer> {
  let response: Response;
  try {
    response = await send(url, init);
  } catch {
    return { reached: false };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: left as null.
  }

  return { reached: true, status: response.status, body };
}

function failure(kind: keyof typeof MESSAGES): UploadState {
  return { status: 'error', message: MESSAGES[kind] };
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
