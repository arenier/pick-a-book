import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  OwnerId,
  ShelfScanId,
  type NewShelfScan,
  type ScanAttemptId,
  type ScanAttemptPolicy,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import { Pool } from 'pg';
import { afterAll, beforeAll } from 'vitest';

import { DrizzleShelfScanRepositoryAdapter } from '../drizzle-shelf-scan-repository.adapter.js';
import { migrateDatabase } from '../migrate-database.js';
import { MIGRATIONS_FOLDER, testDatabaseUrl } from '../drizzle/test-database.js';

/**
 * Runs against the Postgres of docker-compose, migrated with the committed migrations — the
 * same SQL the API applies at boot. Every test works on fresh ids, so runs never collide.
 *
 * Called inside each `describe`: registers the migration and the teardown of its own pool.
 */
export function aMigratedRepository() {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  beforeAll(async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);
  });

  afterAll(async () => {
    await pool.end();
  });

  return { pool, repository: new DrizzleShelfScanRepositoryAdapter(pool) };
}

export const ownerId = (raw: string) => unwrap(OwnerId.of(raw));

export const aNewScan = (owner = ownerId('default')): NewShelfScan => {
  const id = ShelfScanId.generate();

  return {
    id,
    ownerId: owner,
    photoBucketKey: `${owner.value}/shelf_photo/${id.value}`,
    photoMediaType: 'image/jpeg',
    photoSizeBytes: 2_345_678,
    originalFilename: 'IMG_0001.jpg',
  };
};

export const books = [
  DetectedBook.of(
    unwrap(Author.of('Annie Ernaux')),
    unwrap(BookTitle.of('La Place')),
    unwrap(Confidence.of(0.71)),
  ),
  DetectedBook.of(undefined, unwrap(BookTitle.of('Les Choses')), unwrap(Confidence.of(0.4))),
];

/** What an analysis is allowed here: the cap and the lease of the specs that do not test them. */
export const anyPolicy = {
  dailyLimit: 1_000,
  timeZone: 'Europe/Paris',
  lease: 300_000,
} satisfies ScanAttemptPolicy;

/** The attempt an analysis of the scan reserved — what a scan is settled with. */
export async function anAttemptOn(
  repository: DrizzleShelfScanRepositoryAdapter,
  id: ShelfScanId,
): Promise<ScanAttemptId> {
  return unwrap(await repository.startAttempt(id, anyPolicy));
}
