import { ScanShelfUseCase } from '@pick-a-book/recognition-application';
import { ShelfScanFailed } from '@pick-a-book/recognition-domain';
import { StubShelfScannerAdapter } from '@pick-a-book/recognition-infrastructure';
import { describe, expect, it } from 'vitest';

import { ScanController } from './scan.controller';

/** A minimal valid JPEG header — `ShelfPhoto` only checks that the bytes are not empty. */
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const controllerWith = (scanner = new StubShelfScannerAdapter()) =>
  new ScanController(new ScanShelfUseCase(scanner));

const failingScanner = {
  scan: async (): Promise<never> => {
    throw new ShelfScanFailed('provider unavailable');
  },
};

describe('ScanController', () => {
  it('returns the detected books from an uploaded file', async () => {
    const result = await controllerWith().scan({ buffer: jpegBytes, mimetype: 'image/jpeg' });

    expect(result.books.length).toBeGreaterThan(0);
    expect(result.books[0]).toStrictEqual({
      author: 'Marguerite Duras',
      title: "L'Amant",
      confidence: 0.94,
    });
  });

  it('accepts a base64 JSON body when no file is uploaded', async () => {
    const result = await controllerWith().scan(undefined, {
      image: jpegBytes.toString('base64'),
      mediaType: 'image/jpeg',
    });

    expect(result.books.length).toBeGreaterThan(0);
  });

  // A provider failure is not the caller's fault: it is an upstream dependency being down,
  // which is what 502 says.
  it('maps a scan failure to 502', async () => {
    await expect(
      controllerWith(failingScanner).scan({ buffer: jpegBytes, mimetype: 'image/jpeg' }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe('ScanController rejects a bad request with 400', () => {
  it('when neither a file nor a body is given', async () => {
    await expect(controllerWith().scan()).rejects.toMatchObject({ status: 400 });
  });

  it('when the media type is not a supported image', async () => {
    await expect(
      controllerWith().scan({ buffer: jpegBytes, mimetype: 'application/pdf' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('when the image is empty', async () => {
    await expect(
      controllerWith().scan({ buffer: Buffer.alloc(0), mimetype: 'image/jpeg' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('when the base64 payload is not valid base64', async () => {
    const body = { image: '!!!not base64!!!', mediaType: 'image/jpeg' };

    await expect(controllerWith().scan(undefined, body)).rejects.toMatchObject({ status: 400 });
  });
});
