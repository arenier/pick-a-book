import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { aJpeg, aRunningApi, idOf } from './testing/running-api';

/**
 * The history over real HTTP (specs/002-upload-history, contracts/shelf-photos-history-api.md
 * §1, §4, §5): a page of scans, the thumbnail of one, and the thumbnail sent with a photo.
 */
const aThumbnail = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 7])], { type: 'image/jpeg' });

/** A page of the history, proven to have the shape of the contract (§1) rather than assumed. */
async function pageOf(response: Response) {
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('items' in body) ||
    !Array.isArray(body.items) ||
    !('nextCursor' in body) ||
    (body.nextCursor !== null && typeof body.nextCursor !== 'string')
  ) {
    throw new TypeError(`not a page of the history: ${JSON.stringify(body)}`);
  }

  return { items: body.items, nextCursor: body.nextCursor };
}

describe('GET /shelf-photos', () => {
  const { upload, get } = aRunningApi();

  it('answers 200 with a page: its items and the cursor of the next, null on the last', async () => {
    const id = idOf(await (await upload(aJpeg(), 'IMG_1.jpg', aThumbnail())).json());

    const response = await get('/shelf-photos');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [{ id, outcome: 'pending', hasThumbnail: true }],
      nextCursor: null,
    });
  });

  it('pages: the cursor of a page leads to the next one', async () => {
    await upload(aJpeg());
    await upload(aJpeg());

    const first = await pageOf(await get('/shelf-photos?limit=1'));
    const second = await pageOf(await get(`/shelf-photos?limit=1&cursor=${first.nextCursor}`));

    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(second.items).not.toStrictEqual(first.items);
  });

  it.each(['limit=51', 'limit=0', 'limit=abc', 'limit=1.5', 'cursor=abc', 'limit=1&limit=2'])(
    'answers 400 to ?%s',
    async (query) => {
      expect((await get(`/shelf-photos?${query}`)).status).toBe(400);
    },
  );
});

describe('GET /shelf-photos/:id/thumbnail', () => {
  const { upload, get } = aRunningApi();

  it('answers 200 with the thumbnail, its media type, and a cache that never expires', async () => {
    const id = idOf(await (await upload(aJpeg(), 'IMG_1.jpg', aThumbnail())).json());

    const response = await get(`/shelf-photos/${id}/thumbnail`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 7]),
    );
  });

  it('answers 404 for a scan sent without one, for an unknown id and for a malformed one', async () => {
    const id = idOf(await (await upload(aJpeg())).json());

    expect((await get(`/shelf-photos/${id}/thumbnail`)).status).toBe(404);
    expect((await get('/shelf-photos/1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b/thumbnail')).status).toBe(
      404,
    );
    expect((await get('/shelf-photos/not-a-uuid/thumbnail')).status).toBe(404);
  });
});

// An unusable thumbnail never costs the user their photo (research.md §5).
describe('POST /shelf-photos, with a thumbnail it refuses', () => {
  const { upload, get } = aRunningApi();

  it('answers 201 all the same, keeps the photo without a thumbnail, and warns', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const tooBig = new Blob([new Uint8Array(300 * 1024)], { type: 'image/jpeg' });

    const response = await upload(aJpeg(), 'IMG_1.jpg', tooBig);

    expect(response.status).toBe(201);
    const id = idOf(await response.json());
    expect((await get(`/shelf-photos/${id}/thumbnail`)).status).toBe(404);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('image too large'));
    warn.mockRestore();
  });
});

describe('the history, as seen from outside', () => {
  const { upload, get, scan, snapshot } = aRunningApi();

  // FR-009: no file name, no key in the bucket, no owner — on any route of the history.
  it('never says the original file name, the bucket key or the owner', async () => {
    const id = idOf(await (await upload(aJpeg(), 'IMG_SECRET.jpg', aThumbnail())).json());
    await scan(id);

    const page = await (await get('/shelf-photos')).text();

    expect(page).not.toMatch(/IMG_SECRET|shelf_photo|bucket|originalFilename|ownerId|default/u);
  });

  // FR-013: looking at the history never pays for an analysis, never writes a scan or a file.
  it('changes nothing by being read', async () => {
    const id = idOf(await (await upload(aJpeg(), 'IMG_1.jpg', aThumbnail())).json());
    const before = snapshot();

    await get('/shelf-photos');
    await get(`/shelf-photos/${id}/thumbnail`);

    expect(snapshot()).toStrictEqual(before);
  });
});
