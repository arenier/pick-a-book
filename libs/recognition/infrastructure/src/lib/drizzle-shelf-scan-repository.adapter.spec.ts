import {
  ShelfScanAlreadyProcessed,
  ShelfScanId,
  ShelfScanNotFound,
} from '@pick-a-book/recognition-domain';
import { err, ok } from '@pick-a-book/shared-result';
import { describe, expect, it } from 'vitest';

import { aMigratedRepository, aNewScan, books, ownerId } from './testing/test-repository.js';

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

    await expect(repository.markCompleted(scan.id, books)).resolves.toStrictEqual(ok());

    const record = await repository.get(scan.id);
    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual(books);
  });

  // "No book on the shelf" is a result, not the absence of one.
  it('marks a pending record completed with no book at all', async () => {
    const scan = aNewScan();
    await repository.createPending(scan);

    await expect(repository.markCompleted(scan.id, [])).resolves.toStrictEqual(ok());

    const record = await repository.get(scan.id);
    expect(record?.status).toBe('completed');
    expect(record?.detectedBooks).toStrictEqual([]);
  });

  it('marks a pending record failed, without books', async () => {
    const scan = aNewScan();
    await repository.createPending(scan);

    await expect(repository.markFailed(scan.id)).resolves.toStrictEqual(ok());

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

    await expect(repository.markCompleted(completed.id, [])).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(completed.id)),
    );
    await expect(repository.markFailed(completed.id)).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(completed.id)),
    );
    await expect(repository.markCompleted(failed.id, books)).resolves.toStrictEqual(
      err(new ShelfScanAlreadyProcessed(failed.id)),
    );

    const record = await repository.get(completed.id);
    expect(record?.detectedBooks).toStrictEqual(books);
  });

  it('refuses to mark an id it never stored', async () => {
    const first = ShelfScanId.generate();
    const second = ShelfScanId.generate();

    await expect(repository.markCompleted(first, books)).resolves.toStrictEqual(
      err(new ShelfScanNotFound(first.value)),
    );
    await expect(repository.markFailed(second)).resolves.toStrictEqual(
      err(new ShelfScanNotFound(second.value)),
    );
  });
});

// US3, FR-015: everything about the stored photo is kept, and the name it came with names
// nothing.
describe('DrizzleShelfScanRepositoryAdapter, reference of the stored photo', () => {
  const { pool, repository } = aMigratedRepository();

  it('keeps the owner, media type, weight and original name as given', async () => {
    const scan = {
      ...aNewScan(),
      ownerId: ownerId('someone'),
      photoMediaType: 'image/heic' as const,
    };

    await repository.createPending(scan);

    await expect(repository.get(scan.id)).resolves.toMatchObject({
      ownerId: ownerId('someone'),
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

// The schema holds that a thumbnail is the only upload without a name (`uploads_source_or_filename_check`),
// but a nullable column no longer proves it to the type checker: a shelf photo row that has none is
// a corrupted row, said out loud rather than read as a photo with a missing name.
describe('DrizzleShelfScanRepositoryAdapter, reading a corrupted row', () => {
  const { pool, repository } = aMigratedRepository();

  it('refuses a shelf photo that has no original filename', async () => {
    const scan = aNewScan();
    await repository.createPending(scan);
    const orphan = ShelfScanId.generate();
    await pool.query(
      `insert into uploads (id, owner_id, type, bucket_key, media_type, size_bytes, source_upload_id)
       values ($1, 'default', 'shelf_photo', $2, 'image/jpeg', 10, $3)`,
      [orphan.value, `default/shelf_photo/${orphan.value}`, scan.id.value],
    );
    await pool.query("insert into shelf_scans (upload_id, status) values ($1, 'pending')", [
      orphan.value,
    ]);

    await expect(repository.get(orphan)).rejects.toThrow(/has no original filename/u);
  });
});
