import { isRecord, isWireSummary, toHistoryEntry, type WireSummary } from '../model/history-entry';
import { isWireDetail, toEntryDetail } from '../model/entry-detail';
import { isWireBook, toDetectedBook, type WireBook } from '../model/detected-book';
import type { DetailAnswer, PageAnswer, RescanAnswer, RescanFailure } from '../model/history-state';
import { ask, baseUrlOf, codeOf, failureOf, type Answer, type ApiOptions } from './http';

/** How many uploads a page asks for; the API caps it at 50 (contracts §1). */
const PAGE_SIZE = 20;

/**
 * One page of the history, newest first (`GET /shelf-photos`, specs/002-upload-history, contracts
 * §1). Resolves with the entries or the kind of failure — never rejects, and never a sentence: the
 * screen words it (ADR 0011). The cursor is handed back as it came, opaque.
 */
export async function listShelfScans(
  request: { readonly cursor?: string },
  options: ApiOptions = {},
): Promise<PageAnswer> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (request.cursor !== undefined) {
    query.set('cursor', request.cursor);
  }

  const answer = await ask(options, `/shelf-photos?${query.toString()}`);
  if (answer.reached && answer.status === 200 && isWirePage(answer.body)) {
    return {
      status: 'page',
      entries: answer.body.items.map((item) => toHistoryEntry(item)),
      next: answer.body.nextCursor,
    };
  }

  return { status: 'error', failure: failureOf(answer) };
}

/**
 * The detail of one upload (`GET /shelf-photos/{id}`, contracts §2): how its analysis ended and,
 * when it completed, its books. A 404 is `notFound`, not a failure — a stale link has a screen of
 * its own. Never rejects, and never a sentence.
 */
export async function getShelfScan(id: string, options: ApiOptions = {}): Promise<DetailAnswer> {
  const answer = await ask(options, `/shelf-photos/${encodeURIComponent(id)}`);
  if (answer.reached && answer.status === 200 && isWireDetail(answer.body)) {
    return { status: 'found', ...toEntryDetail(answer.body) };
  }
  if (answer.reached && answer.status === 404) {
    return { status: 'notFound' };
  }

  return { status: 'error', failure: failureOf(answer) };
}

/**
 * Runs the analysis of an upload again (`POST /shelf-photos/{id}/scan`, specs/002-upload-history,
 * US3, contracts §5) — the same route that analysed it the first time, which accepts a scan that
 * failed or never started. Resolves with the books or the kind of failure; never rejects, never a
 * sentence.
 */
export async function rescanShelfScan(id: string, options: ApiOptions = {}): Promise<RescanAnswer> {
  const answer = await ask(options, `/shelf-photos/${encodeURIComponent(id)}/scan`, {
    method: 'POST',
  });
  if (answer.reached && answer.status === 200 && isWireBooks(answer.body)) {
    return { status: 'completed', books: answer.body.books.map((book) => toDetectedBook(book)) };
  }
  if (answer.reached && answer.status === 409 && codeOf(answer.body) === 'SCAN_ALREADY_COMPLETED') {
    return { status: 'alreadyCompleted' };
  }

  return { status: 'error', failure: rescanFailureOf(answer) };
}

/** Told apart by status and by `code`, never by the message (research.md §10). */
function rescanFailureOf(answer: Answer): RescanFailure {
  if (!answer.reached) {
    return 'offline';
  }
  const code = codeOf(answer.body);
  if (answer.status === 502) {
    return 'upstream';
  }
  if (answer.status === 429 && code === 'DAILY_SCAN_QUOTA_EXCEEDED') {
    return 'dailyQuota';
  }
  if (answer.status === 429 && code === 'TOO_MANY_REQUESTS') {
    return 'rateLimited';
  }

  return answer.status === 409 && code === 'SCAN_IN_PROGRESS' ? 'inProgress' : 'unexpected';
}

function isWireBooks(body: unknown): body is { readonly books: readonly WireBook[] } {
  return (
    isRecord(body) &&
    Array.isArray(body['books']) &&
    body['books'].every((book: unknown) => isWireBook(book))
  );
}

/** Where the photo of an upload is, to be loaded in an `<img>` like its thumbnail (contracts §3). */
export function photoUrl(id: string, options: ApiOptions = {}): string {
  return `${baseUrlOf(options)}/shelf-photos/${encodeURIComponent(id)}/photo`;
}

/**
 * Where the thumbnail of an upload is. A URL, not a request: the browser loads it in an `<img>`,
 * which needs no CORS and caches it for good (contracts §4). The id comes from outside, so it is
 * encoded.
 */
export function thumbnailUrl(id: string, options: ApiOptions = {}): string {
  return `${baseUrlOf(options)}/shelf-photos/${encodeURIComponent(id)}/thumbnail`;
}

interface WirePage {
  readonly items: readonly WireSummary[];
  readonly nextCursor: string | null;
}

/** A page of the contract, or nothing: one malformed item refuses the whole page. */
function isWirePage(body: unknown): body is WirePage {
  return (
    isRecord(body) &&
    Array.isArray(body['items']) &&
    body['items'].every((item: unknown) => isWireSummary(item)) &&
    (body['nextCursor'] === null || typeof body['nextCursor'] === 'string')
  );
}
