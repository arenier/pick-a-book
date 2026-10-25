import type { ReadByRecognition, ReconciledBook, Reference } from '../model/reconciled-book';
import type {
  AmbiguityChoice,
  DecisionFailure,
  ReconciliationFailure,
} from '../model/reconciliation-failure';
import { ask, failureOf, isRecord, type ApiOptions } from './http';

/**
 * What a request for the state of the books comes back with — never a rejection, never a
 * sentence (ADR 0011).
 */
export type ReconciliationAnswer =
  | { readonly status: 'books'; readonly books: readonly ReconciledBook[] }
  | { readonly status: 'error'; readonly failure: ReconciliationFailure };

/**
 * Reconciles the books of an analysis, or reconciles again those still « not verified »
 * (`POST /shelf-photos/{id}/reconciliation`, specs/003, contracts §1): one request for all the
 * books, replayable without risk. Resolves with the state of **every** book, or with the kind of
 * failure — the books stay visible whatever happens (FR-008).
 */
export async function reconcile(
  id: string,
  options: ApiOptions = {},
): Promise<ReconciliationAnswer> {
  return request(id, options, { method: 'POST' });
}

/**
 * The state kept for the books of an analysis (`GET /shelf-photos/{id}/reconciliation`,
 * contracts §2): it never asks the catalogue, and says `pending` of a book never tried.
 */
export async function readReconciliation(
  id: string,
  options: ApiOptions = {},
): Promise<ReconciliationAnswer> {
  return request(id, options, {});
}

export type DecisionAnswer =
  | { readonly status: 'book'; readonly book: ReconciledBook }
  | { readonly status: 'error'; readonly failure: DecisionFailure };

/**
 * Records the user's choice for an ambiguous book
 * (`POST /shelf-photos/{id}/books/{position}/decision`): resolves with the book as it is now, or
 * with the kind of failure — `conflict` when the book is no longer ambiguous.
 */
export async function decide(
  id: string,
  position: number,
  choice: AmbiguityChoice,
  options: ApiOptions = {},
): Promise<DecisionAnswer> {
  const answer = await ask(
    options,
    `/shelf-photos/${encodeURIComponent(id)}/books/${position}/decision`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(choice),
    },
  );
  if (answer.reached && answer.status === 200) {
    const book = bookOf(answer.body);
    if (book !== undefined) {
      return { status: 'book', book };
    }
  }
  if (answer.reached && answer.status === 409) {
    return { status: 'error', failure: 'conflict' };
  }

  return { status: 'error', failure: failureOf(answer) };
}

async function request(
  id: string,
  options: ApiOptions,
  init: RequestInit,
): Promise<ReconciliationAnswer> {
  const answer = await ask(options, `/shelf-photos/${encodeURIComponent(id)}/reconciliation`, init);
  if (answer.reached && answer.status === 200) {
    const books = booksOf(answer.body);
    if (books !== undefined) {
      return { status: 'books', books };
    }
  }

  return { status: 'error', failure: failureOf(answer) };
}

/** All or nothing: one book that is not the contract refuses the whole list. */
function booksOf(body: unknown): readonly ReconciledBook[] | undefined {
  if (!isRecord(body) || !Array.isArray(body['books'])) {
    return undefined;
  }
  const wireBooks: unknown[] = body['books'];
  const books: ReconciledBook[] = [];
  for (const wire of wireBooks) {
    const book = bookOf(wire);
    if (book === undefined) {
      return undefined;
    }
    books.push(book);
  }

  return books;
}

function bookOf(wire: unknown): ReconciledBook | undefined {
  if (!isRecord(wire) || typeof wire['position'] !== 'number') {
    return undefined;
  }
  const read = readOf(wire['read']);
  if (read === undefined) {
    return undefined;
  }
  const base = { position: wire['position'], read };

  switch (wire['status']) {
    case 'confirmed': {
      return confirmedOf(base, wire);
    }
    case 'ambiguous': {
      const candidates = referencesOf(wire['candidates']);
      return candidates === undefined ? undefined : { ...base, status: 'ambiguous', candidates };
    }
    case 'not_found':
    case 'not_verified':
    case 'pending': {
      return { ...base, status: wire['status'] };
    }
    default: {
      return undefined;
    }
  }
}

function confirmedOf(
  base: { readonly position: number; readonly read: ReadByRecognition },
  wire: Record<string, unknown>,
): ReconciledBook | undefined {
  const reference = referenceOf(wire['reference']);
  const { confirmedBy, titleOnly } = wire;
  if (
    reference === undefined ||
    (confirmedBy !== 'automatic' && confirmedBy !== 'user') ||
    typeof titleOnly !== 'boolean'
  ) {
    return undefined;
  }

  return { ...base, status: 'confirmed', reference, confirmedBy, titleOnly };
}

function readOf(wire: unknown): ReadByRecognition | undefined {
  if (!isRecord(wire) || typeof wire['title'] !== 'string') {
    return undefined;
  }
  const author = wire['author'];
  if (author !== undefined && typeof author !== 'string') {
    return undefined;
  }

  return { title: wire['title'], author };
}

/** One candidate is the ambiguity of a title no record explains; five is the most the screen shows. */
function referencesOf(wire: unknown): readonly Reference[] | undefined {
  if (!Array.isArray(wire) || wire.length === 0 || wire.length > 5) {
    return undefined;
  }
  const candidates: unknown[] = wire;
  const references = candidates.map((candidate) => referenceOf(candidate));

  return references.every((reference) => reference !== undefined) ? references : undefined;
}

function referenceOf(wire: unknown): Reference | undefined {
  if (
    !isRecord(wire) ||
    typeof wire['recordId'] !== 'string' ||
    typeof wire['title'] !== 'string' ||
    !isStringArray(wire['authors'])
  ) {
    return undefined;
  }

  return { recordId: wire['recordId'], title: wire['title'], authors: wire['authors'] };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}
