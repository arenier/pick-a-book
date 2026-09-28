import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

/** What every error answer looks like, whatever raised it: one shape for the whole API. */
export interface ErrorBody {
  readonly statusCode: number;
  readonly message: string;
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
 * is written as a `severity: ERROR` JSON line, the form Cloud Run turns into an ERROR entry —
 * otherwise a 500 drowns as INFO in Cloud Logging and is invisible (ADR 0004). An
 * `HttpException` was raised on purpose, so it is not logged here.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const url: unknown = httpAdapter.getRequestUrl(http.getRequest<unknown>());
    const path = pathOf(typeof url === 'string' ? url : '');
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = {
        statusCode,
        message: messageOf(exception.getResponse()),
        timestamp,
        path,
      } satisfies ErrorBody;
      httpAdapter.reply(http.getResponse<unknown>(), body, statusCode);
      return;
    }

    logUnexpected(exception, path, timestamp);
    const body = {
      statusCode: 500,
      message: UNEXPECTED_MESSAGE,
      timestamp,
      path,
    } satisfies ErrorBody;
    httpAdapter.reply(http.getResponse<unknown>(), body, 500);
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

function pathOf(url: string): string {
  return url.split('?')[0] ?? url;
}

/**
 * One JSON object per line on stderr, with the fields Cloud Logging reads: `severity` sets
 * the level, `message` the text, `stack_trace` lets Error Reporting group the crash. When the
 * app-wide logger comes (pino), the filter will log through it and this line keeps its shape.
 */
function logUnexpected(exception: unknown, path: string, timestamp: string): void {
  const isError = exception instanceof Error;
  const entry = {
    severity: 'ERROR',
    message: isError ? exception.message : String(exception),
    stack_trace: isError ? exception.stack : undefined,
    path,
    timestamp,
  };

  process.stderr.write(`${JSON.stringify(entry)}\n`);
}
