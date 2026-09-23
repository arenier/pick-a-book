import {
  Author,
  BookTitle,
  Confidence,
  DetectedBook,
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanNotFound,
  type NewShelfScan,
} from '@pick-a-book/recognition-domain';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleShelfScanRepositoryAdapter } from './drizzle-shelf-scan-repository.adapter.js';
import { MIGRATIONS_FOLDER, testDatabaseUrl } from './drizzle/test-database.js';
import { migrateDatabase } from './migrate-database.js';

/**
 * Runs against the Postgres of docker-compose, migrated with the committed migrations — the
 * same SQL the API applies at boot. Every test works on fresh ids, so runs never collide.
 *
 * Called inside each `describe`: registers the migration and the teardown of its own pool.
 */
function aMigratedRepository() {
  const pool = new Pool({ connectionString: testDatabaseUrl });

  beforeAll(async () => {
    await migrateDatabase(pool, MIGRATIONS_FOLDER);
  });

  afterAll(async () => {
    await pool.end();
  });

  return { pool, repository: new DrizzleShelfScanRepositoryAdapter(pool) };
}

const aNewScan = (): NewShelfScan => {
  const id = ShelfScanId.generate();

  return {
    id,
    ownerId: 'default',
    photoBucketKey: `default/shelf_photo/${id.value}`,
    photoMediaType: 'image/jpeg',
    photoSizeBytes: 2_345_678,
    originalFilename: 'IMG_0001.jpg',
  };
};

const books = [
  DetectedBook.of(Author.of('Annie Ernaux'), BookTitle.of('La Place'), Confidence.of(0.71)),
  DetectedBook.of(undefined, BookTitle.of('Les Choses'), Confidence.of(0.4)),
];

describe('DrizzleShelfScanRepositoryAdapter, creating a record', () => {
  const { pool, repository } = aMigratedRepository();

  it('creates a pending record that reads back whole', async () => {
    const scan = aNewScan();

    await repository.createPending(scan);

    const record = await repository.get(scan.id);
    expect(record).toStrictEqual({
      ...scan,
      id: scan.id,
      status: 'pending',
      detectedBooks: undefined,
      createdAt: record?.createdAt,
    });
    expect(record?.createdAt).toBeInstanceOf(Date);
  });

  // research.md §8: the file reference goes to the generic `uploads` table, the scan state to
  // `shelf_scans`, linked by `upload_id` — and the id that circulates is the upload's.
  it('writes one uploads row and one shelf_scans row pointing at it', async () => {
    const scan = aNewScan();

    await repository.createPending(scan);

    const { rows } = await pool.query<{ type: string; bucket_key: string; status: string }>(
      `select u.type, u.bucket_key, s.status
       from uploads u join shelf_scans s on s.upload_id = u.id
       where u.id = $1`,
      [scan.id.value],
    );
    expect(rows).toStrictEqual([
      { type: 'shelf_photo', bucket_key: scan.photoBucketKey, status: 'pending' },
    ]);
  });
});

describe('DrizzleShelfScanRepositoryAdapter, identity of a record', () => {
  const { repository } = aMigratedRepository();

  it('refuses a second record for the same id, leaving the first one alone', async () => {
    const scan = aNewScan();
    await repository.createPending(scan);

    await expect(
      repository.createPending({ ...scan, originalFilename: 'other.jpg' }),
    ).rejects.toThrow(Error);

    const record = await repository.get(scan.id);
    expect(record?.originalFilename).toBe('IMG_0001.jpg');
  });

  it('reads nothing for an id it never stored', async () => {
    await expect(repository.get(ShelfScanId.generate())).resolves.toBeUndefined();
  });
});

describe('DrizzleShelfScanRepositoryAdapter, recording a result', () => {
  const { repository } = aMigratedRepository();

  it('marks a pending record completed, with its books', async () => {
    const scan = aNewScan();
    await repository.createPending(scan);

    await repository.markCompleted(scan.id, books);

    const record = await repository.get(scan.id);
    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual(books);
  });

  // "No book on the shelf" is a result, not the absence of one.
  it('marks a pending record completed with no book at all', async () => {
    const scan = aNewScan();
    await repository.createPending(scan);

    await repository.markCompleted(scan.id, []);

    const record = await repository.get(scan.id);
    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual([]);
  });

  it('marks a pending record failed, without books', async () => {
    const scan = aNewScan();
    await repository.createPending(scan);

    await repository.markFailed(scan.id);

    const record = await repository.get(scan.id);
    expect(record?.status).toBe('failed');
    expect(record?.detectedBooks).toBeUndefined();
  });
});

describe('DrizzleShelfScanRepositoryAdapter, recording a result only once', () => {
  const { repository } = aMigratedRepository();

  // The 409 of research.md §7, held where the write happens: a result is recorded once.
  it('refuses to move a record that is no longer pending', async () => {
    const completed = aNewScan();
    await repository.createPending(completed);
    await repository.markCompleted(completed.id, books);

    const failed = aNewScan();
    await repository.createPending(failed);
    await repository.markFailed(failed.id);

    await expect(repository.markCompleted(completed.id, [])).rejects.toThrow(
      ShelfScanAlreadyProcessed,
    );
    await expect(repository.markFailed(completed.id)).rejects.toThrow(ShelfScanAlreadyProcessed);
    await expect(repository.markCompleted(failed.id, books)).rejects.toThrow(
      ShelfScanAlreadyProcessed,
    );

    const record = await repository.get(completed.id);
    expect(record?.detectedBooks).toStrictEqual(books);
  });

  it('refuses to mark an id it never stored', async () => {
    await expect(repository.markCompleted(ShelfScanId.generate(), books)).rejects.toThrow(
      ShelfScanNotFound,
    );
    await expect(repository.markFailed(ShelfScanId.generate())).rejects.toThrow(ShelfScanNotFound);
  });
});

// US3, FR-015: everything about the stored photo is kept, and the name it came with names
// nothing.
describe('DrizzleShelfScanRepositoryAdapter, reference of the stored photo', () => {
  const { pool, repository } = aMigratedRepository();

  it('keeps the owner, media type, weight and original name as given', async () => {
    const scan = { ...aNewScan(), ownerId: 'someone', photoMediaType: 'image/heic' as const };

    await repository.createPending(scan);

    await expect(repository.get(scan.id)).resolves.toMatchObject({
      ownerId: 'someone',
      photoMediaType: 'image/heic',
      photoSizeBytes: 2_345_678,
      originalFilename: 'IMG_0001.jpg',
    });
  });

  it('never writes the original name into the bucket key column', async () => {
    const scan = aNewScan();

    await repository.createPending(scan);

    const { rows } = await pool.query<{ bucket_key: string }>(
      'select bucket_key from uploads where id = $1',
      [scan.id.value],
    );
    expect(rows[0]?.bucket_key).not.toContain(scan.originalFilename);
  });
});
