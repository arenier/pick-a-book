import type { IncomingMessage } from 'node:http';

import { stdTimeFunctions } from 'pino';
import type { Options } from 'pino-http';

import type { Environment } from '../config/environment';

/**
 * The pino level names, as the `severity` Cloud Logging reads from a JSON line (ADR 0004).
 * pino writes a number (30 for info); the entry log of Cloud Run would file every line as
 * INFO, and a 500 would drown among the request lines.
 */
const SEVERITY: Readonly<Record<string, string>> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/** The key under which Cloud Logging attaches a line to a trace. */
const TRACE_KEY = 'logging.googleapis.com/trace';

/** `TRACE_ID/SPAN_ID;o=1` — the 128-bit trace id is 32 hexadecimal digits. */
const TRACE_HEADER = /^(?<id>[\da-f]{32})(?:\/|$)/iu;

/**
 * What must never reach a log line, whatever the depth somebody logs it at: a provider key
 * (ADR 0005), a credential, the bytes of a photo. Redacted by key, `remove: true`, so the field
 * is gone rather than masked — a mask says a secret was there.
 */
const SENSITIVE_KEYS = [
  'apiKey',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'authorization',
  'cookie',
  'bytes',
  'buffer',
  'image',
] as const;

const REDACT_DEPTH = 4;

const redactedPaths = SENSITIVE_KEYS.flatMap((key) =>
  Array.from({ length: REDACT_DEPTH }, (_, depth) => `${'*.'.repeat(depth)}${key}`),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Error Reporting groups crashes by the stack it finds in `stack_trace`; pino serialises a
 * logged error under `err`.
 */
function withStackTrace(line: Record<string, unknown>): Record<string, unknown> {
  const { err } = line;

  return isRecord(err) && typeof err['stack'] === 'string'
    ? { ...line, stack_trace: err['stack'] }
    : line;
}

/**
 * The trace of a request, named as Cloud Logging wants it. Cloud Logging links a line to a
 * trace only through the resource name `projects/{project}/traces/{id}`; without the project
 * the bare id is all there is to give. The header is the caller's, so a value that is not a
 * trace id is dropped rather than copied into a log line.
 */
function traceOf(
  request: IncomingMessage,
  googleCloudProject: string | undefined,
): Record<string, string> {
  const header = request.headers['x-cloud-trace-context'];
  const id = typeof header === 'string' ? TRACE_HEADER.exec(header)?.groups?.['id'] : undefined;
  if (id === undefined) {
    return {};
  }

  return {
    [TRACE_KEY]:
      googleCloudProject === undefined ? id : `projects/${googleCloudProject}/traces/${id}`,
  };
}

/**
 * The level of a request line follows its status: a failure of ours is an ERROR, the caller's
 * mistake a WARNING. pino-http logs INFO whatever the status, so a 500 would sit among the
 * successes.
 */
function levelOf(statusCode: number, error: Error | undefined): 'info' | 'warn' | 'error' {
  if (error !== undefined || statusCode >= 500) {
    return 'error';
  }

  return statusCode >= 400 ? 'warn' : 'info';
}

/** The path asked for, without its query string — which can carry what must not be echoed. */
function pathOf(url: string | undefined): string {
  return (url ?? '').split('?')[0] ?? '';
}

/**
 * The options of the application logger (issue #45): one JSON line per log, in the shape Cloud
 * Logging reads, with what must not leak taken out.
 *
 * - `severity` and `message` are the fields Cloud Logging reads; in development the level stays
 *   readable and `pino-pretty` prints it, a person reading the terminal;
 * - the request line keeps the method, the path, the status and the duration — never the
 *   headers, the query string or the body, so a key or a photo cannot get there by that door;
 * - the level of the request line follows its status (INFO, WARNING for a 4xx, ERROR for a 5xx);
 * - each line of a request carries its trace, when the request brings one.
 */
export function buildLoggerOptions(
  environment: Pick<Environment, 'nodeEnv' | 'googleCloudProject'>,
): Options {
  const development = environment.nodeEnv === 'development';

  return {
    messageKey: 'message',
    timestamp: stdTimeFunctions.isoTime,
    formatters: {
      ...(development
        ? {}
        : { level: (label: string) => ({ severity: SEVERITY[label] ?? 'DEFAULT' }) }),
      log: withStackTrace,
    },
    redact: { paths: redactedPaths, remove: true },
    serializers: {
      req: (request: IncomingMessage) => ({ method: request.method, path: pathOf(request.url) }),
      res: (response: { statusCode?: number }) => ({ statusCode: response.statusCode }),
    },
    customLogLevel: (_request, response, error) => levelOf(response.statusCode, error),
    // For a 5xx nobody threw, pino-http invents an error with a stack of its own — one that
    // points at pino-http, not at the failure, and that Error Reporting would count. The real
    // error is logged where it is caught, with its own stack.
    customErrorObject: (_request, _response, _error, line: Record<string, unknown>) => {
      const { err: _invented, ...withoutError } = line;

      return withoutError;
    },
    customProps: (request: IncomingMessage) => traceOf(request, environment.googleCloudProject),
    ...(development ? { transport: { target: 'pino-pretty' } } : {}),
  };
}
