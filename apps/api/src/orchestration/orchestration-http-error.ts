import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';

import type { ReconcileShelfPhotoFailure } from './reconcile-shelf-photo.use-case';

/** Every failure a route of the orchestrator can answer. */
export type OrchestrationError = ReconcileShelfPhotoFailure;

/**
 * Says the failures of the orchestrator in HTTP — those of `recognition` it passes on, its own,
 * and those of `bibliography` it passes on (contracts/reconciliation-api.md §Correspondance):
 *
 * - `ShelfScanNotFound` → 404: no such analysis, or one of another owner;
 * - `ShelfScanNotCompleted` → 409 `SCAN_NOT_COMPLETED`: it has no detected books to reconcile;
 * - `InvalidValue` → 500: the recognition proved the reference and the reading it handed over,
 *   so a refused one is a bug, which the caller gets no detail of.
 *
 * The `switch` is exhaustive on `kind` (ADR 0013): a new error in the union fails the build.
 */
export function toHttpException(error: OrchestrationError): HttpException {
  switch (error.kind) {
    case 'shelf-scan-not-found': {
      return new NotFoundException(error.message);
    }
    case 'shelf-scan-not-completed': {
      return new ConflictException({
        statusCode: 409,
        message: error.message,
        error: 'Conflict',
        code: 'SCAN_NOT_COMPLETED',
      });
    }
    case 'invalid-value': {
      return new InternalServerErrorException('The reconciliation could not be started');
    }
    default: {
      // Reached only when a kind was added to `OrchestrationError` without a case above: the
      // assignment to `never` is what fails the build, not a runtime check.
      const unhandled: never = error;

      return unhandled;
    }
  }
}
