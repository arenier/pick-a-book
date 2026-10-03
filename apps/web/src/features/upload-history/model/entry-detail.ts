import { toDetectedBook, isWireBook, type DetectedBook } from './detected-book';
import {
  isDateText,
  isOutcome,
  isRecord,
  toHistoryEntry,
  type HistoryEntry,
  type WireSummary,
} from './history-entry';

/** What the detail screen reads of an upload: its entry, and its books when it completed. */
export interface EntryDetail {
  readonly entry: HistoryEntry;
  /** Present if and only if the analysis completed — an empty list meaning « none detected ». */
  readonly books: readonly DetectedBook[] | undefined;
}

/** `GET /shelf-photos/{id}`, as it travels (contracts §2). */
export interface WireDetail {
  readonly id: string;
  readonly createdAt: string;
  readonly outcome: WireSummary['outcome'];
  readonly books?: readonly unknown[];
  readonly hasThumbnail: boolean;
}

/**
 * Whether a parsed JSON value is the detail of the contract. A completed upload without a list of
 * books cannot be shown, and one malformed book refuses the whole: trusted whole or not at all.
 */
export function isWireDetail(value: unknown): value is WireDetail {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    !isDateText(value['createdAt']) ||
    !isOutcome(value['outcome']) ||
    typeof value['hasThumbnail'] !== 'boolean'
  ) {
    return false;
  }
  if (value['outcome'] !== 'completed') {
    return true;
  }

  return Array.isArray(value['books']) && value['books'].every((book: unknown) => isWireBook(book));
}

export function toEntryDetail(detail: WireDetail): EntryDetail {
  const books = detail.outcome === 'completed' ? booksOf(detail) : undefined;

  return {
    entry: toHistoryEntry({
      id: detail.id,
      createdAt: detail.createdAt,
      outcome: detail.outcome,
      hasThumbnail: detail.hasThumbnail,
      ...(books === undefined ? {} : { bookCount: books.length }),
    }),
    books,
  };
}

/** The books of a detail already proven by `isWireDetail`, rebuilt without trusting the type. */
function booksOf(detail: WireDetail): readonly DetectedBook[] {
  return (detail.books ?? [])
    .filter((book) => isWireBook(book))
    .map((book) => toDetectedBook(book));
}
