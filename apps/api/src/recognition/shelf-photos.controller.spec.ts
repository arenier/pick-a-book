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
