import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  type HttpException,
  NotFoundException,
} from '@nestjs/common';
import type {
  InvalidShelfPhoto,
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';

/** Every failure the recognition context names, and so every one a route of it can answer. */
export type RecognitionError =
  | InvalidShelfPhoto
  | ShelfScanAlreadyProcessed
  | ShelfScanFailed
  | ShelfScanNotFound;

/**
 * Says the recognition context's errors in HTTP — once, for every route of the context,
 * rather than in a `try/catch` per handler (contracts/scan-api.md):
 *
 * - `InvalidShelfPhoto` → 400: the photo is the caller's mistake;
 * - `ShelfScanNotFound` → 404: no such photo, or an id that is not even a UUID;
 * - `ShelfScanAlreadyProcessed` → 409: scanning again would overwrite a result, or pay for a
 *   VLM call nobody asked for (research.md §7);
 * - `ShelfScanFailed` → 502: the provider is down or off-contract — an upstream failure,
 *   where a 4xx would blame the photo (FR-006). Its message is the provider's own answer,
 *   which can name an API key, a quota or a model: the caller only gets a generic message,
 *   and the controller logs the real one (contracts/scan-api.md §2).
 *
 * The `switch` is exhaustive on `kind` (ADR 0013): a new error in the union fails the build
 * here — where the `instanceof` chain of the former filter would have quietly answered 500.
 * Lives in the composition root, the only place that knows both the domain and HTTP: one
 * translator per bounded context, so no single piece of the API ends up knowing every
 * context's errors (ADR 0003).
 *
 * Builds the exception of the matching Nest status, so the body keeps Nest's shape
 * (`{ statusCode, message, error }`).
 */
export function toHttpException(error: RecognitionError): HttpException {
  switch (error.kind) {
    case 'invalid-shelf-photo': {
      return new BadRequestException(error.message);
    }
    case 'shelf-scan-not-found': {
      return new NotFoundException(error.message);
    }
    case 'shelf-scan-already-processed': {
      return new ConflictException(error.message);
    }
    case 'shelf-scan-failed': {
      return new BadGatewayException('The recognition service is unavailable');
    }
    default: {
      // Reached only when a kind was added to `RecognitionError` without a case above: the
      // assignment to `never` is what fails the build, not a runtime check.
      const unhandled: never = error;

      return unhandled;
    }
  }
}
