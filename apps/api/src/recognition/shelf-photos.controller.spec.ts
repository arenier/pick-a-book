import { Logger } from '@nestjs/common';
import { ShelfScanFailed, type ShelfPhotoStoragePort } from '@pick-a-book/recognition-domain';
import { err } from '@pick-a-book/shared-result';
import { describe, expect, it, vi } from 'vitest';

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

// The errors of the context arrive as `Err` values and leave as HTTP exceptions: the
// translation is `toHttpException`'s (recognition-http-error.spec.ts), the controller's part
// is to apply it, and to log what must not reach the caller.
describe('ShelfPhotosController says the errors of the context in HTTP', () => {
  it.each([
    ['an empty file', { ...aJpegUpload, buffer: Buffer.alloc(0) }],
    ['an unsupported media type', { ...aJpegUpload, mimetype: 'application/pdf' }],
    ['an image over 20 MB', { ...aJpegUpload, buffer: Buffer.alloc(20 * 1024 * 1024 + 1) }],
  ])('400, for %s', async (_label, upload) => {
    await expect(aShelfPhotosController().controller.store(upload)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('404, for an id that matches no photo', async () => {
    await expect(aShelfPhotosController().controller.scan('not-a-uuid')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('409, for a photo scanned twice', async () => {
    const { controller } = aShelfPhotosController();
    const { id } = await controller.store(aJpegUpload);
    await controller.scan(id);

    await expect(controller.scan(id)).rejects.toMatchObject({ status: 409 });
  });

  // The provider's answer can name a key or a quota: it is logged, and only a generic message
  // goes out (contracts/scan-api.md §2).
  it('502, for a scanner that failed, logging what the provider said', async () => {
    const failure = new ShelfScanFailed('provider unavailable');
    const { controller } = aShelfPhotosController({ scanner: { scan: async () => err(failure) } });
    const { id } = await controller.store(aJpegUpload);
    const log = vi.spyOn(Logger.prototype, 'error').mockReturnValue();

    await expect(controller.scan(id)).rejects.toMatchObject({ status: 502 });

    expect(log).toHaveBeenCalledWith(failure.message, failure.stack);
    log.mockRestore();
  });
});

describe('ShelfPhotosController lets infrastructure failures through', () => {
  // A bucket that fails is not the caller's mistake: nothing turns it into a 4xx. It stays an
  // exception, for the global filter of the API to catch.
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
