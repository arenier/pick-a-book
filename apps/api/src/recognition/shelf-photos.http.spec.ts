import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ShelfPhotosController } from './shelf-photos.controller';
import { aShelfPhotosController } from './testing/shelf-photos-controller.fixture';

const aJpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });

/** The id out of a 201 body, proven rather than cast. */
function idOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string') {
    throw new Error(`no id in ${JSON.stringify(body)}`);
  }
  return body.id;
}

/**
 * The two routes over real HTTP — status codes, multipart parsing by multer — on an
 * ephemeral port, the use cases running over in-memory ports. Called inside a `describe`.
 */
function aRunningApi() {
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const { storeShelfPhoto, scanStoredShelfPhoto } = aShelfPhotosController();
    const moduleRef = await Test.createTestingModule({
      controllers: [ShelfPhotosController],
      providers: [
        { provide: StoreShelfPhotoUseCase, useValue: storeShelfPhoto },
        { provide: ScanStoredShelfPhotoUseCase, useValue: scanStoredShelfPhoto },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  return {
    url: (path: string) => `${baseUrl}${path}`,
    upload: async (file: Blob, name = 'IMG_0001.jpg') => {
      const form = new FormData();
      form.append('photo', file, name);
      return fetch(`${baseUrl}/shelf-photos`, { method: 'POST', body: form });
    },
  };
}

describe('POST /shelf-photos then POST /shelf-photos/:id/scan', () => {
  const { url, upload } = aRunningApi();

  // A stored photo is a resource coming into being; a scan creates nothing.
  it('answers 201 with an id, then 200 with the books', async () => {
    const stored = await upload(aJpeg());
    const body: unknown = await stored.json();

    expect(stored.status).toBe(201);
    expect(body).toStrictEqual({ id: idOf(body) });

    const scanned = await fetch(url(`/shelf-photos/${idOf(body)}/scan`), { method: 'POST' });

    const result: unknown = await scanned.json();
    expect(scanned.status).toBe(200);
    expect(result).toHaveProperty('books.length', 4);
  });
});

describe('POST /shelf-photos, refusing a photo', () => {
  const { upload } = aRunningApi();

  // multer stops an oversized file before it is buffered whole: 413, the transport's own
  // answer to a body over its limit (contracts/scan-api.md §1).
  it('answers 413 to a photo over 20 MB, and stores nothing', async () => {
    const oversized = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: 'image/jpeg' });

    const response = await upload(oversized);

    expect(response.status).toBe(413);
  });

  it('answers 400 to a file that is not a supported image', async () => {
    const response = await upload(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), 'a.pdf');

    expect(response.status).toBe(400);
  });
});
