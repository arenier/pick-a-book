/**
 * A book of an analysis and what the reconciliation made of it, as `POST` and
 * `GET /shelf-photos/{id}/reconciliation` return it (specs/003-bibliographic-reconciliation,
 * contracts/reconciliation-api.md).
 *
 * A local copy of the API contract, on purpose: `apps/web` may not import the `scope:api` libs,
 * where `BookReconciliationDto` lives, and a slice does not import another (research §11).
 */

/** The reference form of a record of the catalogue: what the catalogue calls the book. */
export interface Reference {
  /** The ARK, the stable identifier of the record. */
  readonly recordId: string;
  readonly title: string;
  /** Main authors first. Possibly empty. */
  readonly authors: readonly string[];
}

/** What the recognition read, unchanged. */
export interface ReadByRecognition {
  readonly title: string;
  /** Absent when the spine carried no readable author — never an empty string. */
  readonly author: string | undefined;
}

/** The status of a book: the four of the contract, `pending` for a book never tried, `checking` before any answer. */
export type ReconciledBook = {
  readonly position: number;
  readonly read: ReadByRecognition;
} & (
  | {
      readonly status: 'confirmed';
      readonly reference: Reference;
      readonly confirmedBy: 'automatic' | 'user';
      /** No author was read: the weakest proof of the safety net (FR-022). */
      readonly titleOnly: boolean;
    }
  | { readonly status: 'ambiguous'; readonly candidates: readonly Reference[] }
  | { readonly status: 'not_found' }
  | { readonly status: 'not_verified' }
  | { readonly status: 'pending' }
  /** Display only: the request is in flight. The API never says it. */
  | { readonly status: 'checking' }
);
