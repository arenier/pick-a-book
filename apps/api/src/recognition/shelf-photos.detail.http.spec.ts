import { describe, expect, it } from 'vitest';

import { aJpeg, aRunningApi, idOf } from './testing/running-api';

/**
 * The detail of an upload and its photo over real HTTP (specs/002-upload-history, US2,
 * contracts/shelf-photos-history-api.md §2, §3).
 */
const aThumbnail = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' });

const unknownId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

describe('GET /shelf-photos/:id', () => {
  const { upload, scan, get } = aRunningApi();

  it('answers 200 with the outcome and the books of a completed analysis', async () => {
    const id = idOf(await (await upload(aJpeg(), 'IMG_1.jpg', aThumbnail())).json());
    await scan(id);

    const response = await get(`/shelf-photos/${id}`);

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ id, outcome: 'completed', hasThumbnail: true });
    expect(body).toHaveProperty('books.0', {
      author: 'Marguerite Duras',
      title: "L'Amant",
      confidence: 0.94,
    });
  });

  it('answers no books for an upload that was never analysed', async () => {
    const id = idOf(await (await upload(aJpeg())).json());

    const body: unknown = await (await get(`/shelf-photos/${id}`)).json();

    expect(body).toMatchObject({ id, outcome: 'pending', hasThumbnail: false });
    expect(body).not.toHaveProperty('books');
  });

  it('answers 404 for an unknown id, and for an id that is not a UUID', async () => {
    expect((await get(`/shelf-photos/${unknownId}`)).status).toBe(404);
    expect((await get('/shelf-photos/not-a-uuid')).status).toBe(404);
  });
});

describe('GET /shelf-photos/:id/photo', () => {
  const { upload, get, losePhotos } = aRunningApi();

  it('answers 200 with the photo, in the type it was kept in, cached for good', async () => {
    const id = idOf(await (await upload(aJpeg())).json());

    const response = await get(`/shelf-photos/${id}/photo`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toStrictEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    );
  });

  it('answers 404 for an unknown id', async () => {
    expect((await get(`/shelf-photos/${unknownId}/photo`)).status).toBe(404);
  });

  // The scan exists but its photo is gone from the bucket: the `<img>` falls back like for any
  // other failure to load, and the books stay on screen (contract §3).
  it('answers 502 when the photo is no longer in the bucket', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    losePhotos();

    const response = await get(`/shelf-photos/${id}/photo`);

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toMatch(/shelf_photo|bucket|default\//u);
  });
});

describe('the detail, as seen from outside', () => {
  const { upload, get, scan, snapshot } = aRunningApi();

  it('says nothing of the original file name, the bucket key or the owner', async () => {
    const id = idOf(await (await upload(aJpeg(), 'IMG_SECRET.jpg')).json());
    await scan(id);

    const text = await (await get(`/shelf-photos/${id}`)).text();

    expect(text).not.toMatch(/IMG_SECRET|shelf_photo|bucket|originalFilename|ownerId|default/u);
  });

  // FR-013: opening an upload never pays for an analysis and never writes anything.
  it('changes nothing by being read', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    const before = snapshot();

    await get(`/shelf-photos/${id}`);
    await get(`/shelf-photos/${id}/photo`);

    expect(snapshot()).toStrictEqual(before);
  });
});
