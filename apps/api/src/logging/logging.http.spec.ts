import { describe, expect, it } from 'vitest';

import { aLoggedApi, traceId } from './testing/logged-api';

const { log, request } = aLoggedApi();

describe('the request log', () => {
  it('writes one JSON line per request, with the method, path, status and duration', async () => {
    await request('/ping?token=abc');

    const line = log.requestLine();
    expect(line).toMatchObject({
      severity: 'INFO',
      req: { method: 'GET', path: '/ping' },
      res: { statusCode: 200 },
    });
    expect(line?.['responseTime']).toBeTypeOf('number');
  });

  // The query string can carry what must not be echoed; the headers and the body more so.
  it('logs no query string, no header and no body', async () => {
    await request('/ping?token=query-secret', {
      method: 'POST',
      headers: {
        authorization: 'Bearer header-secret',
        cookie: 'session=cookie-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ bytes: [255, 216], note: 'body-secret' }),
    });

    for (const secret of ['query-secret', 'header-secret', 'cookie-secret', 'body-secret']) {
      expect(log.text()).not.toContain(secret);
    }
  });
});

// A 500 that drowns among INFO request lines is the very blindness this log exists to end
// (ADR 0004): the level of the request line follows its status.
describe('the level of the request line', () => {
  it('is INFO for a success', async () => {
    await request();

    expect(log.requestLine()).toMatchObject({ severity: 'INFO' });
  });

  it('is WARNING for the caller`s mistake, a 4xx', async () => {
    await request('/nowhere');

    expect(log.requestLine()).toMatchObject({ severity: 'WARNING', res: { statusCode: 404 } });
  });

  it('is ERROR for a failure of ours, a 5xx', async () => {
    await request('/ping/fail');

    expect(log.requestLine()).toMatchObject({ severity: 'ERROR', res: { statusCode: 500 } });
  });

  // pino-http invents an error for a 5xx nobody threw, with a stack of its own — pointing at
  // pino-http, not at the failure. The real error is logged where it was caught.
  it('carries no invented error, for a 5xx', async () => {
    await request('/ping/fail');

    expect(log.requestLine()).not.toHaveProperty('err');
  });
});

describe('the application logger', () => {
  // `useLogger` is what makes every `Logger` of Nest — the controllers', the framework's —
  // write through pino, rather than as text that Cloud Logging would read as INFO.
  it('writes what a Nest Logger says as a severity WARNING line', async () => {
    await request();

    expect(log.lines().find((line) => line['message'] === 'a provider was slow')).toMatchObject({
      severity: 'WARNING',
    });
  });
});

// Cloud Run injects `X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=1`: exposed under the key Cloud
// Logging recognises, every line of a request is attached to its trace.
describe('trace correlation', () => {
  it('attaches the trace of the request to its log lines', async () => {
    await request('/ping', { headers: { 'x-cloud-trace-context': `${traceId}/1;o=1` } });

    expect(log.requestLine()).toMatchObject({
      'logging.googleapis.com/trace': traceId,
    });
  });

  it('attaches nothing when the request carries no trace', async () => {
    await request();

    expect(log.requestLine()).not.toHaveProperty(['logging.googleapis.com/trace']);
  });

  // The header is the caller's: a value that is not a trace id never gets into a log line.
  it('ignores a header that is not a trace id', async () => {
    await request('/ping', { headers: { 'x-cloud-trace-context': 'not a trace; DROP' } });

    expect(log.text()).not.toContain('DROP');
    expect(log.requestLine()).not.toHaveProperty(['logging.googleapis.com/trace']);
  });
});
