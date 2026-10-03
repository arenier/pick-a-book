import { describe, expect, it } from 'vitest';

import { submitShelfPhoto } from './scan-shelf-photo';

/**
 * The thumbnail rides along with the photo, in the same `POST /shelf-photos`
 * (specs/002-upload-history, research.md §5, contracts §5). Making it is the browser's job and is
 * handed in: what is checked here is what is sent.
 */
const aPhoto = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], 'IMG_0001.jpg', { type: 'image/jpeg' });

const aThumbnail = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A browser that could not make one. */
const noThumbnail = async (): Promise<Blob | undefined> => {
  // Nothing to make: the browser could not decode the photo.
};

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

/** A server that stores the photo, then scans it, remembering the forms it was sent. */
function aServer() {
  const forms: FormData[] = [];
  const fetchDouble = async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.body instanceof FormData) {
      forms.push(init.body);

      return json(201, { id: anId });
    }

    return json(200, { books: [] });
  };

  return { forms, fetch: fetchDouble };
}

describe('submitShelfPhoto, with a thumbnail', () => {
  it('sends it as the multipart field "thumbnail", next to the photo', async () => {
    const server = aServer();
    const thumbnail = aThumbnail();

    await submitShelfPhoto(aPhoto(), {
      baseUrl: 'http://api.test',
      fetch: server.fetch,
      makeThumbnail: async () => thumbnail,
    });

    const sent = server.forms[0]?.get('thumbnail');
    expect(sent).toBeInstanceOf(File);
    expect(sent).toMatchObject({ type: 'image/jpeg' });
    expect(server.forms[0]?.get('photo')).toBeInstanceOf(File);
  });

  it('hands the photo to the one that makes it', async () => {
    const server = aServer();
    const photo = aPhoto();
    const received: File[] = [];

    await submitShelfPhoto(photo, {
      baseUrl: 'http://api.test',
      fetch: server.fetch,
      makeThumbnail: async (given) => {
        received.push(given);
      },
    });

    expect(received).toStrictEqual([photo]);
  });
});

// No thumbnail is not a failure: the upload goes on, and the history shows a neutral indicator.
describe('submitShelfPhoto, without a thumbnail', () => {
  it('does not send the field, and the upload still succeeds', async () => {
    const server = aServer();

    const state = await submitShelfPhoto(aPhoto(), {
      baseUrl: 'http://api.test',
      fetch: server.fetch,
      makeThumbnail: noThumbnail,
    });

    expect(server.forms[0]?.has('thumbnail')).toBe(false);
    expect(state).toStrictEqual({ status: 'success', books: [] });
  });
});
