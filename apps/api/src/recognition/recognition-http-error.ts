import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type {
  DailyScanQuotaExceeded,
  InvalidShelfPhoto,
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanInProgress,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';

/** Every failure the recognition context names, and so every one a route of it can answer. */
export type RecognitionError =
  | DailyScanQuotaExceeded
  | InvalidShelfPhoto
  | ShelfScanAlreadyProcessed
  | ShelfScanFailed
  | ShelfScanInProgress
  | ShelfScanNotFound;

/**
 * Says the recognition context's errors in HTTP — once, for every route of the context,
 * rather than in a `try/catch` per handler (contracts/scan-api.md):
 *
 * - `InvalidShelfPhoto` → 400: the photo is the caller's mistake;
 * - `ShelfScanNotFound` → 404: no such photo, or an id that is not even a UUID;
 * - `ShelfScanAlreadyProcessed` → 409 `SCAN_ALREADY_COMPLETED`: scanning again would overwrite
 *   a result, or pay for a VLM call nobody asked for (research.md §7);
 * - `ShelfScanInProgress` → 409 `SCAN_IN_PROGRESS`: another analysis of the photo is running,
 *   and a second would pay for a call only one of them can keep (specs/002-upload-history,
 *   research.md §8);
 * - `DailyScanQuotaExceeded` → 429 `DAILY_SCAN_QUOTA_EXCEEDED`: the day's analyses are used up,
 *   the photo stays kept (FR-015);
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
 * (`{ statusCode, message, error }`). Where a status alone does not tell the front which message
 * to show — two 409s, two 429s — it adds a stable `code` (research.md §10); the global filter
 * lets it through.
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
      return new ConflictException(coded(409, 'Conflict', error.message, 'SCAN_ALREADY_COMPLETED'));
    }
    case 'shelf-scan-in-progress': {
      return new ConflictException(coded(409, 'Conflict', error.message, 'SCAN_IN_PROGRESS'));
    }
    case 'daily-scan-quota-exceeded': {
      return new HttpException(
        coded(429, 'Too Many Requests', error.message, 'DAILY_SCAN_QUOTA_EXCEEDED'),
        HttpStatus.TOO_MANY_REQUESTS,
      );
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

/** The body of a response that carries a stable code next to Nest's usual three fields. */
function coded(statusCode: number, error: string, message: string, code: string) {
  return { statusCode, message, error, code };
}
