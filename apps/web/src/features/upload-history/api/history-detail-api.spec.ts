import { describe, expect, it } from 'vitest';

import { getShelfScan, photoUrl } from './history-api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

const aDetail = {
  id: anId,
  createdAt: '2026-09-27T14:03:12.481Z',
  outcome: 'completed',
  books: [
    { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
    { title: 'Les Choses', confidence: 0.71 },
  ],
  hasThumbnail: true,
};

const { books: _books, ...withoutBooks } = aDetail;

function aServer(answer: () => Promise<Response>) {
  const urls: string[] = [];
  const fetchDouble = async (input: string | URL | Request) => {
    urls.push(input instanceof Request ? input.url : String(input));

    return answer();
  };

  return { urls, options: { baseUrl: 'http://api.test', fetch: fetchDouble } };
}

describe('getShelfScan, what it asks', () => {
  it('asks for the upload by its id, encoded', async () => {
    const server = aServer(async () => json(200, aDetail));

    await getShelfScan('a/b', server.options);

    expect(server.urls).toStrictEqual(['http://api.test/shelf-photos/a%2Fb']);
  });
});

describe('getShelfScan, what it finds', () => {
  it('finds its entry and its books, the author left out when unknown', async () => {
    const server = aServer(async () => json(200, aDetail));

    await expect(getShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'found',
      entry: {
        id: anId,
        sentAt: new Date('2026-09-27T14:03:12.481Z'),
        outcome: { kind: 'books', count: 2 },
        hasThumbnail: true,
      },
      books: [
        { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
        { author: undefined, title: 'Les Choses', confidence: 0.71 },
      ],
    });
  });

  it('finds an empty list of books for an analysis that found none', async () => {
    const server = aServer(async () => json(200, { ...aDetail, books: [] }));

    const answer = await getShelfScan(anId, server.options);

    expect(answer).toMatchObject({
      status: 'found',
      entry: { outcome: { kind: 'none' } },
      books: [],
    });
  });

  it.each([
    ['failed', { kind: 'failed' }],
    ['pending', { kind: 'notStarted' }],
  ])('finds no books at all for an upload that is %s', async (outcome, expected) => {
    const server = aServer(async () =>
      json(200, { id: anId, createdAt: aDetail.createdAt, outcome, hasThumbnail: false }),
    );

    const answer = await getShelfScan(anId, server.options);

    expect(answer).toMatchObject({ status: 'found', entry: { outcome: expected } });
    expect(answer).not.toHaveProperty('books.length');
  });
});

// A 404 is not a failure: the link is stale or wrong, and the screen says so (Edge Cases).
describe('getShelfScan, when it finds nothing', () => {
  it('says « not found » for a 404', async () => {
    const server = aServer(async () => json(404, { statusCode: 404 }));

    await expect(getShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'notFound',
    });
  });

  it('says « offline » when nothing answers', async () => {
    const server = aServer(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(getShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'offline',
    });
  });

  it('says « rate limited » for the limit by source, told by its code', async () => {
    const server = aServer(async () => json(429, { code: 'TOO_MANY_REQUESTS' }));

    await expect(getShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'rateLimited',
    });
  });
});

describe('getShelfScan, when the body is not the contract', () => {
  it.each([
    ['a server error', json(500, {})],
    ['a body that is not JSON', new Response('<html>', { status: 200 })],
    ['a completed upload with no books', json(200, withoutBooks)],
    ['a book with no title', json(200, { ...aDetail, books: [{ confidence: 0.5 }] })],
    [
      'a book with a confidence that is not a number',
      json(200, { ...aDetail, books: [{ title: 'x', confidence: 'high' }] }),
    ],
    [
      'an author that is not text',
      json(200, { ...aDetail, books: [{ title: 'x', author: 4, confidence: 1 }] }),
    ],
    ['an unknown outcome', json(200, { ...aDetail, outcome: 'running' })],
    ['a date that is not one', json(200, { ...aDetail, createdAt: 'yesterday' })],
  ])('says « unexpected » for %s', async (_label, response) => {
    const server = aServer(async () => response);

    await expect(getShelfScan(anId, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'unexpected',
    });
  });
});

describe('photoUrl', () => {
  it('points at the photo of an upload, the id encoded', () => {
    expect(photoUrl(anId, { baseUrl: 'http://api.test' })).toBe(
      `http://api.test/shelf-photos/${anId}/photo`,
    );
    expect(photoUrl('a/b', { baseUrl: 'http://api.test' })).toBe(
      'http://api.test/shelf-photos/a%2Fb/photo',
    );
  });
});
