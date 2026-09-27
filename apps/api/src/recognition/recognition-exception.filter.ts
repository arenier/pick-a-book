import {
  type ArgumentsHost,
  BadGatewayException,
  BadRequestException,
  Catch,
  ConflictException,
  type ExceptionFilter,
  type HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  InvalidShelfPhoto,
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';

type RecognitionError =
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
 *   which can name an API key, a quota or a model: it is logged, and the caller only gets a
 *   generic message (contracts/scan-api.md §2).
 *
 * Anything else is not caught here and stays a 500. Lives in the composition root, the only
 * place that knows both the domain and HTTP: one filter per bounded context, so no single
 * piece of the API ends up knowing every context's errors (ADR 0003).
 *
 * Answers with the body of the matching Nest exception, so it keeps Nest's shape
 * (`{ statusCode, message, error }`), through the HTTP adapter rather than Express directly.
 */
@Catch(InvalidShelfPhoto, ShelfScanAlreadyProcessed, ShelfScanFailed, ShelfScanNotFound)
export class RecognitionExceptionFilter implements ExceptionFilter<RecognitionError> {
  private readonly logger = new Logger(RecognitionExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(error: RecognitionError, host: ArgumentsHost): void {
    if (error instanceof ShelfScanFailed) {
      this.logger.error(error.message, error.stack);
    }
    const http = toHttp(error);
    const response = host.switchToHttp().getResponse<unknown>();

    this.adapterHost.httpAdapter.reply(response, http.getResponse(), http.getStatus());
  }
}

function toHttp(error: RecognitionError): HttpException {
  if (error instanceof InvalidShelfPhoto) {
    return new BadRequestException(error.message);
  }
  if (error instanceof ShelfScanNotFound) {
    return new NotFoundException(error.message);
  }
  if (error instanceof ShelfScanAlreadyProcessed) {
    return new ConflictException(error.message);
  }
  return new BadGatewayException('The recognition service is unavailable');
}
