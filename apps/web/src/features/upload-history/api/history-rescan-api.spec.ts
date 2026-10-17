import { describe, expect, it } from 'vitest';

import { rescanShelfScan } from './history-api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

function aServer(answer: () => Promise<Response>) {
  const calls: { url: string; method: string | undefined }[] = [];
  const fetchDouble = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), method: init?.method });

    return answer();
  };

  return { calls, options: { baseUrl: 'http://api.test', fetch: fetchDouble } };
}

describe('rescanShelfScan, running the analysis again', () => {
  it('posts to the scan route of the upload, its id encoded', async () => {
    const server = aServer(async () => json(200, { books: [] }));

    await rescanShelfScan('a/b', server.options);

    expect(server.calls).toStrictEqual([
      { url: 'http://api.test/shelf-photos/a%2Fb/scan', method: 'POST' },
    ]);
  });

  it('answers the books it found, the author left out when unknown', async () => {
    const server = aServer(async () =>
      json(200, {
        books: [
          { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
          { title: 'Les Choses', confidence: 0.71 },
        ],
      }),
    );

    await expect(rescanShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'completed',
      books: [
        { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
        { author: undefined, title: 'Les Choses', confidence: 0.71 },
      ],
    });
  });

  it('answers an empty list for an analysis that found nothing', async () => {
    const server = aServer(async () => json(200, { books: [] }));

    await expect(rescanShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'completed',
      books: [],
    });
  });
});

// Told apart by status and by `code`, never by the message (research.md §10).
describe('rescanShelfScan, when the analysis does not happen', () => {
  it.each([
    ['a 502', json(502, { statusCode: 502 }), 'upstream'],
    ['the daily cap', json(429, { code: 'DAILY_SCAN_QUOTA_EXCEEDED' }), 'dailyQuota'],
    ['the limit by source', json(429, { code: 'TOO_MANY_REQUESTS' }), 'rateLimited'],
    ['an analysis already running', json(409, { code: 'SCAN_IN_PROGRESS' }), 'inProgress'],
    ['a 429 without a code', json(429, { statusCode: 429 }), 'unexpected'],
    ['a 409 with a code it does not know', json(409, { code: 'SOMETHING_NEW' }), 'unexpected'],
    ['a server error', json(500, {}), 'unexpected'],
    ['a 404', json(404, {}), 'unexpected'],
    ['a body that is not the books', json(200, { books: [{ title: 1 }] }), 'unexpected'],
    ['a body that is not JSON', new Response('<html>', { status: 200 }), 'unexpected'],
  ])('says %s as « %s »', async (_label, response, failure) => {
    const server = aServer(async () => response);

    await expect(rescanShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure,
    });
  });

  it('says « offline » when nothing answers', async () => {
    const server = aServer(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(rescanShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'offline',
    });
  });

  // Not a failure to show: the upload has its books already — the screen reloads it to show them.
  it('says « already completed » for a 409 of that name', async () => {
    const server = aServer(async () => json(409, { code: 'SCAN_ALREADY_COMPLETED' }));

    await expect(rescanShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'alreadyCompleted',
    });
  });
});
