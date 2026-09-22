import { afterEach, describe, expect, it, vi } from 'vitest';

import { submitShelfPhoto } from './scan-shelf-photo';

/**
 * `fetch` is mocked, against the contract written down in
 * `specs/001-photo-upload/contracts/scan-api.md` — the only description of the API this
 * slice may rely on. Importing the API's own types is forbidden by the module boundaries
 * (`scope:web` never depends on `scope:api`), which is why the contract is duplicated here
 * on purpose rather than shared.
 */
const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'IMG_0001.jpg', {
  type: 'image/jpeg',
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly body: BodyInit | null | undefined;
}

/** Answers the two chained calls in order, and records what was asked of each. */
const mockFetch = (...responses: (Response | Error)[]): RecordedCall[] => {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url, init) => {
      calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
      const next = responses.at(calls.length - 1);
      if (next === undefined) {
        throw new Error(`Unexpected call ${String(calls.length)} to ${url}`);
      }
      if (next instanceof Error) {
        throw next;
      }

      return next;
    },
  );
  vi.stubGlobal('fetch', fetchMock);

  return calls;
};

/** The message a failed submission carries, or nothing when it did not fail. */
const messageOf = (state: Awaited<ReturnType<typeof submitShelfPhoto>>) =>
  state.status === 'error' ? state.message : '';

/** The conditional lives here rather than in a test, which is where lint wants it. */
const photoField = (body: BodyInit | null | undefined) =>
  body instanceof FormData ? body.get('photo') : null;

const storedThenScanned = (books: unknown[]) => [
  jsonResponse(201, { id: 'a-uuid' }),
  jsonResponse(200, { books }),
];

describe('submitShelfPhoto, the happy path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the photo, then scans it, and answers with the books read', async () => {
    mockFetch(
      ...storedThenScanned([
        { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
        { title: 'Les Choses', confidence: 0.71 },
      ]),
    );

    const state = await submitShelfPhoto(photo);

    expect(state).toStrictEqual({
      status: 'success',
      books: [
        { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
        { author: undefined, title: 'Les Choses', confidence: 0.71 },
      ],
    });
  });
});

describe('submitShelfPhoto, what travels on the wire', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the two endpoints of the contract, in order', async () => {
    const calls = mockFetch(...storedThenScanned([]));

    await submitShelfPhoto(photo);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ url: 'http://localhost:3000/shelf-photos', method: 'POST' });
    expect(calls[1]).toMatchObject({
      url: 'http://localhost:3000/shelf-photos/a-uuid/scan',
      method: 'POST',
    });
  });

  it('sends the file under the field the API reads', async () => {
    const calls = mockFetch(...storedThenScanned([]));

    await submitShelfPhoto(photo);

    expect(calls[0]?.body).toBeInstanceOf(FormData);
    expect(photoField(calls[0]?.body)).toBe(photo);
  });

  // An empty shelf is a success carrying no book, never an error — the screen has its own
  // words for that case (US1 scenario 3).
  it('reads an empty shelf as a success carrying no book', async () => {
    mockFetch(...storedThenScanned([]));

    await expect(submitShelfPhoto(photo)).resolves.toStrictEqual({ status: 'success', books: [] });
  });
});

describe('submitShelfPhoto, when something goes wrong', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never asks for a scan when the photo was refused', async () => {
    const calls = mockFetch(jsonResponse(400, { message: 'empty image', statusCode: 400 }));

    const state = await submitShelfPhoto(photo);

    expect(state.status).toBe('error');
    expect(calls).toHaveLength(1);
  });

  // The body is JSON from the network: proven before use, never asserted (CLAUDE.md).
  it('refuses an answer that does not fit the contract', async () => {
    mockFetch(...storedThenScanned([{ title: 42 }]));

    const state = await submitShelfPhoto(photo);

    expect(state.status).toBe('error');
  });

  it('refuses a first answer that carries no id', async () => {
    mockFetch(jsonResponse(201, { identifier: 'a-uuid' }));

    const state = await submitShelfPhoto(photo);

    expect(state.status).toBe('error');
  });
});

describe('submitShelfPhoto, telling the failures apart (FR-006)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('says an upstream failure (502) in words of its own', async () => {
    mockFetch(jsonResponse(201, { id: 'a-uuid' }), jsonResponse(502, { statusCode: 502 }));

    const state = await submitShelfPhoto(photo);

    expect(state.status).toBe('error');
    expect(messageOf(state)).toMatch(/service de reconnaissance/iu);
    expect(messageOf(state)).not.toMatch(/aucun livre/iu);
  });

  // A dropped line is neither a refused photo nor a broken provider: it gets its own words
  // (contracts/scan-api.md, "Échec réseau").
  it('says a dropped connection on the first call in words of its own', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    const state = await submitShelfPhoto(photo);

    expect(messageOf(state)).toMatch(/connexion/iu);
  });

  it('says a dropped connection on the second call the same way', async () => {
    mockFetch(jsonResponse(201, { id: 'a-uuid' }), new TypeError('Failed to fetch'));

    const state = await submitShelfPhoto(photo);

    expect(messageOf(state)).toMatch(/connexion/iu);
  });

  it('never shows the same message for a refusal, a provider failure and a dropped line', async () => {
    mockFetch(jsonResponse(400, { statusCode: 400 }));
    const refused = messageOf(await submitShelfPhoto(photo));
    mockFetch(jsonResponse(201, { id: 'a-uuid' }), jsonResponse(502, { statusCode: 502 }));
    const upstream = messageOf(await submitShelfPhoto(photo));
    mockFetch(new TypeError('Failed to fetch'));
    const dropped = messageOf(await submitShelfPhoto(photo));

    expect(new Set([refused, upstream, dropped]).size).toBe(3);
  });
});
