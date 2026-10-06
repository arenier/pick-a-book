import { describe, expect, it } from 'vitest';

import { aJpeg, aRunningApi, idOf } from './testing/running-api';

/**
 * What the browser may keep of an image (specs/002-upload-history, research.md §7): an image never
 * changes under its id, so a success is cached for good — and only a success. An error is not an
 * image, and announcing it immutable would keep a transient 404 or 502 for a year.
 */
const aThumbnail = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 7])], { type: 'image/jpeg' });

const unknownScan = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

describe.each(['photo', 'thumbnail'])('the %s of a scan, cache headers', (kind) => {
  const { upload, get } = aRunningApi();

  it('is kept as immutable and private when it is sent', async () => {
    const id = idOf(await (await upload(aJpeg(), 'IMG_1.jpg', aThumbnail())).json());

    const response = await get(`/shelf-photos/${id}/${kind}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
  });

  it('is not announced immutable when the scan is unknown (404)', async () => {
    const response = await get(`/shelf-photos/${unknownScan}/${kind}`);

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBeNull();
  });
});

describe('the photo of a scan whose bucket lost it', () => {
  const { upload, get, losePhotos } = aRunningApi();

  it('is not announced immutable (502)', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    losePhotos();

    const response = await get(`/shelf-photos/${id}/photo`);

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBeNull();
  });
});
