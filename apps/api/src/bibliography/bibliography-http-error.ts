import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { HttpException } from '@nestjs/common';
import type {
  BookNotAmbiguous,
  BookReconciliationNotFound,
  UnknownCandidate,
} from '@pick-a-book/bibliography-domain';

/**
 * The failures of the bibliography context a route can answer. The two that never reach HTTP —
 * `CatalogUnavailable`, which becomes a « not verified » book, and `BookAlreadyReconciled`,
 * which the use case turns into the state already kept — are not in it
 * (contracts/reconciliation-api.md §Correspondance).
 */
export type BibliographyError = BookNotAmbiguous | BookReconciliationNotFound | UnknownCandidate;

/**
 * Says the bibliography context's errors in HTTP, once for every route of the context:
 *
 * - `BookReconciliationNotFound` → 404: the book was never reconciled, there is nothing to decide;
 * - `BookNotAmbiguous` → 409 `BOOK_NOT_AMBIGUOUS`: already confirmed, not found, not verified, or
 *   already decided — the screen reloads the state;
 * - `UnknownCandidate` → 400 `UNKNOWN_CANDIDATE`: the record chosen is not one of the candidates.
 *
 * The `switch` is exhaustive on `kind` (ADR 0013): a new error in the union fails the build.
 */
export function toHttpException(error: BibliographyError): HttpException {
  switch (error.kind) {
    case 'book-reconciliation-not-found': {
      return new NotFoundException(error.message);
    }
    case 'book-not-ambiguous': {
      return new ConflictException({
        statusCode: 409,
        message: error.message,
        error: 'Conflict',
        code: 'BOOK_NOT_AMBIGUOUS',
      });
    }
    case 'unknown-candidate': {
      return new BadRequestException({
        statusCode: 400,
        message: error.message,
        error: 'Bad Request',
        code: 'UNKNOWN_CANDIDATE',
      });
    }
    default: {
      // Reached only when a kind was added to `BibliographyError` without a case above: the
      // assignment to `never` is what fails the build, not a runtime check.
      const unhandled: never = error;

      return unhandled;
    }
  }
}
