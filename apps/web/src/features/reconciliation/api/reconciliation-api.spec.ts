import { describe, expect, it } from 'vitest';

import { readReconciliation, reconcile } from './reconciliation-api';

const ID = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const reference = { recordId: 'ark:/12148/cb1', title: 'La peste', authors: ['Albert Camus'] };
const read = { title: 'La Pest', author: 'Albert Camus' };

/** A `fetch` double that answers as told and records what it was asked. */
function aServer(respond: () => Promise<Response>) {
  const calls: { url: string; method: string | undefined }[] = [];
  const fetchDouble = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), method: init?.method });
    return respond();
  };

  return { calls, options: { baseUrl: 'http://api.test', fetch: fetchDouble } };
}

describe('reconcile and readReconciliation, the requests', () => {
  it('reconciles with a POST on the reconciliation of the analysis', async () => {
    const server = aServer(async () => json(200, { books: [] }));

    await reconcile(ID, server.options);

    expect(server.calls).toStrictEqual([
      { url: `http://api.test/shelf-photos/${ID}/reconciliation`, method: 'POST' },
    ]);
  });

  it('reads with a GET on the same address', async () => {
    const server = aServer(async () => json(200, { books: [] }));

    await readReconciliation(ID, server.options);

    expect(server.calls).toStrictEqual([
      { url: `http://api.test/shelf-photos/${ID}/reconciliation`, method: undefined },
    ]);
  });
});

describe('reconcile, the books of an answer', () => {
  it('reads each status with what it carries', async () => {
    const server = aServer(async () =>
      json(200, {
        books: [
          {
            position: 0,
            read,
            status: 'confirmed',
            confirmedBy: 'automatic',
            titleOnly: false,
            reference,
          },
          {
            position: 1,
            read: { title: 'La Chute' },
            status: 'ambiguous',
            candidates: [reference, reference],
          },
          { position: 2, read: { title: 'Rien' }, status: 'not_found' },
          { position: 3, read: { title: 'Autre' }, status: 'not_verified' },
        ],
      }),
    );

    const answer = await reconcile(ID, server.options);

    expect(answer).toStrictEqual({
      status: 'books',
      books: [
        {
          position: 0,
          read,
          status: 'confirmed',
          confirmedBy: 'automatic',
          titleOnly: false,
          reference,
        },
        {
          position: 1,
          read: { title: 'La Chute', author: undefined },
          status: 'ambiguous',
          candidates: [reference, reference],
        },
        { position: 2, read: { title: 'Rien', author: undefined }, status: 'not_found' },
        { position: 3, read: { title: 'Autre', author: undefined }, status: 'not_verified' },
      ],
    });
  });
});

describe('readReconciliation, the kept state', () => {
  it('reads a book never tried as pending, in a read of the kept state', async () => {
    const server = aServer(async () =>
      json(200, { books: [{ position: 0, read: { title: 'Rien' }, status: 'pending' }] }),
    );

    const answer = await readReconciliation(ID, server.options);

    expect(answer).toMatchObject({ status: 'books', books: [{ status: 'pending' }] });
  });

  it('reads an analysis without any book as an empty list', async () => {
    const server = aServer(async () => json(200, { books: [] }));

    await expect(reconcile(ID, server.options)).resolves.toStrictEqual({
      status: 'books',
      books: [],
    });
  });
});

const candidate = (n: number) => ({ ...reference, recordId: `ark:/12148/cb${n}` });

const REFUSED_BOOKS = [
  [
    'a confirmed book without a reference',
    { position: 0, read, status: 'confirmed', confirmedBy: 'automatic', titleOnly: false },
  ],
  [
    'a confirmed book of an unknown origin',
    {
      position: 0,
      read,
      status: 'confirmed',
      confirmedBy: 'oracle',
      titleOnly: false,
      reference,
    },
  ],
  [
    'a confirmed book without titleOnly',
    { position: 0, read, status: 'confirmed', confirmedBy: 'user', reference },
  ],
  [
    'an ambiguous book without candidates',
    { position: 0, read, status: 'ambiguous', candidates: [] },
  ],
  [
    'an ambiguous book with six candidates',
    {
      position: 0,
      read,
      status: 'ambiguous',
      candidates: [1, 2, 3, 4, 5, 6].map((n) => candidate(n)),
    },
  ],
  ['a book of an unknown status', { position: 0, read, status: 'perhaps' }],
  ['a book without a position', { read, status: 'not_found' }],
  ['a book whose title is not text', { position: 0, read: { title: 4 }, status: 'not_found' }],
  [
    'a reference without authors',
    {
      position: 0,
      read,
      status: 'confirmed',
      confirmedBy: 'automatic',
      titleOnly: false,
      reference: { recordId: 'x', title: 'y' },
    },
  ],
] as const;

describe('reconcile, an answer that is not the contract is refused whole', () => {
  it.each(REFUSED_BOOKS)('refuses %s', async (_name, book) => {
    const answer = await reconcile(ID, aServer(async () => json(200, { books: [book] })).options);

    expect(answer).toStrictEqual({ status: 'error', failure: 'unexpected' });
  });

  it('keeps none of the books when one of them is wrong', async () => {
    const server = aServer(async () =>
      json(200, {
        books: [
          { position: 0, read, status: 'not_found' },
          { position: 1, status: 'not_found' },
        ],
      }),
    );

    await expect(reconcile(ID, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'unexpected',
    });
  });

  it('accepts a single candidate: the ambiguity of a title the record does not explain', async () => {
    const server = aServer(async () =>
      json(200, { books: [{ position: 0, read, status: 'ambiguous', candidates: [reference] }] }),
    );

    await expect(reconcile(ID, server.options)).resolves.toMatchObject({ status: 'books' });
  });
});

describe('reconcile, the failures are kinds (ADR 0011), never a rejection', () => {
  it('says offline when nothing answers', async () => {
    const server = aServer(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(reconcile(ID, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'offline',
    });
    await expect(readReconciliation(ID, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'offline',
    });
  });

  it('says rateLimited on a 429', async () => {
    const server = aServer(async () => json(429, { statusCode: 429, code: 'TOO_MANY_REQUESTS' }));

    await expect(reconcile(ID, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'rateLimited',
    });
  });

  it.each([404, 409, 500, 502])('says unexpected on a %s', async (status) => {
    const server = aServer(async () => json(status, { statusCode: status }));

    await expect(reconcile(ID, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'unexpected',
    });
  });

  it('says unexpected for a body that is not JSON', async () => {
    const server = aServer(async () => new Response('<html/>', { status: 200 }));

    await expect(reconcile(ID, server.options)).resolves.toStrictEqual({
      status: 'error',
      failure: 'unexpected',
    });
  });
});
