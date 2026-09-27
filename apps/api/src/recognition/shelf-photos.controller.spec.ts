import {
  InvalidShelfPhoto,
  ShelfScanAlreadyProcessed,
  ShelfScanFailed,
  ShelfScanNotFound,
  type ShelfPhotoStoragePort,
} from '@pick-a-book/recognition-domain';
import { describe, expect, it } from 'vitest';

import { aShelfPhotosController } from './testing/shelf-photos-controller.fixture';

/** A minimal valid JPEG header — `ShelfPhoto` only checks that the bytes are not empty. */
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const aJpegUpload = { buffer: jpegBytes, mimetype: 'image/jpeg', originalname: 'IMG_0001.jpg' };

describe('ShelfPhotosController', () => {
  it('stores an uploaded photo and answers with its id', async () => {
    const { controller, records } = aShelfPhotosController();

    const { id } = await controller.store(aJpegUpload);

    expect(records.get(id)?.status).toBe('pending');
  });

  // FR-015: the id names the photo; nothing about the uploaded file comes back.
  it('answers with the id alone', async () => {
    const { controller } = aShelfPhotosController();

    const response = await controller.store(aJpegUpload);

    expect(Object.keys(response)).toStrictEqual(['id']);
  });

  it('answers the scan of a stored photo with the detected books', async () => {
    const { controller } = aShelfPhotosController();
    const { id } = await controller.store(aJpegUpload);

    const result = await controller.scan(id);

    expect(result.books[0]).toStrictEqual({
      author: 'Marguerite Duras',
      title: "L'Amant",
      confidence: 0.94,
    });
  });
});

// Only the missing file is the controller's to refuse: it is a matter of HTTP form.
describe('ShelfPhotosController, without a file', () => {
  it('answers 400', async () => {
    await expect(aShelfPhotosController().controller.store()).rejects.toMatchObject({
      status: 400,
    });
  });
});

// Domain errors cross the controller untranslated: `RecognitionExceptionFilter` says them
// in HTTP, once for every route (shelf-photos.http.spec.ts proves the status codes).
describe('ShelfPhotosController lets domain errors through', () => {
  it.each([
    ['an empty file', { ...aJpegUpload, buffer: Buffer.alloc(0) }],
    ['an unsupported media type', { ...aJpegUpload, mimetype: 'application/pdf' }],
    ['an image over 20 MB', { ...aJpegUpload, buffer: Buffer.alloc(20 * 1024 * 1024 + 1) }],
  ])('InvalidShelfPhoto, for %s', async (_label, upload) => {
    await expect(aShelfPhotosController().controller.store(upload)).rejects.toThrow(
      InvalidShelfPhoto,
    );
  });

  it('ShelfScanFailed', async () => {
    const { controller } = aShelfPhotosController({
      scanner: {
        scan: async () => {
          throw new ShelfScanFailed('provider unavailable');
        },
      },
    });
    const { id } = await controller.store(aJpegUpload);

    await expect(controller.scan(id)).rejects.toThrow(ShelfScanFailed);
  });
});

describe('ShelfPhotosController lets scan errors through', () => {
  it('ShelfScanNotFound', async () => {
    await expect(aShelfPhotosController().controller.scan('not-a-uuid')).rejects.toThrow(
      ShelfScanNotFound,
    );
  });

  it('ShelfScanAlreadyProcessed', async () => {
    const { controller } = aShelfPhotosController();
    const { id } = await controller.store(aJpegUpload);
    await controller.scan(id);

    await expect(controller.scan(id)).rejects.toThrow(ShelfScanAlreadyProcessed);
  });
});

describe('ShelfPhotosController lets infrastructure failures through', () => {
  // A bucket that fails is not the caller's mistake: nothing turns it into a 4xx.
  it('and a storage failure, as is', async () => {
    const failingStorage: ShelfPhotoStoragePort = {
      store: async () => {
        throw new Error('bucket unavailable');
      },
      retrieve: async () => {
        throw new Error('bucket unavailable');
      },
    };
    const { controller } = aShelfPhotosController({ storage: failingStorage });

    await expect(controller.store(aJpegUpload)).rejects.not.toHaveProperty('status');
  });
});
