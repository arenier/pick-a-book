import {
  ShelfScanId,
  type NewShelfScan,
  type OwnerId,
  type StoredThumbnail,
} from '@pick-a-book/recognition-domain';
import { unwrap } from '@pick-a-book/shared-result';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import type { DrizzleShelfScanRepositoryAdapter } from './drizzle-shelf-scan-repository.adapter.js';
import {
  aMigratedRepository,
  aNewScan,
  anAttemptOn,
  books,
  ownerId,
} from '../testing/test-repository.js';

/**
 * The history against Postgres (specs/002-upload-history, research.md §4, §6): thumbnails as
 * `uploads` rows of their own, and a page of scans by cursor. Each test is its own owner, so
 * runs never see each other's scans.
 */
const anOwner = () => ownerId(`history-${crypto.randomUUID()}`);

const aThumbnailOf = (scan: NewShelfScan): StoredThumbnail => ({
  bucketKey: `${scan.ownerId.value}/shelf_photo_thumbnail/${scan.id.value}`,
  mediaType: 'image/jpeg',
  sizeBytes: 41_000,
});

describe('DrizzleShelfScanRepositoryAdapter, a thumbnail', () => {
  const { pool, repository } = aMigratedRepository();

  it('writes a second uploads row, derived from the photo, with no original name', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending({ ...scan, thumbnail: aThumbnailOf(scan) });

    const { rows } = await pool.query<Record<string, unknown>>(
      `select type, bucket_key, media_type, size_bytes, original_filename, source_upload_id
       from uploads where source_upload_id = $1`,
      [scan.id.value],
    );

    expect(rows).toStrictEqual([
      {
        type: 'shelf_photo_thumbnail',
        bucket_key: aThumbnailOf(scan).bucketKey,
        media_type: 'image/jpeg',
        size_bytes: 41_000,
        original_filename: null,
        source_upload_id: scan.id.value,
      },
    ]);
  });
});

describe('DrizzleShelfScanRepositoryAdapter, reading a thumbnail', () => {
  const { pool, repository } = aMigratedRepository();

  it('reads it back with the scan, and reads none for a scan sent without one', async () => {
    const owner = anOwner();
    const withThumbnail = aNewScan(owner);
    const without = aNewScan(owner);
    await repository.createPending({ ...withThumbnail, thumbnail: aThumbnailOf(withThumbnail) });
    await repository.createPending(without);

    await expect(repository.get(withThumbnail.id)).resolves.toMatchObject({
      thumbnail: aThumbnailOf(withThumbnail),
    });
    await expect(repository.get(without.id)).resolves.toMatchObject({ thumbnail: undefined });
  });

  // A thumbnail is not a scan: its own id finds nothing, and it is never listed.
  it('is never a scan of its own', async () => {
    const scan = aNewScan(anOwner());
    await repository.createPending({ ...scan, thumbnail: aThumbnailOf(scan) });
    const { rows } = await pool.query<{ id: string }>(
      "select id from uploads where type = 'shelf_photo_thumbnail' and source_upload_id = $1",
      [scan.id.value],
    );

    const page = await repository.list({ ownerId: scan.ownerId, limit: 10, after: undefined });

    expect(page.records.map((record) => record.id.value)).toStrictEqual([scan.id.value]);
    await expect(
      repository.get(unwrap(ShelfScanId.of(rows.map((row) => row.id).join()))),
    ).resolves.toBeUndefined();
  });
});

/** A scan of `owner` sent at `at`, created through the adapter and then dated. */
async function aScanAt(
  pool: Pool,
  repository: DrizzleShelfScanRepositoryAdapter,
  owner: OwnerId,
  at: string,
) {
  const scan = aNewScan(owner);
  await repository.createPending(scan);
  await pool.query('update uploads set created_at = $1 where id = $2', [
    new Date(at),
    scan.id.value,
  ]);

  return scan;
}

const idsOf = (page: { readonly records: readonly { readonly id: ShelfScanId }[] }) =>
  page.records.map((record) => record.id.value);

describe('DrizzleShelfScanRepositoryAdapter, listing the history', () => {
  const { pool, repository } = aMigratedRepository();

  it("lists one owner's photos, newest first, and nobody else's", async () => {
    const owner = anOwner();
    const oldest = await aScanAt(pool, repository, owner, '2026-09-01T10:00:00.000Z');
    const newest = await aScanAt(pool, repository, owner, '2026-09-03T10:00:00.000Z');
    const middle = await aScanAt(pool, repository, owner, '2026-09-02T10:00:00.000Z');
    await aScanAt(pool, repository, anOwner(), '2026-09-02T12:00:00.000Z');

    const page = await repository.list({ ownerId: owner, limit: 10, after: undefined });

    expect(idsOf(page)).toStrictEqual([newest.id.value, middle.id.value, oldest.id.value]);
  });

  // Two phones, one second: the id decides, highest first — the order the cursor compares by.
  it('tells two scans of the same instant apart by their id', async () => {
    const owner = anOwner();
    const first = await aScanAt(pool, repository, owner, '2026-09-01T10:00:00.000Z');
    const second = await aScanAt(pool, repository, owner, '2026-09-01T10:00:00.000Z');

    const page = await repository.list({ ownerId: owner, limit: 10, after: undefined });

    expect(idsOf(page)).toStrictEqual([first.id.value, second.id.value].toSorted().toReversed());
  });

  it('carries each scan whole: its status, its books, its thumbnail', async () => {
    const owner = anOwner();
    const scan = { ...aNewScan(owner), thumbnail: undefined };
    await repository.createPending({ ...scan, thumbnail: aThumbnailOf(scan) });
    await repository.markCompleted(scan.id, await anAttemptOn(repository, scan.id), books);

    const page = await repository.list({ ownerId: owner, limit: 10, after: undefined });

    expect(page.records).toStrictEqual([await repository.get(scan.id)]);
    expect(page.records[0]).toMatchObject({ status: 'completed', thumbnail: aThumbnailOf(scan) });
  });
});

/** Five scans an hour apart, newest first. */
async function fiveScans(
  pool: Pool,
  repository: DrizzleShelfScanRepositoryAdapter,
  owner: OwnerId,
) {
  const hours = ['10', '09', '08', '07', '06'];
  const scans = await Promise.all(
    hours.map(async (hour) => aScanAt(pool, repository, owner, `2026-09-01T${hour}:00:00.000Z`)),
  );

  return scans;
}

describe('DrizzleShelfScanRepositoryAdapter, paging by cursor', () => {
  const { pool, repository } = aMigratedRepository();

  it('has no next cursor on the last page, and the last scan of the page otherwise', async () => {
    const owner = anOwner();
    const scans = await fiveScans(pool, repository, owner);

    const first = await repository.list({ ownerId: owner, limit: 2, after: undefined });
    const all = await repository.list({ ownerId: owner, limit: 5, after: undefined });

    expect(first.next?.id.value).toBe(scans[1]?.id.value);
    expect(first.next?.createdAt).toStrictEqual(new Date('2026-09-01T09:00:00.000Z'));
    expect(all.next).toBeUndefined();
  });
});

describe('DrizzleShelfScanRepositoryAdapter, walking the pages', () => {
  const { pool, repository } = aMigratedRepository();

  it('walks the history in pages of 2, with no repeat and no gap', async () => {
    const owner = anOwner();
    const scans = await fiveScans(pool, repository, owner);

    const first = await repository.list({ ownerId: owner, limit: 2, after: undefined });
    const second = await repository.list({ ownerId: owner, limit: 2, after: first.next });
    const third = await repository.list({ ownerId: owner, limit: 2, after: second.next });

    expect([...idsOf(first), ...idsOf(second), ...idsOf(third)]).toStrictEqual(
      scans.map((scan) => scan.id.value),
    );
    expect(third.next).toBeUndefined();
  });

  // SC-003: what arrives while the user scrolls neither skips a scan nor shows one twice.
  it('does not shift a page when a newer scan arrives between two pages', async () => {
    const owner = anOwner();
    const scans = await fiveScans(pool, repository, owner);
    const first = await repository.list({ ownerId: owner, limit: 2, after: undefined });
    await aScanAt(pool, repository, owner, '2026-09-02T10:00:00.000Z');

    const second = await repository.list({ ownerId: owner, limit: 2, after: first.next });

    expect(idsOf(second)).toStrictEqual([scans[2]?.id.value, scans[3]?.id.value]);
  });
});
