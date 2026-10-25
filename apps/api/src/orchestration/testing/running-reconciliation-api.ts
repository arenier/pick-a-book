import type { NestExpressApplication } from '@nestjs/platform-express';
import { Pool } from 'pg';
import { afterAll, beforeAll } from 'vitest';

import { aJpeg, idOf } from '../../recognition/testing/running-api';
import { DATABASE_URL, InMemoryShelfScanRepository } from './reconciliation-doubles';
import { startReconciliationApp, type ReconciliationApiOptions } from './reconciliation-app';

let sources = 0;

/** A source of its own for each request, so that the limit by source never trips a spec. */
const aSource = () => `10.3.${Math.floor(sources / 250)}.${(sources++ % 250) + 1}`;

/**
 * The real application over real HTTP, for the specs of the reconciliation (see
 * `startReconciliationApp`). Excluded from the app build (`tsconfig.app.json`). Called inside a
 * `describe`.
 */
export function aRunningReconciliationApi(options: ReconciliationApiOptions = {}) {
  let app: NestExpressApplication;
  let baseUrl = '';
  const scans = new InMemoryShelfScanRepository();
  const pool = new Pool({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    ({ app, baseUrl } = await startReconciliationApp(options, pool, scans));
  });

  afterAll(async () => {
    await app.close();
  });

  const call = async (method: string, path: string, body?: unknown) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'x-forwarded-for': aSource(), 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const upload = async () => uploadedPhoto(baseUrl);

  return {
    scans,
    pool,
    /** Uploads a photo and has it analysed: the id of an analysis that completed. */
    completedScan: async () => {
      const id = await upload();
      await call('POST', `/shelf-photos/${id}/scan`);

      return id;
    },
    /** Uploads a photo and leaves it at that: an analysis that never started. */
    uploadedPhoto: upload,
    reconcile: async (id: string) => call('POST', `/shelf-photos/${id}/reconciliation`),
    read: async (id: string) => call('GET', `/shelf-photos/${id}/reconciliation`),
    get: async (path: string) => call('GET', path),
    post: async (path: string, body?: unknown) => call('POST', path, body),
  };
}

async function uploadedPhoto(baseUrl: string): Promise<string> {
  const form = new FormData();
  form.append('photo', aJpeg(), 'IMG_0001.jpg');
  const response = await fetch(`${baseUrl}/shelf-photos`, {
    method: 'POST',
    body: form,
    headers: { 'x-forwarded-for': aSource() },
  });

  return idOf(await response.json());
}
