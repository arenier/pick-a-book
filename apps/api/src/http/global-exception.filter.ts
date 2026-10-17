import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** What every error answer looks like, whatever raised it: one shape for the whole API. */
export interface ErrorBody {
  readonly statusCode: number;
  readonly message: string;
  /**
   * A stable code, when the route that raised the error said one: it is what the front reads to
   * choose a message where the status alone is ambiguous (specs/002-upload-history, research.md
   * §10). Absent otherwise.
   */
  readonly code?: string;
  readonly timestamp: string;
  /** The path asked for, without its query string — which can carry what must not be echoed. */
  readonly path: string;
}

const UNEXPECTED_MESSAGE = 'Internal server error';

/**
 * The last resort of the HTTP boundary: it normalises the shape of every error answer, and
 * keeps what nobody modelled from leaking to the client.
 *
 * It is a net, not a router of domain errors (ADR 0003: the app assembles, it carries no
 * rule). The errors a context names are translated near the route that raised them
 * (`toHttpException`), and arrive here as `HttpException`s whose status the filter respects —
 * it only changes their body. What is not an `HttpException` — a bug, a database that is
 * down — answers a generic 500: no stack, no cause, no detail of the implementation reaches
 * the client (ADR 0013 leaves those failures untyped, for this filter to catch).
 *
 * The promise "no stack to the client" only holds if the stack goes somewhere else: the error
 * is logged through the application logger, which writes the `severity: ERROR` JSON line that
 * Cloud Run files as an ERROR entry — otherwise a 500 drowns as INFO in Cloud Logging and is
 * invisible (ADR 0004). An `HttpException` was raised on purpose, so it is not logged here.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const url: unknown = httpAdapter.getRequestUrl(http.getRequest<unknown>());
    const path = pathOf(typeof url === 'string' ? url : '');
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const response = exception.getResponse();
      const code = codeOf(response);
      const body = {
        statusCode,
        message: messageOf(response),
        ...(code === undefined ? {} : { code }),
        timestamp,
        path,
      } satisfies ErrorBody;
      httpAdapter.reply(http.getResponse<unknown>(), body, statusCode);
      return;
    }

    this.logUnexpected(exception);
    const body = {
      statusCode: 500,
      message: UNEXPECTED_MESSAGE,
      timestamp,
      path,
    } satisfies ErrorBody;
    httpAdapter.reply(http.getResponse<unknown>(), body, 500);
  }

  /**
   * The message and the stack go to the logger as it expects an error: `Logger.error(message,
   * stack)` is the contract Nest's own handlers use, and the application logger turns it into
   * an `err` — the request it belongs to (method, path, trace) is attached by the logger itself.
   */
  private logUnexpected(exception: unknown): void {
    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      return;
    }

    this.logger.error(String(exception));
  }
}

/** The message of an `HttpException`, whichever of Nest's shapes its response takes. */
function messageOf(response: string | object): string {
  if (typeof response === 'string') {
    return response;
  }
  if ('message' in response) {
    const { message } = response;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.map(String).join('; ');
    }
  }

  return UNEXPECTED_MESSAGE;
}

/** The stable code of an `HttpException` response, if it carries one that is a string. */
function codeOf(response: string | object): string | undefined {
  if (typeof response === 'object' && 'code' in response && typeof response.code === 'string') {
    return response.code;
  }

  return undefined;
}

function pathOf(url: string): string {
  return url.split('?')[0] ?? url;
}
