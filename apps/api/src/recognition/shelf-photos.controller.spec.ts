import { ShelfScanFailed, type ShelfPhotoStoragePort } from '@pick-a-book/recognition-domain';
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

describe('ShelfPhotosController refuses a photo with 400 (contracts/scan-api.md §1)', () => {
  it('when no file is given', async () => {
    await expect(aShelfPhotosController().controller.store()).rejects.toMatchObject({
      status: 400,
    });
  });

  it('when the file is empty', async () => {
    const empty = { ...aJpegUpload, buffer: Buffer.alloc(0) };

    await expect(aShelfPhotosController().controller.store(empty)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('when the media type is not a supported image', async () => {
    const pdf = { ...aJpegUpload, mimetype: 'application/pdf' };

    await expect(aShelfPhotosController().controller.store(pdf)).rejects.toMatchObject({
      status: 400,
    });
  });

  // multer stops anything larger at the transport; one byte over reaches the domain rule.
  it('when the image is over 20 MB', async () => {
    const oversized = { ...aJpegUpload, buffer: Buffer.alloc(20 * 1024 * 1024 + 1) };

    await expect(aShelfPhotosController().controller.store(oversized)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('when the base64 payload is not valid base64', async () => {
    const body = { image: '!!!not base64!!!', mediaType: 'image/jpeg' };

    await expect(aShelfPhotosController().controller.store(undefined, body)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('ShelfPhotosController blames no photo for a failure of its own', () => {
  // A bucket that fails is not the caller's mistake: it must not read as a 400.
  it('lets a storage failure through as a server error', async () => {
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

  // A provider that is down is an upstream dependency failing, which is what 502 says.
  it('maps a scan failure to 502', async () => {
    const { controller } = aShelfPhotosController({
      scanner: {
        scan: async () => {
          throw new ShelfScanFailed('provider unavailable');
        },
      },
    });
    const { id } = await controller.store(aJpegUpload);

    await expect(controller.scan(id)).rejects.toMatchObject({ status: 502 });
  });
});
