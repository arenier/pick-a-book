import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  GetShelfPhotoImageUseCase,
  GetShelfScanUseCase,
  ListShelfScansUseCase,
  ScanStoredShelfPhotoUseCase,
  StoreShelfPhotoUseCase,
} from '@pick-a-book/recognition-application';
import type { ScanAttemptPolicy, ShelfScannerPort } from '@pick-a-book/recognition-domain';
import { afterAll, beforeAll } from 'vitest';

import { applyHttpBoundary } from '../../http/http-boundary';
import { ShelfPhotosController } from '../shelf-photos.controller';
import { aShelfPhotosController } from './shelf-photos-controller.fixture';

/**
 * The routes of `ShelfPhotosController` over real HTTP, for the specs about them. Excluded from
 * the app build (`tsconfig.app.json`).
 */
export const aJpeg = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });

/** The id out of a 201 body, proven rather than cast. */
export function idOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string') {
    throw new Error(`no id in ${JSON.stringify(body)}`);
  }
  return body.id;
}

/** The routes of the controller, on an ephemeral port, the way the API boots them. */
async function startApi(fixture: ReturnType<typeof aShelfPhotosController>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ShelfPhotosController],
    providers: [
      { provide: StoreShelfPhotoUseCase, useValue: fixture.storeShelfPhoto },
      { provide: ScanStoredShelfPhotoUseCase, useValue: fixture.scanStoredShelfPhoto },
      { provide: ListShelfScansUseCase, useValue: fixture.listShelfScans },
      { provide: GetShelfPhotoImageUseCase, useValue: fixture.getShelfPhotoImage },
      { provide: GetShelfScanUseCase, useValue: fixture.getShelfScan },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  // The API as it boots: the status codes below are the controller's work, their body the
  // global filter's.
  applyHttpBoundary(app, { webOrigin: 'http://localhost:4200' });
  await app.listen(0, '127.0.0.1');

  return { app, baseUrl: await app.getUrl() };
}

/**
 * The routes over real HTTP — status codes, multipart parsing by multer — on an
 * ephemeral port, the use cases running over in-memory ports. Called inside a `describe`.
 */
export function aRunningApi(scanner?: ShelfScannerPort, policy?: ScanAttemptPolicy) {
  let app: NestExpressApplication;
  let baseUrl = '';
  // The use cases and the ports under them, built once: the spec reads the doubles to prove what a
  // route did — or did not — change.
  const fixture = aShelfPhotosController({ scanner, policy });

  beforeAll(async () => {
    ({ app, baseUrl } = await startApi(fixture));
  });

  afterAll(async () => {
    await app.close();
  });

  const url = (path: string) => `${baseUrl}${path}`;

  return {
    url,
    scan: async (id: string) => fetch(url(`/shelf-photos/${id}/scan`), { method: 'POST' }),
    upload: async (file: Blob, name = 'IMG_0001.jpg', thumbnail?: Blob) => {
      const form = new FormData();
      form.append('photo', file, name);
      if (thumbnail !== undefined) {
        form.append('thumbnail', thumbnail, 'thumbnail.jpg');
      }
      return fetch(`${baseUrl}/shelf-photos`, { method: 'POST', body: form });
    },
    get: async (path: string) => fetch(url(path)),
    /** Loses the photo, the way a bucket can: the scan stays, its object is gone. */
    losePhotos: () => {
      fixture.objects.clear();
    },
    /** What the doubles hold, copied: two snapshots equal prove nothing was written between. */
    snapshot: () => ({
      records: new Map(fixture.records),
      attempts: fixture.repository.attempts,
      objects: new Map(fixture.objects),
      thumbnails: new Map(fixture.thumbnails),
    }),
  };
}
