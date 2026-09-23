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
 * ephemeral port, the use cases running over in-memory ports.
 */
describe('POST /shelf-photos then POST /shelf-photos/:id/scan', () => {
  let app: INestApplication;
  let baseUrl: string;

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

  const upload = async (file: Blob, name = 'IMG_0001.jpg') => {
    const form = new FormData();
    form.append('photo', file, name);
    return fetch(`${baseUrl}/shelf-photos`, { method: 'POST', body: form });
  };

  // A stored photo is a resource coming into being; a scan creates nothing.
  it('answers 201 with an id, then 200 with the books', async () => {
    const stored = await upload(aJpeg());
    const body: unknown = await stored.json();

    expect(stored.status).toBe(201);
    expect(body).toStrictEqual({ id: idOf(body) });

    const scanned = await fetch(`${baseUrl}/shelf-photos/${idOf(body)}/scan`, { method: 'POST' });

    const result: unknown = await scanned.json();
    expect(scanned.status).toBe(200);
    expect(result).toHaveProperty('books.length', 4);
  });
});
