import { describe, expect, it } from 'vitest';

import { submitShelfPhoto } from './scan-shelf-photo';

const aPhoto = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'IMG_0001.jpg', { type: 'image/jpeg' });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

/** A `fetch` double answering the two steps in turn, and recording what it was asked. */
function aServer(...responses: (() => Promise<Response>)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchDouble = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    const next = responses.at(calls.length - 1);
    if (next === undefined) {
      throw new Error(`unexpected call ${calls.length}`);
    }
    return next();
  };

  return { calls, fetch: fetchDouble };
}

/** The multipart field a request carried, proven to be form data first. */
function fieldOf(init: RequestInit | undefined, name: string) {
  if (!(init?.body instanceof FormData)) {
    throw new TypeError('the request body is not form data');
  }
  return init.body.get(name);
}

const options = (fetchDouble: typeof fetch) => ({
  baseUrl: 'http://api.test',
  fetch: fetchDouble,
});

describe('submitShelfPhoto', () => {
  it('stores the photo, then scans it by the id it got back', async () => {
    const server = aServer(
      async () => json(201, { id: anId }),
      async () => json(200, { books: [] }),
    );

    await submitShelfPhoto(aPhoto(), options(server.fetch));

    expect(server.calls.map((call) => [call.init?.method, call.url])).toStrictEqual([
      ['POST', 'http://api.test/shelf-photos'],
      ['POST', `http://api.test/shelf-photos/${anId}/scan`],
    ]);
  });

  it('sends the photo as the multipart field "photo"', async () => {
    const server = aServer(
      async () => json(201, { id: anId }),
      async () => json(200, { books: [] }),
    );
    const photo = aPhoto();

    await submitShelfPhoto(photo, options(server.fetch));

    expect(fieldOf(server.calls[0]?.init, 'photo')).toStrictEqual(photo);
  });
});

describe('submitShelfPhoto, on success', () => {
  it('succeeds with the detected books, author left out when unknown', async () => {
    const server = aServer(
      async () => json(201, { id: anId }),
      async () =>
        json(200, {
          books: [
            { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
            { title: 'Les Choses', confidence: 0.71 },
          ],
        }),
    );

    const state = await submitShelfPhoto(aPhoto(), options(server.fetch));

    expect(state).toStrictEqual({
      status: 'success',
      books: [
        { author: 'Albert Camus', title: 'La Peste', confidence: 0.92 },
        { author: undefined, title: 'Les Choses', confidence: 0.71 },
      ],
    });
  });

  // US1, scenario 3: an empty shelf is a result.
  it('succeeds with no book when the shelf holds none', async () => {
    const server = aServer(
      async () => json(201, { id: anId }),
      async () => json(200, { books: [] }),
    );

    await expect(submitShelfPhoto(aPhoto(), options(server.fetch))).resolves.toStrictEqual({
      status: 'success',
      books: [],
    });
  });
});

const failing = (status: number) => async () => json(status, { statusCode: status, message: 'x' });

const offline = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch');
};

const stored = async () => json(201, { id: anId });

const messageOf = async (...responses: (() => Promise<Response>)[]) => {
  const state = await submitShelfPhoto(aPhoto(), options(aServer(...responses).fetch));
  expect(state.status).toBe('error');
  return 'message' in state ? state.message : '';
};

// FR-006: each failure says what happened, and none reads as "no book detected".
describe('submitShelfPhoto, on failure', () => {
  it('blames the photo when the server refuses it', async () => {
    await expect(messageOf(failing(400))).resolves.toBe(
      'La photo a été refusée : elle doit être une image JPEG, PNG, WebP ou HEIC de moins de 20 Mo.',
    );
    await expect(messageOf(failing(413))).resolves.toBe(await messageOf(failing(400)));
  });

  it('blames the recognition service when it is down', async () => {
    await expect(messageOf(stored, failing(502))).resolves.toBe(
      'Le service de reconnaissance ne répond pas pour le moment. Réessayez dans quelques instants.',
    );
  });

  it('falls back to a generic message for anything else', async () => {
    await expect(messageOf(stored, failing(409))).resolves.toBe(
      'Une erreur inattendue est survenue. Réessayez dans quelques instants.',
    );
    await expect(messageOf(failing(500))).resolves.toBe(await messageOf(stored, failing(409)));
  });
});

// contracts/scan-api.md, "Échec réseau": no HTTP answer at all, on either step.
describe('submitShelfPhoto, without a network', () => {
  const networkMessage =
    'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.';

  it('says the server could not be reached while sending the photo', async () => {
    await expect(messageOf(offline)).resolves.toBe(networkMessage);
  });

  it('says the server could not be reached while scanning it', async () => {
    await expect(messageOf(stored, offline)).resolves.toBe(networkMessage);
  });

  it('keeps that message apart from every other one', async () => {
    const others = await Promise.all([
      messageOf(failing(400)),
      messageOf(stored, failing(502)),
      messageOf(stored, failing(409)),
    ]);

    expect(others).not.toContain(networkMessage);
  });
});
