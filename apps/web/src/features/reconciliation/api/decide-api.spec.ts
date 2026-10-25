import { describe, expect, it } from 'vitest';

import { decide } from './reconciliation-api';

const ID = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const reference = { recordId: 'ark:/12148/cb2', title: 'La chute', authors: ['Julie Moreau'] };
const decidedBook = {
  position: 4,
  read: { title: 'La Chute' },
  status: 'confirmed',
  confirmedBy: 'user',
  titleOnly: true,
  reference,
};

/** A `fetch` double that answers as told and records what it was asked. */
function aServer(respond: () => Promise<Response>) {
  const calls: { url: string; method: string | undefined; body: unknown }[] = [];
  const fetchDouble = async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method, body });
    return respond();
  };

  return { calls, options: { baseUrl: 'http://api.test', fetch: fetchDouble } };
}

describe('decide, the request', () => {
  it('posts the choice of a candidate to the decision of the book', async () => {
    const server = aServer(async () => json(200, decidedBook));

    await decide(ID, 4, { choice: 'candidate', recordId: 'ark:/12148/cb2' }, server.options);

    expect(server.calls).toStrictEqual([
      {
        url: `http://api.test/shelf-photos/${ID}/books/4/decision`,
        method: 'POST',
        body: { choice: 'candidate', recordId: 'ark:/12148/cb2' },
      },
    ]);
  });

  it('posts « none of them » as it is', async () => {
    const server = aServer(async () =>
      json(200, { position: 4, read: { title: 'x' }, status: 'not_found' }),
    );

    await decide(ID, 4, { choice: 'none' }, server.options);

    expect(server.calls[0]?.body).toStrictEqual({ choice: 'none' });
  });
});

describe('decide, the answer', () => {
  it('gives the book as it is now', async () => {
    const server = aServer(async () => json(200, decidedBook));

    const answer = await decide(ID, 4, { choice: 'none' }, server.options);

    expect(answer).toStrictEqual({
      status: 'book',
      book: {
        position: 4,
        read: { title: 'La Chute', author: undefined },
        status: 'confirmed',
        confirmedBy: 'user',
        titleOnly: true,
        reference,
      },
    });
  });

  it('refuses a body that is not a book', async () => {
    const server = aServer(async () => json(200, { position: 4, status: 'perhaps' }));

    await expect(decide(ID, 4, { choice: 'none' }, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'unexpected',
    });
  });
});

describe('decide, the failures are kinds (ADR 0011), never a rejection', () => {
  it.each([
    [409, 'conflict'],
    [429, 'rateLimited'],
    [400, 'unexpected'],
    [404, 'unexpected'],
    [500, 'unexpected'],
  ] as const)('says %s as %s', async (status, failure) => {
    const server = aServer(async () => json(status, { statusCode: status }));

    await expect(decide(ID, 4, { choice: 'none' }, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure,
    });
  });

  it('says offline when nothing answers', async () => {
    const server = aServer(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(decide(ID, 4, { choice: 'none' }, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'offline',
    });
  });
});
