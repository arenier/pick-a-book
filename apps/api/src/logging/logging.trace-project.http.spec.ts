import { describe, expect, it } from 'vitest';

import { aLoggedApi, traceId } from './testing/logged-api';

// Kept in a file of its own: nestjs-pino keeps a single pino-http per process, so an application
// built with another project cannot share a file with the first.

// Cloud Logging links a line to a trace only through its full resource name.
const { log, request } = aLoggedApi('pick-a-book-prod');

describe('trace correlation, with the project known', () => {
  it('names the trace by its resource, `projects/{project}/traces/{id}`', async () => {
    await request('/ping', { headers: { 'x-cloud-trace-context': `${traceId}/1;o=1` } });

    expect(log.requestLine()).toMatchObject({
      'logging.googleapis.com/trace': `projects/pick-a-book-prod/traces/${traceId}`,
    });
  });
});
