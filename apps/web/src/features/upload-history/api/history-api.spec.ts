import { describe, expect, it } from 'vitest';

import { listShelfScans, thumbnailUrl } from './history-api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const aSummary = (id: string) => ({
  id,
  createdAt: '2026-09-27T14:03:12.481Z',
  outcome: 'completed',
  bookCount: 3,
  hasThumbnail: true,
});

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

/** A `fetch` double that answers as told and records the URLs it was asked. */
function aServer(answer: () => Promise<Response>) {
  const urls: string[] = [];
  const fetchDouble = async (input: string | URL | Request) => {
    urls.push(input instanceof Request ? input.url : String(input));

    return answer();
  };

  return { urls, options: { baseUrl: 'http://api.test', fetch: fetchDouble } };
}

describe('listShelfScans, what it asks', () => {
  it('asks for a page of 20', async () => {
    const server = aServer(async () => json(200, { items: [], nextCursor: null }));

    await listShelfScans({}, server.options);

    expect(server.urls).toStrictEqual(['http://api.test/shelf-photos?limit=20']);
  });

  it('hands back the cursor it was given, as it is', async () => {
    const server = aServer(async () => json(200, { items: [], nextCursor: null }));

    await listShelfScans({ cursor: 'MjAyNi0wOS0yNnxhYmM' }, server.options);

    expect(server.urls).toStrictEqual([
      'http://api.test/shelf-photos?limit=20&cursor=MjAyNi0wOS0yNnxhYmM',
    ]);
  });
});

describe('listShelfScans, what it answers', () => {
  it('answers the entries of the page and the cursor of the next', async () => {
    const server = aServer(async () => json(200, { items: [aSummary(anId)], nextCursor: 'abc' }));

    const answer = await listShelfScans({}, server.options);

    expect(answer).toStrictEqual({
      status: 'page',
      entries: [
        {
          id: anId,
          sentAt: new Date('2026-09-27T14:03:12.481Z'),
          outcome: { kind: 'books', count: 3 },
          hasThumbnail: true,
        },
      ],
      next: 'abc',
    });
  });

  it('answers no cursor on the last page', async () => {
    const server = aServer(async () => json(200, { items: [], nextCursor: null }));

    await expect(listShelfScans({}, server.options)).resolves.toStrictEqual({
      status: 'page',
      entries: [],
      next: null,
    });
  });
});

// Never rejects, and never a sentence: the screen words each of these (ADR 0011, FR-010).
describe('listShelfScans, when it fails', () => {
  it('says « offline » when nothing answers', async () => {
    const server = aServer(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(listShelfScans({}, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'offline',
    });
  });

  it.each([
    ['a server error', json(500, { statusCode: 500 })],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a page with a malformed item', json(200, { items: [{ id: 1 }], nextCursor: null })],
    ['a page with no items', json(200, { nextCursor: null })],
    ['a cursor that is not text', json(200, { items: [], nextCursor: 12 })],
    ['a 429 without a code', json(429, { statusCode: 429 })],
    ['a 429 of the daily cap', json(429, { code: 'DAILY_SCAN_QUOTA_EXCEEDED' })],
    ['a 400', json(400, { statusCode: 400 })],
  ])('says « unexpected » for %s', async (_label, response) => {
    const server = aServer(async () => response);

    await expect(listShelfScans({}, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'unexpected',
    });
  });

  it('says « rate limited » for the limit by source, told by its code', async () => {
    const server = aServer(async () => json(429, { code: 'TOO_MANY_REQUESTS' }));

    await expect(listShelfScans({}, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'rateLimited',
    });
  });
});

describe('thumbnailUrl', () => {
  it('points at the thumbnail of an upload', () => {
    expect(thumbnailUrl(anId, { baseUrl: 'http://api.test' })).toBe(
      `http://api.test/shelf-photos/${anId}/thumbnail`,
    );
  });

  it('encodes the id, which comes from outside', () => {
    expect(thumbnailUrl('a/b?c', { baseUrl: 'http://api.test' })).toBe(
      'http://api.test/shelf-photos/a%2Fb%3Fc/thumbnail',
    );
  });
});
