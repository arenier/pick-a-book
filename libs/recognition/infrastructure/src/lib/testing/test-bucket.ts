import { Storage } from '@google-cloud/storage';
import { beforeAll } from 'vitest';

import { GcsShelfPhotoStorageAdapter } from '../storage/gcs-shelf-photo-storage.adapter.js';

/**
 * Runs against the GCS emulator (fake-gcs-server) of docker-compose, not a double: adapters
 * are tested against the real technology (CLAUDE.md). `docker compose up bucket` locally; CI
 * starts the same server.
 */
const emulatorHost = process.env['BUCKET_EMULATOR_HOST'] ?? 'http://localhost:4443';

const storage = new Storage({ apiEndpoint: emulatorHost, projectId: 'pick-a-book-test' });

/**
 * Called inside each `describe`: a fresh bucket, so no state leaks between runs sharing an
 * emulator.
 */
export function anAdapterOnAFreshBucket() {
  const bucket = storage.bucket(`shelf-photos-${crypto.randomUUID()}`);

  beforeAll(async () => {
    await bucket.create();
  });

  return { bucket, adapter: new GcsShelfPhotoStorageAdapter(bucket) };
}
