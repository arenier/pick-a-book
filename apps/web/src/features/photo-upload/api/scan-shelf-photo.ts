import type { DetectedBook } from '../model/detected-book';
import type { UploadState } from '../model/upload-state';

/**
 * Sends a photo and brings back what was read off it.
 *
 * Two requests, one action: `POST /shelf-photos` keeps the photo, then
 * `POST /shelf-photos/{id}/scan` reads it (contracts/scan-api.md). The split exists so the
 * photo survives a failure of the long, fragile second call — the screen never learns about
 * it, and the user sees a single wait (US1).
 *
 * Answers an `UploadState` rather than throwing: a failed upload is an outcome of this
 * screen, not an exception the caller has to remember to catch. The messages are French
 * because they are shown as they are — product text, not code (CLAUDE.md).
 */
export async function submitShelfPhoto(file: File): Promise<UploadState> {
  const stored = await storePhoto(file);
  if (stored.status !== 'stored') {
    return stored.state;
  }

  return scanStoredPhoto(stored.id);
}

/**
 * Where the API lives. Inlined by Vite at build time: in production the frontend is a set of
 * static files in a bucket (ADR 0004), with no server left to resolve a relative path
 * against.
 */
const configuredBaseUrl: unknown = import.meta.env.VITE_API_BASE_URL;
const apiBaseUrl =
  typeof configuredBaseUrl === 'string' && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : 'http://localhost:3000';

const NETWORK_ERROR =
  "La connexion a échoué. Vérifiez votre réseau, puis réessayez d'envoyer la photo.";
const REFUSED_ERROR =
  "Cette photo n'a pas pu être envoyée. Choisissez une autre image (JPEG, PNG, WebP ou HEIC, 20 Mo maximum).";
const UPSTREAM_ERROR =
  "L'analyse n'a pas pu aboutir : le service de reconnaissance est indisponible. Réessayez plus tard.";
const UNEXPECTED_ERROR = "L'analyse n'a pas abouti. Réessayez dans un instant.";

type StoreOutcome = { status: 'stored'; id: string } | { status: 'failed'; state: UploadState };

async function storePhoto(file: File): Promise<StoreOutcome> {
  const body = new FormData();
  body.append('photo', file);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/shelf-photos`, { method: 'POST', body });
  } catch {
    // No HTTP answer at all: the line dropped, or the request timed out. Nothing was kept,
    // exactly as for a refusal — but it is worth saying differently (contracts/scan-api.md).
    return { status: 'failed', state: { status: 'error', message: NETWORK_ERROR } };
  }

  if (!response.ok) {
    return { status: 'failed', state: { status: 'error', message: REFUSED_ERROR } };
  }

  const id = await readId(response);
  if (id === undefined) {
    return { status: 'failed', state: { status: 'error', message: UNEXPECTED_ERROR } };
  }

  return { status: 'stored', id };
}

async function scanStoredPhoto(id: string): Promise<UploadState> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/shelf-photos/${id}/scan`, { method: 'POST' });
  } catch {
    // The photo is kept either way (FR-014): only its analysis was lost.
    return { status: 'error', message: NETWORK_ERROR };
  }

  if (!response.ok) {
    // 502 is the one worth its own words: the photo was fine, the provider was not (FR-006).
    return {
      status: 'error',
      message: response.status === 502 ? UPSTREAM_ERROR : UNEXPECTED_ERROR,
    };
  }

  const books = await readBooks(response);
  if (books === undefined) {
    return { status: 'error', message: UNEXPECTED_ERROR };
  }

  return { status: 'success', books };
}

/**
 * The body is JSON from the network — `unknown` until proven (CLAUDE.md forbids asserting
 * it). An answer that does not fit the contract is an error, never a half-read result.
 */
async function readId(response: Response): Promise<string | undefined> {
  const payload = await readJson(response);
  if (payload === undefined || !isRecord(payload)) {
    return undefined;
  }

  return typeof payload['id'] === 'string' ? payload['id'] : undefined;
}

async function readBooks(response: Response): Promise<DetectedBook[] | undefined> {
  const payload = await readJson(response);
  if (payload === undefined || !isRecord(payload) || !Array.isArray(payload['books'])) {
    return undefined;
  }

  const books: DetectedBook[] = [];
  for (const raw of payload['books']) {
    const book = toDetectedBook(raw);
    if (book === undefined) {
      // One unreadable entry invalidates the whole list: a silently shortened shelf is worse
      // than an error, because nothing downstream can tell it apart from a real result.
      return undefined;
    }
    books.push(book);
  }

  return books;
}

function toDetectedBook(raw: unknown): DetectedBook | undefined {
  if (!isRecord(raw) || typeof raw['title'] !== 'string' || typeof raw['confidence'] !== 'number') {
    return undefined;
  }

  const author = raw['author'];
  if (author !== undefined && typeof author !== 'string') {
    return undefined;
  }

  return { author, title: raw['title'], confidence: raw['confidence'] };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
