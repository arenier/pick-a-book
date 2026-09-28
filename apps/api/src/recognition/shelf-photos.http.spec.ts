import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import { ShelfScanFailed, type ShelfScannerPort } from '@pick-a-book/recognition-domain';
import { err } from '@pick-a-book/shared-result';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { applyHttpBoundary } from '../http/http-boundary';
import { errorBodyOf } from '../http/testing/error-body';
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
function aRunningApi(scanner?: ShelfScannerPort) {
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const { storeShelfPhoto, scanStoredShelfPhoto } = aShelfPhotosController({ scanner });
    const moduleRef = await Test.createTestingModule({
      controllers: [ShelfPhotosController],
      providers: [
        { provide: StoreShelfPhotoUseCase, useValue: storeShelfPhoto },
        { provide: ScanStoredShelfPhotoUseCase, useValue: scanStoredShelfPhoto },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // The API as it boots: the status codes below are the controller's work, their body the
    // global filter's.
    applyHttpBoundary(app, { webOrigin: 'http://localhost:4200' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const url = (path: string) => `${baseUrl}${path}`;

  return {
    url,
    scan: async (id: string) => fetch(url(`/shelf-photos/${id}/scan`), { method: 'POST' }),
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
  const { url, upload } = aRunningApi();

  // multer stops an oversized file before it is buffered whole: 413, the transport's own
  // answer to a body over its limit (contracts/scan-api.md §1).
  it('answers 413 to a photo over 20 MB, and stores nothing', async () => {
    const oversized = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: 'image/jpeg' });

    const response = await upload(oversized);

    expect(response.status).toBe(413);
  });

  // Multipart only (contracts/scan-api.md §1): the base64 JSON fallback had no caller, and
  // Nest's JSON body limit capped it at ~75 KB of image anyway.
  it('answers 400 to a JSON body, which carries no photo field', async () => {
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');

    const response = await fetch(url('/shelf-photos'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
    });

    expect(response.status).toBe(400);
  });

  it('answers 400 to an empty file', async () => {
    const response = await upload(new Blob([], { type: 'image/jpeg' }));

    expect(response.status).toBe(400);
  });

  it('answers 400 to a file that is not a supported image', async () => {
    const response = await upload(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), 'a.pdf');

    expect(response.status).toBe(400);
  });
});

/** What a provider says when it refuses: nothing the caller should read. */
const providerAnswer = 'Gemini answered 400 (API key not valid. Please pass a valid API key.)';

const scanFailure = new ShelfScanFailed(providerAnswer);

const failingScanner: ShelfScannerPort = {
  scan: async () => err(scanFailure),
};

// Domain errors of the scan, as HTTP says them (contracts/scan-api.md §2).
describe('POST /shelf-photos/:id/scan, for a photo it cannot scan', () => {
  const { upload, scan } = aRunningApi();

  it('answers 404 to an unknown id, well-formed or not', async () => {
    expect((await scan('1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b')).status).toBe(404);
    expect((await scan('not-a-uuid')).status).toBe(404);
  });

  it('answers 409 to a second scan of the same photo', async () => {
    const id = idOf(await (await upload(aJpeg())).json());
    await scan(id);

    expect((await scan(id)).status).toBe(409);
  });
});

describe('POST /shelf-photos/:id/scan, when the recognition service fails', () => {
  const { upload, scan } = aRunningApi(failingScanner);

  // The provider's answer can name keys, quotas or models: it goes to the logs, never out.
  it('answers 502 with a generic message, and logs what the provider said', async () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const id = idOf(await (await upload(aJpeg())).json());

    const response = await scan(id);

    expect(response.status).toBe(502);
    const body = await errorBodyOf(response);
    expect({ statusCode: body.statusCode, message: body.message }).toStrictEqual({
      statusCode: 502,
      message: 'The recognition service is unavailable',
    });
    // Nothing else leaves: no extra field, and the provider's answer nowhere in the body.
    expect(new Set(Object.keys(body))).toStrictEqual(
      new Set(['message', 'path', 'statusCode', 'timestamp']),
    );
    expect(JSON.stringify(body)).not.toContain(providerAnswer);
    expect(log).toHaveBeenCalledWith(scanFailure.message, scanFailure.stack);
    log.mockRestore();
  });
});
